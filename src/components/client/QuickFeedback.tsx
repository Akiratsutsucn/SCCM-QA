'use client';
/**
 * 单页上的三个小交互：
 * - SearchBox：搜索框（提交时带随机键 k，服务端据此记一次搜索）
 * - AnswerActions：「我也遇到了」「解决了」「没解决」（匿名、同一会话不重复计数）
 * - TellAdmin：一句话告诉管理员（不是工单）
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, sendEvent, startNewSession } from './session';

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    getSession();
    if (!defaultValue && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches) ref.current?.focus();
  }, [defaultValue]);
  return (
    <form
      className="searchbar"
      role="search"
      action="/"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const q = (ref.current?.value ?? '').trim().slice(0, 200);
        if (!q) return ref.current?.focus();
        ref.current?.blur();
        router.push(`/?q=${encodeURIComponent(q)}&k=${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`);
      }}
    >
      <input ref={ref} name="q" type="search" defaultValue={defaultValue} maxLength={200} placeholder="输入错误码，如 0xC1900101" aria-label="输入错误码或现象" autoComplete="off" enterKeyHint="search" />
      <button className="btn btn-primary" type="submit">搜索</button>
    </form>
  );
}

type Outcome = '' | 'resolved' | 'unresolved';

export function AnswerActions({ articleId }: { articleId: number }) {
  const [hit, setHit] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const key = () => `w11.fb.${getSession().id}.${articleId}`;

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key()) || '{}');
      setHit(!!s.hit);
      setOutcome(s.outcome || '');
    } catch {
      /* ignore */
    }
    void sendEvent({ type: 'article_view', articleId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const send = async (type: string, next: { hit: boolean; outcome: Outcome }) => {
    setBusy(true);
    setErr(false);
    const ok = await sendEvent({ type, articleId });
    setBusy(false);
    if (!ok) return setErr(true);
    setHit(next.hit);
    setOutcome(next.outcome);
    try {
      localStorage.setItem(key(), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="answer-actions">
      <button type="button" className={`btn big ${hit ? 'done' : ''}`} disabled={busy || hit} onClick={() => send('report_encounter', { hit: true, outcome })}>
        {hit ? '✓ 已记一次' : '我也遇到了'}
      </button>
      <button type="button" className={`btn big ${outcome === 'resolved' ? 'done' : ''}`} disabled={busy || outcome === 'resolved'} onClick={() => send('report_resolved', { hit, outcome: 'resolved' })}>
        {outcome === 'resolved' ? '✓ 解决了' : '解决了'}
      </button>
      <button type="button" className={`btn big ${outcome === 'unresolved' ? 'done' : ''}`} disabled={busy || outcome === 'unresolved'} onClick={() => send('report_unresolved', { hit, outcome: 'unresolved' })}>
        {outcome === 'unresolved' ? '✓ 没解决' : '没解决'}
      </button>
      {err && <p className="small err" role="alert">网络不好，没记上，再点一次。</p>}
      {outcome === 'unresolved' && <TellAdmin context={`article:${articleId}`} />}
      <button type="button" className="linkish small" onClick={() => {
        if (confirm('换一台电脑？之后的点击算作新的一台。')) {
          startNewSession();
          setHit(false);
          setOutcome('');
        }
      }}>换一台电脑</button>
    </div>
  );
}

export function TellAdmin({ context, defaultText = '' }: { context: string; defaultText?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const keyRef = useRef(crypto.randomUUID());
  const started = useRef(Date.now());
  if (state === 'done') return <p className="notice ok small">已告诉管理员。</p>;
  return (
    <form
      className="tell"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const text = String(f.get('text') || '').trim();
        if (!text) return;
        setState('sending');
        getSession();
        const ok = await sendEvent({ key: keyRef.current, text, context, website: f.get('website'), elapsedMs: Date.now() - started.current }, '/api/feedback');
        setState(ok ? 'done' : 'error');
      }}
    >
      <label htmlFor={`tell-${context}`} className="small">没找到？写下错误码或看到的字，告诉管理员</label>
      <div className="row">
        <input id={`tell-${context}`} name="text" type="text" maxLength={300} defaultValue={defaultText} required autoComplete="off" placeholder="例如：0x8007000D 卡在 30%" />
        <input className="hp" name="website" tabIndex={-1} aria-hidden="true" autoComplete="off" />
        <button className="btn" type="submit" disabled={state === 'sending'}>发送</button>
      </div>
      {state === 'error' && <p className="small err" role="alert">没发出去，稍后再试。</p>}
    </form>
  );
}
