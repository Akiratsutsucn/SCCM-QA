/**
 * 主区域：办法。只突出「怎么做」：标题 → 危险止步 → 编号步骤。
 * 适用/不适用/风险/验证收进「更多说明」，需要时再展开。
 */
import Link from 'next/link';
import { RichText } from '@/components/RichText';
import { CopyButton } from '@/components/client/CopyButton';
import { ShotThumb } from '@/components/client/ImageViewer';
import { AnswerActions } from '@/components/client/QuickFeedback';
import { contentCodes, type Content } from '@/lib/content';
import { fmtDate } from '@/lib/time';

export function Answer({ id, c, reviewedAt, mediaRev, backHref, backLabel }: {
  id: number; c: Content; reviewedAt: string | null; mediaRev: Map<string, number>; backHref: string; backLabel: string;
}) {
  const codes = contentCodes(c);
  const steps = c.steps.filter((s) => s.action.trim());
  return (
    <article className="answer">
      <nav className="trail-bar"><Link className="crumb" href={backHref}>← {backLabel}</Link></nav>
      <h2 className="answer-title">{c.title}</h2>
      {codes.length > 0 && (
        <div className="row" style={{ gap: 6, marginBottom: 12 }}>
          {codes.map((code) => <span key={code} className="row" style={{ gap: 4 }}><span className="code">{code}</span><CopyButton text={code} /></span>)}
        </div>
      )}
      {c.appliesTo && <div className="applies"><b>先确认：</b><RichText text={c.appliesTo} /></div>}
      {c.stopRule && (
        <div className="notice stop" role="note"><strong>⚠ 危险操作先停，找现场负责人。</strong><RichText text={c.stopRule} /></div>
      )}

      <ol className="do-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="n" aria-hidden="true">{i + 1}</span>
            <div className="body">
              <RichText text={s.action} />
              {s.mediaIds.length > 0 && (
                <div className="step-shots">
                  {s.mediaIds.map((m) => <ShotThumb key={m} shot={{ id: m, alt: `第 ${i + 1} 步的画面`, rev: mediaRev.get(m) }} />)}
                </div>
              )}
              {s.expected && <p className="sub">✓ 应该看到：{s.expected}</p>}
              {s.ifFailed && <p className="sub">✗ 不行的话：{s.ifFailed}</p>}
            </div>
          </li>
        ))}
      </ol>

      <AnswerActions articleId={id} />

      <details className="more">
        <summary>更多说明</summary>
        <div className="stack-sm">
          {c.notAppliesTo && <div><b>不适用：</b><RichText text={c.notAppliesTo} /></div>}
          {c.risks && <div><b>权限 / 风险：</b><RichText text={c.risks} /></div>}
          {c.verify && <div><b>怎样算好了：</b><RichText text={c.verify} /></div>}
          {c.evidence.trim() && <div><b>来源：</b><RichText text={c.evidence} /></div>}
          {reviewedAt && <p className="small muted">最近复核 {fmtDate(reviewedAt)}</p>}
        </div>
      </details>
    </article>
  );
}
