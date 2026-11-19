'use client';
/**
 * 办法页「这一次排障」反馈：这台也遇到了 / 已解决 / 没解决 / 受影响台数 / 开始处理另一台。
 * 本地记住本会话已点状态防连点；服务端按幂等键去重。口径说明就放在按钮旁边。
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession, markTouched, sendEvent, startNewSession, onSessionChange } from './session';

interface State { encounter: boolean; outcome: '' | 'resolved' | 'unresolved'; units: number }
const EMPTY: State = { encounter: false, outcome: '', units: 1 };

export function FeedbackBar({ articleId }: { articleId: number }) {
  const [state, setState] = useState<State>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = () => `w11.fb.${getSession().id}.${articleId}`;

  useEffect(() => {
    const load = () => {
      try {
        setState({ ...EMPTY, ...JSON.parse(localStorage.getItem(key()) || '{}') });
      } catch {
        setState(EMPTY);
      }
    };
    load();
    void sendEvent({ type: 'article_view', articleId });
    return onSessionChange(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const save = (s: State) => {
    setState(s);
    try {
      localStorage.setItem(key(), JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const send = async (type: string, next: State, units?: number) => {
    setBusy(true);
    setError('');
    const ok = await sendEvent({ type, articleId, units });
    setBusy(false);
    if (!ok) {
      setError('网络不稳定，没有记上。可以再点一次，不会重复计数。');
      return;
    }
    markTouched();
    save(next);
  };

  return (
    <section className="feedback-bar" aria-labelledby="fb-title">
      <h2 id="fb-title">这一次排障</h2>
      <div className="fb-grid">
        <button type="button" className={`btn full ${state.encounter ? 'done' : ''}`} disabled={busy} onClick={() => send('report_encounter', { ...state, encounter: true }, state.units)}>
          {state.encounter ? '已记录：这台也遇到了' : '这台也遇到了'}
        </button>
        <button type="button" className={`btn ${state.outcome === 'resolved' ? 'done' : ''}`} disabled={busy || state.outcome === 'resolved'} onClick={() => send('report_resolved', { ...state, outcome: 'resolved' })}>
          {state.outcome === 'resolved' ? '已记录：已解决' : '已解决'}
        </button>
        <button type="button" className={`btn ${state.outcome === 'unresolved' ? 'done' : ''}`} disabled={busy || state.outcome === 'unresolved'} onClick={() => send('report_unresolved', { ...state, outcome: 'unresolved' })}>
          {state.outcome === 'unresolved' ? '已记录：没解决' : '没解决'}
        </button>
        <div className="units full">
          <label htmlFor="units">受影响台数（可选）</label>
          <input id="units" type="number" inputMode="numeric" min={1} max={20} value={state.units}
            onChange={(e) => setState({ ...state, units: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
          {state.encounter && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send('report_encounter', state, state.units)}>更新台数</button>
          )}
        </div>
      </div>
      {error && <p className="small" role="alert" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {state.outcome === 'unresolved' && (
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn" href="/guide">按步骤排查</Link>
          <Link className="btn" href={`/feedback?from=article&ref=${articleId}`}>告诉管理员</Link>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-quiet" onClick={() => {
          if (confirm('开始处理另一台？这一次已记录的反馈会保留，新的点选将算作另一次排障。')) startNewSession();
        }}>开始处理另一台</button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        「这台」指你正在用来打开本站的这次排障，不是自动识别被升级的那台电脑。次数是匿名自报，不是全网故障率；点了不会形成工单，也不会有人回访。
      </p>
    </section>
  );
}
