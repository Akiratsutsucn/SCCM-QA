/** 管理端框架：与操作端同一视觉体系，顶栏横向导航（窄屏可横向滑动）。 */
import Link from 'next/link';
import { logoutAction } from '@/app/admin/actions';

const NAV = [
  ['/admin', '今日'],
  ['/admin/articles', '文章'],
  ['/admin/media', '图集'],
  ['/admin/guides', '引导'],
  ['/admin/candidates', '线索'],
  ['/admin/announcements', '公告'],
  ['/admin/stats', '统计'],
  ['/admin/settings', '设置'],
] as const;

export function AdminShell({ current, user, children }: { current: string; user: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner wide">
          <Link href="/admin" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="full">排障助手 · 管理</span>
            <span className="short">管理</span>
          </Link>
          <nav className="admin-nav" aria-label="管理导航">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="page wide">{children}</main>
      <footer className="footer">
        <div className="footer-inner" style={{ maxWidth: 1120 }}>
          <span>已登录：{user}</span>
          <span className="row">
            <Link href="/" target="_blank">查看操作端</Link>
            <Link href="/admin/password">修改口令</Link>
            <form action={logoutAction}><button className="btn btn-quiet btn-sm" type="submit">退出登录</button></form>
          </span>
        </div>
      </footer>
    </div>
  );
}
