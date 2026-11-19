/** 管理员登录。失败统一提示「用户名或口令不正确」。 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAdmin } from '@/lib/auth';
import { loginAction } from '../actions';
import { ActionForm } from '@/components/admin/ActionForm';

export const metadata: Metadata = { title: '管理员登录' };

export default async function LoginPage() {
  if (await currentAdmin()) redirect('/admin');
  return (
    <div className="shell">
      <main className="page" style={{ maxWidth: 420, paddingTop: 64 }}>
        <Link href="/" className="brand" style={{ marginBottom: 20 }}>
          <span className="brand-mark" aria-hidden="true" />Windows 11 升级排障助手
        </Link>
        <div className="card pad">
          <h1 style={{ fontSize: '1.25rem', marginBottom: 18 }}>管理员登录</h1>
          <ActionForm action={loginAction}>
            <div className="field">
              <label htmlFor="username">用户名</label>
              <input id="username" name="username" type="text" autoComplete="username" required maxLength={60} />
            </div>
            <div className="field">
              <label htmlFor="password">口令</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
            </div>
            <button className="btn btn-primary btn-block" type="submit">登录</button>
          </ActionForm>
        </div>
        <p className="small muted" style={{ marginTop: 14 }}>操作员不需要登录，直接回到<Link href="/">首页</Link>查找办法。</p>
      </main>
    </div>
  );
}
