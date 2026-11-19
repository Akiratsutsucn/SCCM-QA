/** 解决办法页：先看适用/不适用/风险/止步，再看单列步骤；底部「这一次排障」反馈。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { Shell } from '@/components/Shell';
import { ArticleBody } from '@/components/ArticleBody';
import { FeedbackBar } from '@/components/client/FeedbackBar';
import { BackButton } from '@/components/client/Track';
import { getDb } from '@/lib/db';
import { getPublicArticle } from '@/lib/articles';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; p?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getPublicArticle(await getDb(), (await params).slug);
  return { title: r && r !== 'archived' ? r.content.title : '解决办法' };
}

function Gone({ archived }: { archived: boolean }) {
  return (
    <Shell>
      <div className="card empty">
        <p>{archived ? '该办法已下线，请改用搜索或排查引导。' : '没有找到这篇办法，可能尚未发布或地址有误。'}</p>
        <div className="row">
          <Link className="btn btn-primary" href="/">回首页搜索</Link>
          <Link className="btn" href="/guide">按步骤排查</Link>
        </div>
      </div>
    </Shell>
  );
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const [{ slug }, { from, p }] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const r = await getPublicArticle(db, slug);
  if (!r) return <Gone archived={false} />;
  if (r === 'archived') return <Gone archived />;
  const ids = r.content.steps.flatMap((s) => s.mediaIds);
  const revs = ids.length
    ? await db.query<{ id: string; rev: number }>('SELECT id, rev FROM media WHERE id = ANY($1::text[]) AND is_public', [ids])
    : [];
  const visible = new Map(revs.map((m) => [m.id, m.rev]));
  const content = { ...r.content, steps: r.content.steps.map((s) => ({ ...s, mediaIds: s.mediaIds.filter((id) => visible.has(id)) })) };
  let guideBack: string | null = null;
  if (from === 'guide' && p) {
    const [nodeId, trail] = p.split(':');
    if (/^\d+$/.test(nodeId)) guideBack = `/guide/${nodeId}${trail ? `?p=${encodeURIComponent(trail.split(',').slice(0, -1).join(','))}` : ''}`;
  }

  return (
    <Shell>
      <div className="subbar split">
        <BackButton />
        <span className="row">
          <Link className="btn btn-quiet btn-sm" href="/gallery">看图找问题</Link>
          <Link className="btn btn-quiet btn-sm" href="/guide">按步骤排查</Link>
        </span>
      </div>
      {guideBack && (
        <p className="trail" style={{ marginBottom: 12 }}>根据你刚才在排查引导中的选择。<Link href={guideBack}>回到引导</Link></p>
      )}
      <ArticleBody c={content} reviewedAt={r.reviewedAt} mediaRev={visible} />
      <FeedbackBar articleId={r.id} />
    </Shell>
  );
}
