/** 首页：大搜索框 + 两个对等入口 + 公告栏（有才显示）+ 最近更新（有才显示，最多 5 条）。 */
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { SearchForm } from '@/components/client/SearchForm';
import { getDb } from '@/lib/db';
import { recentPublished } from '@/lib/articles';
import { activeAnnouncements } from '@/lib/announcements';
import { fmtDate, fmtMonthDay } from '@/lib/time';

export default async function Home() {
  const db = await getDb();
  const [recent, notices] = await Promise.all([recentPublished(db, 5), activeAnnouncements(db)]);
  return (
    <Shell>
      <section className="home-hero" aria-label="查找办法">
        <SearchForm big />
      </section>

      <nav className="entries" aria-label="其他查找方式">
        <Link href="/gallery" className="entry" style={{ ['--accent' as string]: '#a9c3dd' }}>
          <strong>看图找问题</strong>
          <span>对照报错画面</span>
        </Link>
        <Link href="/guide" className="entry" style={{ ['--accent' as string]: '#9fd3b8' }}>
          <strong>按步骤排查</strong>
          <span>一次只问一件事</span>
        </Link>
      </nav>

      {notices.length > 0 && (
        <section className="board" aria-labelledby="notice-title">
          <div className="board-head">
            <h2 id="notice-title">公告</h2>
            <span className="small muted">管理员发布</span>
          </div>
          <ul className="announce-list">
            {notices.map((n) => (
              <li key={n.id} className={`announce ${n.pinned ? 'pinned' : ''}`}>
                <div className="announce-title">
                  {n.pinned && <span className="tag peach">置顶</span>}
                  <span>{n.title}</span>
                  <time className="announce-date" dateTime={n.updated_at}>{fmtDate(n.updated_at)}</time>
                </div>
                {n.body && <p className="announce-body">{n.body}</p>}
                {n.link_url && (
                  <a className="btn" href={n.link_url} target="_blank" rel="noopener noreferrer">
                    {n.link_label || '打开链接'}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="board" aria-labelledby="recent-title">
          <div className="board-head"><h2 id="recent-title">最近更新</h2></div>
          <ul className="recent">
            {recent.map((r) => (
              <li key={r.slug}>
                <Link href={`/a/${r.slug}`}>
                  <time dateTime={r.published_at}>{fmtMonthDay(r.published_at)}</time>
                  <span>{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
