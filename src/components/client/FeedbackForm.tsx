'use client';
/** 未收录反馈：错误码或原话（必填）、阶段（可选）、补一句（可选）。提交按钮紧挨字段，键盘弹出时可滚到。 */
import { useRef, useState } from 'react';
import { getSession, markTouched, sendEvent } from './session';

export function FeedbackForm({ stages, defaultText, context }: { stages: string[]; defaultText: string; context: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const keyRef = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = String(f.get('text') || '').trim();
    if (!text) {
      setStatus('error');
      setMsg('请写下错误码或你看到的原话。');
      return;
    }
    setStatus('sending');
    getSession();
    const ok = await sendEvent({
      key: keyRef.current, text, stage: f.get('stage'), extra: f.get('extra'), context,
      website: f.get('website'), elapsedMs: Date.now() - startedAt.current,
    }, '/api/feedback');
    if (ok) {
      markTouched();
      setStatus('done');
    } else {
      setStatus('error');
      setMsg('没有提交成功（网络不稳或提交太频繁）。请稍后再点一次，不会重复记录。');
    }
  };

  if (status === 'done') {
    return (
      <div className="notice ok" role="status">
        <p><strong>已记下。</strong>管理员更新内容时会查看。</p>
        <p className="small muted" style={{ marginTop: 4 }}>这不是工单，没有工单号，也不会有人回访你。</p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="fb-text">错误码或你看到的原话 <span className="muted small">（必填）</span></label>
        <input id="fb-text" name="text" type="text" maxLength={300} defaultValue={defaultText} required autoComplete="off" />
        <p className="hint">不要填写电脑名、IP、账号或人名。</p>
      </div>
      <div className="field">
        <label htmlFor="fb-stage">卡在哪一步 <span className="muted small">（可选）</span></label>
        <select id="fb-stage" name="stage" defaultValue="">
          <option value="">不确定</option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="fb-extra">再补一句 <span className="muted small">（可选）</span></label>
        <textarea id="fb-extra" name="extra" maxLength={500} rows={3} />
      </div>
      <div className="hp" aria-hidden="true">
        <label htmlFor="fb-website">网站</label>
        <input id="fb-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {status === 'error' && <p role="alert" className="small" style={{ color: 'var(--danger)', marginBottom: 10 }}>{msg}</p>}
      <button className="btn btn-primary btn-block" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? '正在提交…' : '提交'}
      </button>
    </form>
  );
}
