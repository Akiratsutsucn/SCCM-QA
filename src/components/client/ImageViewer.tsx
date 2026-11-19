'use client';
/**
 * 截图：缩略图（懒加载、失败可重试）+ 查看层（双击 / 双指缩放、拖动、关闭后回到原位）。
 * 图集里可带「就是这个」主操作。
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Shot { id: string; alt: string; rev?: number }

function Thumb({ shot, onOpen }: { shot: Shot; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  if (failed) {
    return (
      <div className="thumb-btn" role="group" aria-label="画面暂缺">
        <div className="img-missing">
          <span>画面暂缺，请改用搜索或文字步骤</span>
          <button type="button" className="btn btn-sm" onClick={() => { setFailed(false); setRetry((r) => r + 1); }}>重试</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className="thumb-btn" onClick={onOpen} aria-label={`放大查看：${shot.alt}`}>
      <img src={`/media/${shot.id}?v=thumb&r=${shot.rev ?? 1}-${retry}`} alt={shot.alt} loading="lazy" decoding="async" width={480} height={360} onError={() => setFailed(true)} />
    </button>
  );
}

function Viewer({ shot, onClose, action }: { shot: Shot; onClose: () => void; action?: { href: string; label: string } }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const clamp = (s: number) => Math.min(5, Math.max(1, s));
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: t.s };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const s = clamp((pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d);
      setT((v) => ({ ...v, s }));
    } else if (pointers.current.size === 1 && t.s > 1) {
      setT((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const zoom = (d: number) => setT((v) => { const s = clamp(v.s + d); return s === 1 ? { s, x: 0, y: 0 } : { ...v, s }; });

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="放大查看">
      <div className="viewer-bar">
        <button ref={closeRef} type="button" className="btn btn-sm" onClick={onClose}>关闭</button>
        <span>放大查看</span>
        <span className="row">
          <button type="button" className="btn btn-sm" onClick={() => zoom(-0.5)} aria-label="缩小">－</button>
          <button type="button" className="btn btn-sm" onClick={() => zoom(0.5)} aria-label="放大">＋</button>
        </span>
      </div>
      <div
        className="viewer-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => setT((v) => (v.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))}
        onWheel={(e) => zoom(e.deltaY < 0 ? 0.3 : -0.3)}
      >
        <img src={`/media/${shot.id}?v=full&r=${shot.rev ?? 1}`} alt={shot.alt} draggable={false} style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }} />
      </div>
      <div className="viewer-foot">
        {action && <Link className="btn btn-primary" href={action.href}>{action.label}</Link>}
        <span className="hint">双击或双指缩放，放大后可拖动</span>
      </div>
    </div>
  );
}

export function ShotThumb({ shot, action, onOpen }: { shot: Shot; action?: { href: string; label: string }; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Thumb shot={shot} onOpen={() => { setOpen(true); onOpen?.(); }} />
      {open && <Viewer shot={shot} onClose={close} action={action} />}
    </>
  );
}
