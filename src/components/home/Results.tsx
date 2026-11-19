/** 主区域：搜索结果。一行一个大按钮；没有结果时直接给「告诉管理员」。 */
import Link from 'next/link';
import type { SearchResult } from '@/lib/search';
import { TrackLink } from '@/components/client/Track';
import { TellAdmin } from '@/components/client/QuickFeedback';
import { homeHref } from './url';

export function Results({ r, submitKey }: { r: SearchResult; submitKey: string | null }) {
  const code = r.codes[0];
  return (
    <>
      <nav className="trail-bar"><Link className="crumb" href="/">← 回到选择</Link></nav>
      <h2 className="q">
        {r.tooShort ? '再多写几个字' : r.hits.length ? `找到 ${r.hits.length} 个` : '没找到'}
      </h2>
      {code && r.hits.length > 1 && <p className="muted small" style={{ marginBottom: 12 }}>同一个错误码可能有不同原因，选最像的一个。</p>}
      <div className="choices one">
        {r.hits.map((h) => (
          <TrackLink key={h.id} href={homeHref({ a: h.slug, q: r.query })} className="choice" event={{ type: 'search_click', articleId: h.id, submitKey }}>
            <span>{h.title}</span>
            {h.summary && <span className="choice-sub">{h.summary}</span>}
          </TrackLink>
        ))}
      </div>
      {!r.tooShort && <div style={{ marginTop: 20 }}><TellAdmin context="search" defaultText={r.query} /></div>}
    </>
  );
}
