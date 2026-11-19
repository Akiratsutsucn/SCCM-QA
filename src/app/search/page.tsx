/** 搜索结果 /search?q=&k= 。q 在 URL 中，返回可恢复；k 存在时幂等记录一次提交。 */
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import { Shell, BackHome } from '@/components/Shell';
import { SearchForm } from '@/components/client/SearchForm';
import { CopyButton } from '@/components/client/CopyButton';
import { TrackLink } from '@/components/client/Track';
import { getDb } from '@/lib/db';
import { search } from '@/lib/search';
import { logSearch } from '@/lib/events';
import { hashSession, isValidSessionId } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';

export const metadata: Metadata = { title: '搜索结果' };

type Props = { searchParams: Promise<{ q?: string; k?: string }> };

function NextSteps({ q }: { q: string }) {
  return (
    <div className="next-steps">
      <p className="muted" style={{ marginBottom: 10 }}>没有合适的？</p>
      <div className="row">
        <Link className="btn" href="/gallery">看图找问题</Link>
        <Link className="btn" href="/guide">按步骤排查</Link>
        <Link className="btn" href={`/feedback?text=${encodeURIComponent(q)}&from=search`}>告诉管理员</Link>
      </div>
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', k } = await searchParams;
  const db = await getDb();
  const result = await search(db, String(q));
  const submitKey = typeof k === 'string' && /^[0-9a-f]{16}$/.test(k) ? k : null;

  if (submitKey && result.query) {
    const h = await headers();
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    if (rateLimit(`search:${ip}`, 60, 60_000)) {
      const sid = (await cookies()).get('w11s')?.value;
      await logSearch(db, { submitKey, sessionHash: isValidSessionId(sid) ? hashSession(sid) : null, query: result.query, resultCount: result.hits.length });
    }
  }

  const code = result.codes[0];
  return (
    <Shell>
      <div className="subbar">
        <BackHome />
        <SearchForm defaultValue={result.query} />
      </div>

      {!result.query && <p className="muted">请输入错误码或一句话现象。</p>}
      {result.tooShort && <p className="muted">查询太短。请输入至少 2 个字，或输入错误码。</p>}

      {code && (
        <div className="code-banner stack-sm">
          <div className="row">
            <span>已按</span>
            <span className="code">{code}</span>
            <span>查找</span>
            <CopyButton text={code} />
          </div>
          {code.toLowerCase() !== result.query.toLowerCase() && <p className="small muted">你的输入：{result.query}</p>}
          <p className="small">同一错误码可能有不同原因，请对照适用条件。</p>
        </div>
      )}

      {result.query && !result.tooShort && result.hits.length === 0 && (
        <div className="card empty">
          <p>没有找到与「{result.query}」相符的已发布办法。</p>
          <p className="muted">可以换个写法，或对照画面、按步骤排查。</p>
        </div>
      )}

      {result.hits.length > 0 && (
        <>
          {!code && <p className="small muted" style={{ marginBottom: 10 }}>找到 {result.hits.length} 篇，按相关程度排列。</p>}
          <ul className="result-list">
            {result.hits.map((h) => (
              <li key={h.id} className="result">
                <div className="meta">
                  <span className="tag mint">{h.stage}</span>
                  {h.codes.slice(0, 3).map((c) => <span key={c} className="tag">{c}</span>)}
                </div>
                <TrackLink href={`/a/${h.slug}`} className="title" event={{ type: 'search_click', articleId: h.id, submitKey }}>{h.title}</TrackLink>
                <p>{h.summary}</p>
                <dl className="cond">
                  <dt>适用于：</dt><dd>{h.appliesTo.replace(/^[-•]\s*/gm, '')}</dd>
                  {h.notAppliesTo && (<><dt>不适用于：</dt><dd>{h.notAppliesTo.replace(/^[-•]\s*/gm, '')}</dd></>)}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.query && !result.tooShort && <NextSteps q={result.query} />}
    </Shell>
  );
}
