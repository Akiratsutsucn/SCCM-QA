/**
 * 导入第一批 QA（seed/known-issues.json）为草稿文章 + 草稿引导树。不会发布，也不会覆盖已有内容。
 * 用法：DATABASE_URL=... npx tsx scripts/import-known-issues.ts [--publish]
 *   --publish：导入后直接发布文章与引导（仅在管理员已复核 JSON 内容后使用）。
 *   --refresh：已存在的同标题文章用 JSON 内容覆盖草稿（已发布的会重新发布为新版本）。
 *   --replace-guide：删除现有引导树后按 JSON 重建（会丢失管理员对引导的修改）。
 * 幂等：按文章标题判断，已存在同标题文章则跳过；引导树已有节点则不导入引导。
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb, type Db } from '../src/lib/db';
import { bootstrap } from '../src/lib/bootstrap';
import { ContentSchema } from '../src/lib/content';
import { createArticle, publishArticle, saveDraft } from '../src/lib/articles';
import { mainTree, publishTree } from '../src/lib/guides';

interface Seed {
  articles: (Record<string, unknown> & { key: string; title: string; oldTitles?: string[] })[];
  guide: { root: string; nodes: Record<string, { kind: 'q' | 't'; title: string; options?: [string, string, boolean?][]; articles?: string[] }> };
}

const ACTOR = 'import:known-issues';

async function importArticles(db: Db, seed: Seed, publish: boolean, refresh: boolean) {
  const ids = new Map<string, number>();
  for (const raw of seed.articles) {
    // 按现标题或旧标题（oldTitles）匹配，改标题后不会重复建文章
    const existing = await db.query<{ id: number; status: string }>(`SELECT id, status FROM articles WHERE draft->>'title' = ANY($1::text[]) ORDER BY id LIMIT 1`, [[raw.title, ...(raw.oldTitles ?? [])]]);
    if (existing[0]) {
      ids.set(raw.key, existing[0].id);
      if (refresh) {
        const { key: _k, oldTitles: _o, ...f } = raw;
        await saveDraft(db, existing[0].id, ContentSchema.parse(f));
        if (existing[0].status === 'published') await publishArticle(db, existing[0].id, ACTOR, { redactionConfirmed: true, note: '种子更新' });
        console.log(`已更新：${raw.title}`);
      } else {
        console.log(`跳过（已存在）：${raw.title}`);
      }
      continue;
    }
    const { key: _key, oldTitles: _old, ...fields } = raw;
    const content = ContentSchema.parse(fields);
    const a = await createArticle(db, content);
    ids.set(raw.key, a.id);
    if (publish) {
      const r = await publishArticle(db, a.id, ACTOR, { redactionConfirmed: true, note: '第一批导入' });
      console.log(r.ok ? `已发布：${content.title}` : `未通过发布校验（保留草稿）：${content.title} → ${r.issues.map((i) => i.message).join('；')}`);
    } else {
      console.log(`已导入草稿：${content.title}`);
    }
  }
  return ids;
}

async function importGuide(db: Db, seed: Seed, ids: Map<string, number>, publish: boolean) {
  const tree = await mainTree(db);
  const n = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM guide_nodes WHERE tree_id = $1', [tree.id]))[0].n;
  if (n > 0 && !process.argv.includes('--replace-guide')) {
    console.log('引导树已有节点，跳过引导导入（要覆盖请加 --replace-guide，会删除管理员对引导的修改）。');
    return;
  }
  if (n > 0) {
    await db.query('UPDATE guide_trees SET root_node_id = NULL WHERE id = $1', [tree.id]);
    await db.query('DELETE FROM guide_nodes WHERE tree_id = $1', [tree.id]);
    await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'guide.replace', '{}'::jsonb)`, [ACTOR]);
    console.log(`已删除原引导树 ${n} 个节点`);
  }
  const nodeIds = new Map<string, number>();
  for (const [key, node] of Object.entries(seed.guide.nodes)) {
    const articleIds = (node.articles ?? []).map((k) => ids.get(k)).filter((x): x is number => !!x);
    const r = await db.query<{ id: number }>(
      'INSERT INTO guide_nodes (tree_id, kind, title, article_ids, sort) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [tree.id, node.kind === 'q' ? 'question' : 'terminal', node.title, articleIds, nodeIds.size],
    );
    nodeIds.set(key, r[0].id);
  }
  for (const [key, node] of Object.entries(seed.guide.nodes)) {
    for (const [i, [label, target, unsure]] of (node.options ?? []).entries()) {
      const [kind, ref] = target.includes(':') ? target.split(':') : ['n', target];
      const targetNode = kind === 'n' || kind === 't' ? nodeIds.get(ref) ?? null : null;
      const targetArticle = kind === 'a' ? ids.get(ref) ?? null : null;
      await db.query(
        'INSERT INTO guide_options (node_id, label, sort, is_unsure, target_node_id, target_article_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [nodeIds.get(key), label, unsure ? 999 : i, !!unsure, targetNode, targetArticle],
      );
    }
  }
  await db.query('UPDATE guide_trees SET root_node_id = $2 WHERE id = $1', [tree.id, nodeIds.get(seed.guide.root)]);
  console.log(`已导入引导树草稿：${nodeIds.size} 个节点`);
  if (publish) {
    const r = await publishTree(db, tree.id, ACTOR);
    console.log(r.ok ? '引导已发布' : `引导未发布：${r.issues.map((i) => i.message).join('；')}`);
  }
}

async function main() {
  const publish = process.argv.includes('--publish');
  const file = path.resolve(process.env.SEED_FILE || path.join(__dirname, '../seed/known-issues.json'));
  const seed = JSON.parse(fs.readFileSync(file, 'utf8')) as Seed;
  const db = await openDb(process.env.DATABASE_URL || 'pglite:./data/dev');
  await bootstrap(db);
  const ids = await importArticles(db, seed, publish, process.argv.includes('--refresh'));
  await importGuide(db, seed, ids, publish);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
