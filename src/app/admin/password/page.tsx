/** 修改口令。引导账号首次登录后强制进入本页。 */
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { changePasswordAction } from '../actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';

export const metadata: Metadata = { title: '修改口令' };

export default async function PasswordPage() {
  const user = await requireAdmin({ allowMustChange: true });
  return (
    <AdminShell current="" user={user.username}>
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ marginBottom: 8 }}>修改口令</h1>
        {user.mustChange && <p className="notice" style={{ marginBottom: 16 }}>这是引导账号的首次登录，请先修改口令后再继续。</p>}
        <div className="card pad">
          <ActionForm action={changePasswordAction}>
            <div className="field">
              <label htmlFor="current">当前口令</label>
              <input id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label htmlFor="next">新口令</label>
              <input id="next" name="next" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
              <p className="hint">至少 {MIN_PASSWORD_LENGTH} 位。不要与其他系统共用。</p>
            </div>
            <div className="field">
              <label htmlFor="confirm">再输入一次新口令</label>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </div>
            <button className="btn btn-primary btn-block" type="submit">保存新口令</button>
          </ActionForm>
        </div>
      </div>
    </AdminShell>
  );
}
