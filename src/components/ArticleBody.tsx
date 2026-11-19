/** 办法正文渲染：操作端 /a/[slug] 与管理端预览共用。 */
import { RichText } from './RichText';
import { CopyButton } from './client/CopyButton';
import { ShotThumb } from './client/ImageViewer';
import { contentCodes, type Content } from '@/lib/content';
import { fmtDate } from '@/lib/time';

export function ArticleBody({ c, reviewedAt, mediaRev }: { c: Content; reviewedAt: string | null; mediaRev: Map<string, number> }) {
  const codes = contentCodes(c);
  const steps = c.steps.filter((s) => s.action.trim());
  return (
    <>
      <header className="article-head">
        <div className="codes">
          <span className="tag mint">{c.stage}</span>
          {codes.map((code) => (
            <span key={code} className="row" style={{ gap: 6 }}>
              <span className="code">{code}</span>
              <CopyButton text={code} />
            </span>
          ))}
        </div>
        <h1>{c.title}</h1>
        {reviewedAt && <p className="small muted">最近复核：{fmtDate(reviewedAt)}</p>}
        {c.summary && <p>{c.summary}</p>}
      </header>

      <div className="cond-box">
        <section><h2>适用</h2><RichText text={c.appliesTo} /></section>
        <section><h2>不适用</h2><RichText text={c.notAppliesTo} /></section>
        {(c.sourceOs || c.targetOs || c.variant) && (
          <section>
            <h2>版本与部署</h2>
            {c.sourceOs && <p>原系统：{c.sourceOs}</p>}
            {c.targetOs && <p>目标版本：{c.targetOs}</p>}
            {c.variant && <p>任务序列 / 变体：{c.variant}</p>}
          </section>
        )}
        <section><h2>需要权限 / 风险</h2><RichText text={c.risks} /></section>
        {c.stopRule && (
          <div className="notice stop" role="note">
            <strong>危险操作请停止，并交给现场负责人。</strong>
            <RichText text={c.stopRule} />
          </div>
        )}
      </div>

      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className="step">
            <p className="step-no">步骤 {i + 1}</p>
            <RichText text={s.action} />
            {s.mediaIds.length > 0 && (
              <div className="step-shots">
                {s.mediaIds.map((id) => <ShotThumb key={id} shot={{ id, alt: `步骤 ${i + 1} 的画面`, rev: mediaRev.get(id) }} />)}
              </div>
            )}
            <dl>
              {s.expected && (<><dt>预期</dt><dd><RichText text={s.expected} /></dd></>)}
              {s.success && (<><dt>怎样算成功</dt><dd><RichText text={s.success} /></dd></>)}
              {s.ifFailed && (<><dt>若无效</dt><dd><RichText text={s.ifFailed} /></dd></>)}
            </dl>
          </li>
        ))}
      </ol>

      <div className="cond-box" style={{ marginTop: 16 }}>
        <section><h2>验证成功</h2><RichText text={c.verify} /></section>
        {c.evidence.trim() && <section><h2>来源</h2><RichText text={c.evidence} /></section>}
      </div>
    </>
  );
}
