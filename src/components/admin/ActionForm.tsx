'use client';
/** 带结果提示的 Server Action 表单（成功、错误、警告三种提示）。 */
import { useActionState } from 'react';
import type { ActionState } from '@/app/admin/actions';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionResult({ state }: { state: ActionState }) {
  if (!state.at) return null;
  return (
    <div className="stack-sm" role="status" aria-live="polite" style={{ margin: '10px 0' }}>
      {state.message && <p className={state.ok ? 'notice ok' : 'notice'}>{state.message}</p>}
      {state.errors && state.errors.length > 0 && (
        <div className="errors"><strong>需要处理</strong><ul>{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}
      {state.warnings && state.warnings.length > 0 && (
        <div className="warns"><strong>提醒（不阻止发布）</strong><ul>{state.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}
    </div>
  );
}

export function ActionForm({ action, children, className, encType }: { action: Action; children: React.ReactNode; className?: string; encType?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} encType={encType} aria-busy={pending}>
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>
      <ActionResult state={state} />
    </form>
  );
}
