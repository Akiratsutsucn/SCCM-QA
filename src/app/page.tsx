/**
 * 操作端只有这一页。
 *   顶部：搜索框
 *   主区域（最大）：问题分支选择 → 办法；或搜索结果
 *   侧栏：管理员公告、遇到最多排名
 * 状态都在 URL（q / a / n / p），浏览器返回即可回到上一步。
 */
import { cookies, headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { getPublicArticle, publishedSummaries } from '@/lib/articles';
import { activeAnnouncements } from '@/lib/announcements';
import { publishedGuide } from '@/lib/guides';
import { search } from '@/lib/search';
import { logSearch } from '@/lib/events';
import { hashSession, isValidSessionId } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { topEncounters } from '@/lib/stats';
import { SearchBox, TellAdmin } from '@/components/client/QuickFeedback';
import { GuidePanel } from '@/components/home/GuidePanel';
import { Results } from '@/components/home/Results';
import { Answer } from '@/components/home/Answer';
import { ErrorCodeHint, Notices, Ranking } from '@/components/home/Side';
import { homeHref } from '@/components/home/url';

type Props = { searchParams: Promise<{ q?: string; k?: string; a?: string; n?: string; p?: string }> };

async function logIfSubmitted(q: string, k: string | undefined, count: number) {
  if (!k || !/^[0-9a-f]{16}$/.test(k) || !q) return;
  const h = await headers();
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!rateLimit(`search:${ip}`, 60, 60_000)) return;
  const sid = (await cookies()).get('w11s')?.value;
  await logSearch(await getDb(), { submitKey: k, sessionHash: isValidSessionId(sid) ? hashSession(sid) : null, query: q, resultCount: count });
}

async function MainArea({ sp }: { sp: Awaited<Props['searchParams']> }) {
  const db = await getDb();
  const g = await publishedGuide(db);

  if (sp.a) {
    const r = await getPublicArticle(db, String(sp.a).slice(0, 40));
    const back = sp.q ? { href: homeHref({ q: sp.q }), label: '回到搜索结果' } : sp.n ? { href: homeHref({ n: Number(sp.n), p: sp.p }), label: '上一步' } : { href: '/', label: '回到选择' };
    if (!r || r === 'archived') {
      return <div className="empty-box"><p>{r === 'archived' ? '这个办法已下线。' : '没有这个办法。'}</p><a className="btn" href="/">回到选择</a></div>;
    }
    const ids = r.content.steps.flatMap((s) => s.mediaIds);
    const revs = ids.length ? await db.query<{ id: string; rev: number }>('SELECT id, rev FROM media WHERE id = ANY($1::text[]) AND is_public', [ids]) : [];
    const visible = new Map(revs.map((m) => [m.id, m.rev]));
    const content = { ...r.content, steps: r.content.steps.map((s) => ({ ...s, mediaIds: s.mediaIds.filter((m) => visible.has(m)) })) };
    return <Answer id={r.id} c={content} reviewedAt={r.reviewedAt} mediaRev={visible} backHref={back.href} backLabel={back.label} />;
  }

  if (sp.q) {
    const r = await search(db, String(sp.q));
    await logIfSubmitted(r.query, sp.k, r.hits.length);
    return <Results r={r} submitKey={sp.k && /^[0-9a-f]{16}$/.test(sp.k) ? sp.k : null} />;
  }

  if (!g) {
    return (
      <div className="empty-box">
        <h2 className="q">还没有可以选择的问题</h2>
        <p className="muted">先在上面输入错误码搜索。</p>
        <TellAdmin context="empty" />
      </div>
    );
  }
  const ids = new Set<number>();
  for (const node of Object.values(g.nodes)) {
    node.articleIds.forEach((i) => ids.add(i));
    node.options.forEach((o) => o.targetArticleId != null && ids.add(o.targetArticleId));
  }
  const arts = new Map((await publishedSummaries(db, [...ids])).map((a) => [a.id, a]));
  return <GuidePanel g={g} nodeId={Number(sp.n) || g.rootId} p={sp.p} articles={arts} />;
}

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const db = await getDb();
  const [notices, top] = await Promise.all([activeAnnouncements(db), topEncounters(db, 30, 10)]);
  return (
    <div className="one">
      <header className="one-top">
        <a href="/" className="brand"><span className="brand-mark" aria-hidden="true" />Win11 升级排障</a>
        <SearchBox defaultValue={sp.q ? String(sp.q).slice(0, 200) : ''} />
      </header>
      <div className="one-grid">
        <main className="one-main" id="main"><MainArea sp={sp} /></main>
        <aside className="one-side">
          <ErrorCodeHint />
          <Notices list={notices} />
          <Ranking list={top} />
        </aside>
      </div>
      <footer className="one-foot">
        <span>本站只给操作指导，不会远程操作电脑。</span>
        <a href="/admin/login">管理员</a>
      </footer>
    </div>
  );
}
