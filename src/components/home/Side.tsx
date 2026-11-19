/** 侧栏：管理员公告 + 遇到最多的问题排名（近 30 天「我也遇到了」匿名自报）。 */
import Link from 'next/link';
import type { Announcement } from '@/lib/announcements';
import { fmtMonthDay } from '@/lib/time';
import { homeHref } from './url';

/** 告诉操作员错误码在报错窗口的哪里（静态示例图 public/help/error-code-where.webp）。 */
export function ErrorCodeHint() {
  return (
    <section className="side-card hint" aria-labelledby="hint-h">
      <h2 id="hint-h">错误码在哪找？</h2>
      <a href="/help/error-code-where.webp" target="_blank" rel="noopener" className="hint-img" aria-label="打开大图">
        <img src="/help/error-code-where.webp" width={1020} height={563} alt="任务序列报错窗口：error code 后面 0x 开头的一串就是错误码，例如 0x80004005" />
      </a>
      <p className="hint-text">报错窗口里 <b>error code</b> 后面，<b>0x 开头</b>的一串就是。把它输入到上面的搜索框。</p>
    </section>
  );
}

export function Notices({ list }: { list: Announcement[] }) {
  if (!list.length) return null;
  return (
    <section className="side-card notices" aria-labelledby="notice-h">
      <h2 id="notice-h">公告</h2>
      <ul>
        {list.map((n) => (
          <li key={n.id} className={n.pinned ? 'pinned' : ''}>
            <p className="t">{n.title}</p>
            {n.body && <p className="b">{n.body}</p>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="d">{fmtMonthDay(n.updated_at)}</span>
              {n.link_url && <a className="btn btn-primary btn-sm" href={n.link_url} target="_blank" rel="noopener noreferrer">{n.link_label || '打开'}</a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Ranking({ list }: { list: { slug: string; title: string; n: number }[] }) {
  return (
    <section className="side-card ranking" aria-labelledby="rank-h">
      <h2 id="rank-h">常见问题 TOP 10</h2>
      {list.length === 0 ? <p className="muted small">还没有已发布的问题。</p> : (
        <ol>
          {list.map((r, i) => (
            <li key={r.slug}>
              <Link href={homeHref({ a: r.slug })}>
                <span className="rk">{i + 1}</span>
                <span className="tt">{r.title}</span>
                {r.n > 0 && <span className="ct">{r.n} 次</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="note">次数 = 近 30 天大家点「我也遇到了」</p>
    </section>
  );
}
