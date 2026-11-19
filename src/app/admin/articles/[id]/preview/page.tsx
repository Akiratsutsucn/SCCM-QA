/** 草稿预览：必须登录，响应 no-store（proxy 对 /admin 统一设置）。 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getArticle } from '@/lib/articles';
import { ContentSchema } from '@/lib/content';
import { ArticleBody } from '@/components/ArticleBody';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = { title: '预览（草稿）', robots: { index: false } };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const db = await getDb();
  const a = await getArticle(db, Number((await params).id));
  if (!a) notFound();
  const c = ContentSchema.parse(a.draft);
  const ids = c.steps.flatMap((s) => s.mediaIds);
  const revs = ids.length ? await db.query<{ id: string; rev: number }>('SELECT id, rev FROM media WHERE id = ANY($1::text[])', [ids]) : [];
  return (
    <Shell>
      <p className="notice" style={{ marginBottom: 18 }}>这是草稿预览，只有已登录管理员能看到。内部备注不会出现在操作端。</p>
      <ArticleBody c={c} reviewedAt={a.reviewed_at} mediaRev={new Map(revs.map((r) => [r.id, r.rev]))} />
    </Shell>
  );
}
