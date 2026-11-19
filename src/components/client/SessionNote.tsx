'use client';
/** 页脚一行：存在已记录的排障会话时显示「正在记录这一次排障 · 开始处理另一台」。 */
import { useEffect, useState } from 'react';
import { getSession, onSessionChange, startNewSession } from './session';

export function SessionNote() {
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const sync = () => setTouched(getSession().touched);
    sync();
    return onSessionChange(sync);
  }, []);
  if (!touched) return null;
  return (
    <span className="session-note">
      正在记录这一次排障。
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => {
          if (confirm('开始处理另一台？这一次已记录的反馈会保留，新的点选将算作另一次排障。')) {
            startNewSession();
            location.reload();
          }
        }}
      >
        开始处理另一台
      </button>
    </span>
  );
}
