/** 文章仓储：草稿、发布（生成版本快照）、归档、恢复旧版、公开读取。 */
import type { Db } from './db';
import { ContentSchema, contentCodes, newSlug, searchText, validateForPublish, type Content, type PublishIssue } from './content';
import { refreshMediaVisibility } from './media';

export interface ArticleRow {
  id: number;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  draft: Content;
  published: Content | null;
  published_version: number | null;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string;
}

export async function createArticle(db: Db, content: Content): Promise<ArticleRow> {
  const rows = await db.query<ArticleRow>(
    `INSERT INTO articles (slug, draft, stage) VALUES ($1, $2::jsonb, $3) RETURNING *`,
    [newSlug(), JSON.stringify(ContentSchema.parse(content)), content.stage || null],
  );
  return rows[0];
}

export async function saveDraft(db: Db, id: number, content: Content) {
  await db.query(`UPDATE articles SET draft = $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(ContentSchema.parse(content))]);
}

export async function getArticle(db: Db, id: number): Promise<ArticleRow | null> {
  return (await db.query<ArticleRow>('SELECT * FROM articles WHERE id = $1', [id]))[0] ?? null;
}

/** 操作端：只返回已发布内容；已归档返回 archived 标记（显示「已下线」）。 */
export async function getPublicArticle(db: Db, slug: string): Promise<{ id: number; content: Content; reviewedAt: string | null } | 'archived' | null> {
  const r = (await db.query<ArticleRow>('SELECT id, status, published, reviewed_at FROM articles WHERE slug = $1', [slug]))[0];
  if (!r) return null;
  if (r.status === 'archived') return 'archived';
  if (r.status !== 'published' || !r.published) return null;
  return { id: r.id, content: r.published, reviewedAt: r.reviewed_at };
}

export async function stageLabels(db: Db): Promise<string[]> {
  return (await db.query<{ label: string }>(`SELECT label FROM vocabularies WHERE kind = 'stage' AND active ORDER BY sort, id`)).map((r) => r.label);
}

export async function publishArticle(
  db: Db, id: number, actor: string, opts: { redactionConfirmed: boolean; note: string },
): Promise<{ ok: true; version: number } | { ok: false; issues: PublishIssue[] }> {
  const a = await getArticle(db, id);
  if (!a) return { ok: false, issues: [{ field: 'id', message: '文章不存在' }] };
  const content = ContentSchema.parse(a.draft);
  const issues = validateForPublish(content, { redactionConfirmed: opts.redactionConfirmed, validStages: await stageLabels(db) });
  if (issues.length) return { ok: false, issues };
  const version = await db.tx(async (q) => {
    const v = (await q.query<{ n: number }>('SELECT coalesce(max(version_no), 0) + 1 AS n FROM article_versions WHERE article_id = $1', [id]))[0].n;
    await q.query(
      `INSERT INTO article_versions (article_id, version_no, content, note, created_by) VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [id, v, JSON.stringify(content), opts.note.slice(0, 300), actor],
    );
    await q.query(
      `UPDATE articles SET status = 'published', published = $2::jsonb, published_version = $3, search_text = $4, stage = $5,
              reviewed_at = (now() AT TIME ZONE 'Asia/Shanghai')::date, published_at = now(), updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(content), v, searchText(content), content.stage],
    );
    await q.query('DELETE FROM article_codes WHERE article_id = $1', [id]);
    for (const code of contentCodes(content)) {
      await q.query('INSERT INTO article_codes (article_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, code]);
    }
    await q.query('DELETE FROM article_tags WHERE article_id = $1', [id]);
    for (const tag of new Set([...content.tags, ...content.symptoms].map((t) => t.trim()).filter(Boolean))) {
      await q.query('INSERT INTO article_tags (article_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tag]);
    }
    await q.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'article.publish', $2::jsonb)`, [actor, JSON.stringify({ id, version: v })]);
    return v;
  });
  await refreshMediaVisibility(db);
  return { ok: true, version };
}

export async function archiveArticle(db: Db, id: number, actor: string) {
  await db.query(`UPDATE articles SET status = 'archived', updated_at = now() WHERE id = $1`, [id]);
  await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'article.archive', $2::jsonb)`, [actor, JSON.stringify({ id })]);
  await refreshMediaVisibility(db);
}

/** 恢复旧版 = 把历史版本复制为当前草稿；发布后成为新版本，历史不删。 */
export async function restoreVersion(db: Db, id: number, versionNo: number, actor: string) {
  const v = (await db.query<{ content: Content }>('SELECT content FROM article_versions WHERE article_id = $1 AND version_no = $2', [id, versionNo]))[0];
  if (!v) return false;
  await saveDraft(db, id, v.content);
  await db.query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1, 'article.restore_to_draft', $2::jsonb)`, [actor, JSON.stringify({ id, versionNo })]);
  return true;
}

export async function listVersions(db: Db, id: number) {
  return db.query<{ version_no: number; note: string; created_by: string; created_at: string }>(
    'SELECT version_no, note, created_by, created_at FROM article_versions WHERE article_id = $1 ORDER BY version_no DESC', [id],
  );
}

export async function recentPublished(db: Db, limit = 5) {
  return db.query<{ slug: string; title: string; published_at: string }>(
    `SELECT slug, published->>'title' AS title, published_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT $1`, [limit],
  );
}

export async function publishedSummaries(db: Db, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db.query<{ id: number; slug: string; published: Content }>(
    `SELECT id, slug, published FROM articles WHERE status = 'published' AND id = ANY($1::int[])`, [ids],
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => ({ id: r.id, slug: r.slug, title: r.published.title, summary: r.published.summary, stage: r.published.stage, appliesTo: r.published.appliesTo }));
}
