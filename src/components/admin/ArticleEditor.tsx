'use client';
/**
 * 结构化文章编辑器。桌面两列字段、手机单列；底部固定「保存草稿 / 预览 / 发布」。
 * 内容以 JSON 隐藏字段提交给 saveArticleAction；发布前服务端再做完整校验。
 */
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import type { ActionState } from '@/app/admin/actions';
import type { Content, Step } from '@/lib/content';
import { ActionResult } from './ActionForm';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
interface MediaOpt { id: string; caption: string; checked: boolean }

const emptyStep = (): Step => ({ action: '', expected: '', success: '', ifFailed: '', mediaIds: [] });

export function ArticleEditor({ id, initial, stages, symptomVocab, media, action, template }: {
  id: number;
  initial: Content;
  stages: string[];
  symptomVocab: string[];
  media: MediaOpt[];
  action: Action;
  template: Content;
}) {
  const [c, setC] = useState<Content>(initial);
  const [state, formAction, pending] = useActionState(action, {});
  const [dirty, setDirty] = useState(false);
  const json = useMemo(() => JSON.stringify(c), [c]);
  const set = <K extends keyof Content>(k: K, v: Content[K]) => { setC((p) => ({ ...p, [k]: v })); setDirty(true); };
  const setStep = (i: number, patch: Partial<Step>) => set('steps', c.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= c.steps.length) return;
    const next = [...c.steps];
    [next[i], next[j]] = [next[j], next[i]];
    set('steps', next);
  };

  const text = (k: keyof Content, label: string, opts: { area?: boolean; hint?: string; full?: boolean; rows?: number } = {}) => (
    <div className={`field ${opts.full ? 'full' : ''}`}>
      <label htmlFor={`f-${k}`}>{label}</label>
      {opts.area ? (
        <textarea id={`f-${k}`} rows={opts.rows ?? 3} value={c[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input id={`f-${k}`} type="text" value={c[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      )}
      {opts.hint && <p className="hint">{opts.hint}</p>}
    </div>
  );

  return (
    <form action={(fd) => { setDirty(false); return formAction(fd); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="content" value={json} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button type="button" className="btn btn-sm" onClick={() => {
          if (!dirty || confirm('插入模板会用空白结构替换当前未保存内容，继续？')) { setC(template); setDirty(true); }
        }}>插入内容模板（空白结构）</button>
        <span className="small muted">模板只是占位，未替换前不能发布。</span>
      </div>

      <div className="editor-grid">
        {text('title', '标题', { full: true, hint: '写清现象和条件，不要只写错误码。' })}
        {text('short', '短名（排行榜用，≤16 字，可留空）', { full: true })}
        {text('summary', '区分句', { full: true, area: true, rows: 2, hint: '同一错误码有多篇时，用这一句区分本篇适用的条件。' })}
        <div className="field">
          <label htmlFor="f-stage">阶段</label>
          <select id="f-stage" value={c.stage} onChange={(e) => set('stage', e.target.value)}>
            <option value="">（选择）</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-codes">错误码与别名</label>
          <input id="f-codes" type="text" value={c.codes.join(' ')} onChange={(e) => set('codes', e.target.value.split(/[\s,，、]+/).filter(Boolean))} />
          <p className="hint">空格分隔，如 0xC1900101 C1900101。无码的纯现象文章可留空。</p>
        </div>
        <div className="field full">
          <label htmlFor="f-symptoms">症状（每行一条）</label>
          <textarea id="f-symptoms" rows={3} value={c.symptoms.join('\n')} onChange={(e) => set('symptoms', e.target.value.split('\n'))} />
          <p className="hint">常用：{symptomVocab.join('、')}</p>
        </div>
        {text('sourceOs', '适用系统（源）', { hint: '没有把握就留空，不要编。' })}
        {text('targetOs', '目标版本', { hint: '没有把握就留空。' })}
        {text('variant', '任务序列或部署变体（可选）', { full: true })}
        {text('appliesTo', '适用条件', { area: true, hint: '可用「- 」开头写列表。' })}
        {text('notAppliesTo', '不适用条件', { area: true, hint: '没有也写：暂未发现明确不适用情形，仍须对照步骤验证。' })}
        {text('risks', '风险与需要的权限', { area: true })}
        {text('stopRule', '危险止步', { area: true, hint: '含不可逆或高风险动作时必填：停止，并交给现场负责人。' })}
      </div>

      <h2 style={{ margin: '12px 0 10px' }}>步骤</h2>
      {c.steps.map((s, i) => (
        <div key={i} className="step-edit">
          <div className="split" style={{ marginBottom: 8 }}>
            <strong>步骤 {i + 1}</strong>
            <span className="row">
              <button type="button" className="btn btn-sm" onClick={() => moveStep(i, -1)} disabled={i === 0}>上移</button>
              <button type="button" className="btn btn-sm" onClick={() => moveStep(i, 1)} disabled={i === c.steps.length - 1}>下移</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => set('steps', c.steps.filter((_, j) => j !== i))}>删除</button>
            </span>
          </div>
          <div className="editor-grid">
            <div className="field full">
              <label htmlFor={`s${i}a`}>做什么</label>
              <textarea id={`s${i}a`} rows={3} value={s.action} onChange={(e) => setStep(i, { action: e.target.value })} />
              <p className="hint">命令请放在 ``` 代码块中，仅作只读展示，本站不会执行。</p>
            </div>
            <div className="field"><label htmlFor={`s${i}e`}>预期现象</label><textarea id={`s${i}e`} rows={2} value={s.expected} onChange={(e) => setStep(i, { expected: e.target.value })} /></div>
            <div className="field"><label htmlFor={`s${i}s`}>怎样算本步成功</label><textarea id={`s${i}s`} rows={2} value={s.success} onChange={(e) => setStep(i, { success: e.target.value })} /></div>
            <div className="field full"><label htmlFor={`s${i}f`}>若无效（下一步）</label><input id={`s${i}f`} type="text" value={s.ifFailed} onChange={(e) => setStep(i, { ifFailed: e.target.value })} /></div>
            <div className="field full">
              <label>配图（须已脱敏）</label>
              {media.length === 0 ? <p className="hint">先到「图集」上传并关联到本文。</p> : (
                <div className="chips">
                  {media.map((m) => (
                    <label key={m.id} className="check chip" style={{ fontWeight: 400 }}>
                      <input type="checkbox" checked={s.mediaIds.includes(m.id)} onChange={(e) => setStep(i, { mediaIds: e.target.checked ? [...s.mediaIds, m.id] : s.mediaIds.filter((x) => x !== m.id) })} />
                      {m.caption || m.id.slice(0, 6)}{!m.checked && '（未确认脱敏，不会公开）'}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => set('steps', [...c.steps, emptyStep()])}>添加步骤</button>

      <div className="editor-grid" style={{ marginTop: 18 }}>
        {text('verify', '验证成功（整篇）', { area: true })}
        {text('evidence', '来源证据（可选）', { area: true, hint: '只写确实掌握的依据。禁止编造微软文档号或外链。' })}
        {text('internalNote', '内部备注（仅管理员可见，不会公开）', { area: true, full: true })}
        <div className="field full">
          <label htmlFor="f-tags">标签（可选，空格分隔）</label>
          <input id="f-tags" type="text" value={c.tags.join(' ')} onChange={(e) => set('tags', e.target.value.split(/\s+/).filter(Boolean))} />
        </div>
      </div>

      <div className="card pad stack-sm" style={{ marginTop: 8 }}>
        <label className="check"><input type="checkbox" name="redactionConfirmed" />已检查文字与画面脱敏：无客户名、主机名、IP、账号、内部路径与截图隐私</label>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="note">本次发布说明（写入更新日志，可选）</label>
          <input id="note" name="note" type="text" maxLength={300} />
        </div>
      </div>

      <ActionResult state={state} />
      <div className="sticky-actions">
        <button className="btn" type="submit" name="intent" value="save" disabled={pending}>保存草稿</button>
        <Link className="btn" href={`/admin/articles/${id}/preview`} target="_blank" onClick={(e) => {
          if (dirty && !confirm('预览显示的是已保存的草稿。尚有未保存的修改，仍要打开吗？')) e.preventDefault();
        }}>预览</Link>
        <button className="btn btn-primary" type="submit" name="intent" value="publish" disabled={pending}>发布</button>
        <span className="small muted">{pending ? '正在保存…' : dirty ? '有未保存的修改' : ''}</span>
      </div>
    </form>
  );
}
