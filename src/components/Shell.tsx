/** 操作端框架：薄顶栏（仅标题）+ 主体 + 页脚（免责声明、排障会话提示、极弱的管理员入口）。 */
import Link from 'next/link';
import { SessionNote } from './client/SessionNote';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="回到首页">
            <span className="brand-mark" aria-hidden="true" />
            <span className="full">Windows 11 升级排障助手</span>
            <span className="short">升级排障助手</span>
          </Link>
        </div>
      </header>
      <main className="page" id="main">{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <span>本站只提供操作指导，不会远程操作电脑。</span>
          <SessionNote />
          <Link href="/admin/login" prefetch={false}>管理员</Link>
        </div>
      </footer>
    </div>
  );
}

export function BackHome() {
  return <Link href="/" className="btn btn-quiet">← 首页</Link>;
}
