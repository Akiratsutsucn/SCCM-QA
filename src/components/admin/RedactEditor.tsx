'use client';
/**
 * 截图裁切与矩形打码。拖动画框：「打码」模式加遮挡块，「裁切」模式设定保留区域。
 * 坐标按 0–1 比例提交，服务端在当前图上累积处理（不保留未打码原图，打码不可撤销）。
 * 手机上可用（Pointer 事件），但精细打码建议在电脑上进行。
 */
import { useActionState, useRef, useState } from 'react';
import type { ActionState } from '@/app/admin/actions';
import { ActionResult } from './ActionForm';

type Rect = { x: number; y: number; w: number; h: number };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function RedactEditor({ id, rev, action }: { id: string; rev: number; action: Action }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'box' | 'crop'>('box');
  const [boxes, setBoxes] = useState<Rect[]>([]);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(action, {});

  const pos = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const style = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>裁切 / 打码</button>;
  return (
    <div className="stack-sm" style={{ marginTop: 10 }}>
      <div className="row">
        <button type="button" className={`btn btn-sm ${mode === 'box' ? 'done' : ''}`} onClick={() => setMode('box')}>画打码块</button>
        <button type="button" className={`btn btn-sm ${mode === 'crop' ? 'done' : ''}`} onClick={() => setMode('crop')}>设定裁切范围</button>
        <button type="button" className="btn btn-sm" onClick={() => setBoxes((b) => b.slice(0, -1))} disabled={!boxes.length}>撤销一块</button>
        <button type="button" className="btn btn-sm" onClick={() => { setBoxes([]); setCrop(null); }}>清空</button>
      </div>
      <div
        ref={wrap}
        className="redact-canvas"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); start.current = pos(e); }}
        onPointerMove={(e) => start.current && setDraft(rectOf(start.current, pos(e)))}
        onPointerUp={(e) => {
          if (!start.current) return;
          const r = rectOf(start.current, pos(e));
          start.current = null;
          setDraft(null);
          if (r.w < 0.01 || r.h < 0.01) return;
          if (mode === 'box') setBoxes((b) => [...b, r]);
          else setCrop(r);
        }}
      >
        <img src={`/media/${id}?v=full&r=${rev}`} alt="待打码截图" draggable={false} />
        {crop && <div className="crop" style={style(crop)} />}
        {boxes.map((b, i) => <div key={i} className="box" style={style(b)} />)}
        {draft && <div className={mode === 'box' ? 'box' : 'crop'} style={style(draft)} />}
      </div>
      <p className="hint">打码与裁切会直接写入图片，且不保留原图，无法撤销。应用后须重新勾选「已检查脱敏」。</p>
      <form action={formAction} className="row">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="edit" value={JSON.stringify({ crop, boxes })} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending || (!boxes.length && !crop)}>应用到图片</button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>收起</button>
      </form>
      <ActionResult state={state} />
    </div>
  );
}
