'use client';
import { useState } from 'react';

/** 一键复制（常显，不靠悬停）。剪贴板不可用时回退为选中文字。 */
export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={`btn btn-sm ${done ? 'done' : ''}`} onClick={copy} aria-label={`${label} ${text}`}>
      {done ? '已复制' : label}
    </button>
  );
}
