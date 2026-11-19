/** 主区域：问题分支选择。一次一问，大按钮；上方是已选路径，可点任一步回退。 */
import Link from 'next/link';
import type { GuideSnapshot } from '@/lib/guide';
import { TrackLink } from '@/components/client/Track';
import { homeHref } from './url';

type Summary = { id: number; slug: string; title: string; stage: string };

export function parseTrail(p: string | undefined, g: GuideSnapshot) {
  const out: { nodeId: number; optionId: number; label: string }[] = [];
  for (const part of (p || '').split(',').slice(0, 20)) {
    const [n, o] = part.split('.').map(Number);
    const opt = g.nodes[String(n)]?.options.find((x) => x.id === o);
    if (opt) out.push({ nodeId: n, optionId: o, label: opt.label });
  }
  return out;
}

export const trailStr = (t: { nodeId: number; optionId: number }[]) => t.map((x) => `${x.nodeId}.${x.optionId}`).join(',');

export function Trail({ g, trail }: { g: GuideSnapshot; trail: ReturnType<typeof parseTrail> }) {
  if (!trail.length) return null;
  return (
    <nav className="trail-bar" aria-label="已选">
      <Link className="crumb" href="/">重来</Link>
      {trail.map((t, i) => (
        <Link key={i} className="crumb" href={homeHref({ n: t.nodeId, p: trailStr(trail.slice(0, i)) || undefined })}>{t.label}</Link>
      ))}
    </nav>
  );
}

export function GuidePanel({ g, nodeId, p, articles }: { g: GuideSnapshot; nodeId: number; p?: string; articles: Map<number, Summary> }) {
  const node = g.nodes[String(nodeId)] ?? g.nodes[String(g.rootId)];
  const trail = parseTrail(p, g);

  if (node.kind === 'terminal') {
    const list = node.articleIds.map((id) => articles.get(id)).filter((x): x is Summary => !!x);
    return (
      <>
        <Trail g={g} trail={trail} />
        <h2 className="q">{list.length ? '可能是下面这个' : '这里还没有办法'}</h2>
        <div className="choices one">
          {list.map((a) => (
            <Link key={a.id} className="choice" href={homeHref({ a: a.slug, n: node.id, p })}>{a.title}</Link>
          ))}
        </div>
      </>
    );
  }

  const options = [...node.options].sort((a, b) => Number(a.isUnsure) - Number(b.isUnsure));
  return (
    <>
      <Trail g={g} trail={trail} />
      <h2 className="q">{node.title}</h2>
      <div className="choices">
        {options.map((o) => {
          const next = trailStr([...trail, { nodeId: node.id, optionId: o.id }]);
          const art = o.targetArticleId != null ? articles.get(o.targetArticleId) : undefined;
          const href = o.targetNodeId != null && g.nodes[String(o.targetNodeId)]
            ? homeHref({ n: o.targetNodeId, p: next })
            : art ? homeHref({ a: art.slug, n: node.id, p: next }) : homeHref({ n: node.id, p });
          return (
            <TrackLink key={o.id} href={href} className={`choice ${o.isUnsure ? 'unsure' : ''}`} event={{ type: 'guide_answer', nodeId: node.id, optionId: o.id }}>
              {o.label}
            </TrackLink>
          );
        })}
      </div>
    </>
  );
}
