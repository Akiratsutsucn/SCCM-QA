/**
 * 引导节点 /guide/:nodeId?p=<路径>。路径 p 为已答 "节点.选项" 列表，作为进度真相写在 URL 中；
 * 每次点选都是新的历史记录，浏览器返回即回到上一问。
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { Shell, BackHome } from '@/components/Shell';
import { GuideMemory, TrackLink } from '@/components/client/Track';
import { getDb } from '@/lib/db';
import { publishedGuide } from '@/lib/guides';
import { publishedSummaries } from '@/lib/articles';
import { TARGET_DEPTH, type GuideSnapshot } from '@/lib/guide';

export const metadata: Metadata = { title: '按步骤排查' };

type Props = { params: Promise<{ nodeId: string }>; searchParams: Promise<{ p?: string }> };

function parseTrail(p: string | undefined, g: GuideSnapshot) {
  const out: { nodeId: number; optionId: number; label: string; question: string }[] = [];
  for (const part of (p || '').split(',').slice(0, 20)) {
    const [n, o] = part.split('.').map(Number);
    const node = g.nodes[String(n)];
    const opt = node?.options.find((x) => x.id === o);
    if (node && opt) out.push({ nodeId: n, optionId: o, label: opt.label, question: node.title });
  }
  return out;
}

const trailStr = (t: { nodeId: number; optionId: number }[]) => t.map((x) => `${x.nodeId}.${x.optionId}`).join(',');

function Candidates({ list, prevHref }: { list: Awaited<ReturnType<typeof publishedSummaries>>; prevHref: string | null }) {
  return (
    <>
      {list.length > 0 ? (
        <>
          <p style={{ marginTop: 18 }}>根据刚才的选择，可以先看这些办法。</p>
          <ul className="result-list" style={{ marginTop: 12 }}>
            {list.map((a) => (
              <li key={a.id} className="result">
                <div className="meta"><span className="tag mint">{a.stage}</span></div>
                <Link className="title" href={`/a/${a.slug}`}>{a.title}</Link>
                <p className="muted small">{a.summary}</p>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 20 }} className="muted">都不像？</p>
        </>
      ) : (
        <div className="card empty" style={{ marginTop: 18 }}>
          <p>这一支还没有收录办法。</p>
          <p className="muted">可以告诉管理员，或用错误码搜索。</p>
        </div>
      )}
      <div className="guide-actions">
        {prevHref ? <Link className="btn" href={prevHref}>返回上一步</Link> : <span />}
        <span className="row">
          <Link className="btn" href="/">用错误码搜索</Link>
          <Link className="btn btn-primary" href="/feedback?from=guide">告诉管理员</Link>
        </span>
      </div>
    </>
  );
}

export default async function GuideNodePage({ params, searchParams }: Props) {
  const [{ nodeId }, { p }] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const g = await publishedGuide(db);
  const node = g?.nodes[String(Number(nodeId))];
  if (!g || !node) {
    return (
      <Shell>
        <div className="subbar"><BackHome /></div>
        <div className="card empty">
          <p>这一步已经不存在（引导可能刚更新过）。</p>
          <div className="row"><Link className="btn btn-primary" href="/guide">重新开始排查</Link></div>
        </div>
      </Shell>
    );
  }
  const trail = parseTrail(p, g);
  const step = trail.length + 1;
  const prev = trail[trail.length - 1];
  const prevHref = prev ? `/guide/${prev.nodeId}${trail.length > 1 ? `?p=${trailStr(trail.slice(0, -1))}` : ''}` : null;
  const selfHref = `/guide/${node.id}${p ? `?p=${trailStr(trail)}` : ''}`;

  let terminalList: Awaited<ReturnType<typeof publishedSummaries>> | null = null;
  if (node.kind === 'terminal') terminalList = await publishedSummaries(db, node.articleIds);
  const options = node.kind === 'question' ? [...node.options].sort((a, b) => Number(a.isUnsure) - Number(b.isUnsure)) : [];
  const articleTargets = await publishedSummaries(db, options.map((o) => o.targetArticleId).filter((x): x is number => x != null));
  const slugOf = new Map(articleTargets.map((a) => [a.id, a.slug]));

  return (
    <Shell>
      <GuideMemory url={node.kind === 'terminal' ? null : selfHref} />
      <div className="subbar split">
        <BackHome />
        <span className="progress">{node.kind === 'question' ? `大约 ${Math.min(step, TARGET_DEPTH)} / ${Math.max(TARGET_DEPTH, step)}` : '初步结果'}</span>
      </div>
      {trail.length > 0 && (
        <p className="trail">已选：{trail.map((t) => t.label).join(' → ')}</p>
      )}

      {node.kind === 'terminal' ? (
        <>
          <h1 className="guide-q">{node.title}</h1>
          <Candidates list={terminalList ?? []} prevHref={prevHref} />
        </>
      ) : (
        <>
          <h1 className="guide-q">{node.title}</h1>
          <div className="options" role="list">
            {options.map((o) => {
              const nextTrail = trailStr([...trail, { nodeId: node.id, optionId: o.id }]);
              const target = o.targetNodeId != null && g.nodes[String(o.targetNodeId)]
                ? `/guide/${o.targetNodeId}?p=${nextTrail}`
                : o.targetArticleId != null && slugOf.has(o.targetArticleId)
                  ? `/a/${slugOf.get(o.targetArticleId)}?from=guide&p=${encodeURIComponent(`${node.id}:${nextTrail}`)}`
                  : `/feedback?from=guide`;
              return (
                <TrackLink key={o.id} href={target} className={`option ${o.isUnsure ? 'unsure' : ''}`} event={{ type: 'guide_answer', nodeId: node.id, optionId: o.id }}>
                  {o.label}
                </TrackLink>
              );
            })}
          </div>
          <div className="guide-actions">
            {prevHref ? <Link className="btn" href={prevHref}>返回上一步</Link> : <span />}
            <Link className="btn" href="/">退出排查</Link>
          </div>
        </>
      )}
    </Shell>
  );
}
