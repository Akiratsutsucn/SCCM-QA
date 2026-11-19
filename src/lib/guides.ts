/** 引导树仓储：编辑数据在 guide_nodes / guide_options；发布时校验并写入只读快照，操作端只读快照。 */
import type { Db } from './db';
import { validateGuide, type GuideIssue, type GuideNode, type GuideSnapshot } from './guide';

export async function mainTree(db: Db) {
  return (await db.query<{ id: number; name: string; root_node_id: number | null; published_snapshot: GuideSnapshot | null; published_at: string | null; updated_at: string }>(
    'SELECT * FROM guide_trees ORDER BY id LIMIT 1',
  ))[0];
}

export async function loadNodes(db: Db, treeId: number): Promise<GuideNode[]> {
  const nodes = await db.query<{ id: number; kind: 'question' | 'terminal'; title: string; article_ids: number[] }>(
    'SELECT id, kind, title, article_ids FROM guide_nodes WHERE tree_id = $1 ORDER BY sort, id', [treeId],
  );
  const opts = await db.query<{ id: number; node_id: number; label: string; is_unsure: boolean; target_node_id: number | null; target_article_id: number | null }>(
    `SELECT o.* FROM guide_options o JOIN guide_nodes n ON n.id = o.node_id WHERE n.tree_id = $1 ORDER BY o.is_unsure, o.sort, o.id`, [treeId],
  );
  return nodes.map((n) => ({
    id: n.id, kind: n.kind, title: n.title, articleIds: n.article_ids ?? [],
    options: opts.filter((o) => o.node_id === n.id).map((o) => ({
      id: o.id, label: o.label, isUnsure: o.is_unsure, targetNodeId: o.target_node_id, targetArticleId: o.target_article_id,
    })),
  }));
}

async function publishedIds(db: Db): Promise<Set<number>> {
  return new Set((await db.query<{ id: number }>(`SELECT id FROM articles WHERE status = 'published'`)).map((r) => r.id));
}

export async function checkTree(db: Db, treeId: number): Promise<GuideIssue[]> {
  const tree = (await db.query<{ root_node_id: number | null }>('SELECT root_node_id FROM guide_trees WHERE id = $1', [treeId]))[0];
  return validateGuide(tree?.root_node_id ?? null, await loadNodes(db, treeId), await publishedIds(db));
}

export async function publishTree(db: Db, treeId: number, actor: string): Promise<{ ok: boolean; issues: GuideIssue[] }> {
  const issues = await checkTree(db, treeId);
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues };
  const tree = (await db.query<{ name: string; root_node_id: number }>('SELECT name, root_node_id FROM guide_trees WHERE id = $1', [treeId]))[0];
  const nodes = await loadNodes(db, treeId);
  const snapshot: GuideSnapshot = { treeId, name: tree.name, rootId: tree.root_node_id, nodes: Object.fromEntries(nodes.map((n) => [String(n.id), n])) };
  await db.query('UPDATE guide_trees SET published_snapshot = $2::jsonb, published_at = now() WHERE id = $1', [treeId, JSON.stringify(snapshot)]);
  await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'guide.publish', $2::jsonb)`, [actor, JSON.stringify({ treeId, nodes: nodes.length })]);
  return { ok: true, issues };
}

export async function unpublishTree(db: Db, treeId: number, actor: string) {
  await db.query('UPDATE guide_trees SET published_snapshot = NULL, published_at = NULL WHERE id = $1', [treeId]);
  await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'guide.unpublish', $2::jsonb)`, [actor, JSON.stringify({ treeId })]);
}

/** 已发布快照；快照中引用的文章若后来被归档，操作端显示时会过滤掉。 */
export async function publishedGuide(db: Db): Promise<GuideSnapshot | null> {
  return (await mainTree(db))?.published_snapshot ?? null;
}
