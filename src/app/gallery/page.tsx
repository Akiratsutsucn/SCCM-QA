/** 看图找问题：管理员上传的脱敏截图 + 阶段 / 症状过滤（进查询串）。不做上传识别。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { Shell, BackHome } from '@/components/Shell';
import { GalleryShot } from '@/components/client/Track';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: '看图找问题' };

type Props = { searchParams: Promise<{ stage?: string; tag?: string }> };

export default async function GalleryPage({ searchParams }: Props) {
  const { stage = '', tag = '' } = await searchParams;
  const db = await getDb();
  const rows = await db.query<{ id: string; caption: string; stage: string | null; tags: string[]; rev: number; slug: string; title: string; astage: string }>(
    `SELECT m.id, m.caption, m.stage, m.tags, m.rev, a.slug, a.published->>'title' AS title, a.published->>'stage' AS astage
       FROM media m JOIN articles a ON a.id = m.article_id
      WHERE m.in_gallery AND m.is_public AND a.status = 'published'
      ORDER BY m.created_at DESC LIMIT 300`,
  );
  const stageOf = (r: (typeof rows)[0]) => r.stage || r.astage;
  const stages = [...new Set(rows.map(stageOf))].filter(Boolean);
  const tags = [...new Set(rows.flatMap((r) => r.tags))].filter(Boolean);
  const shown = rows.filter((r) => (!stage || stageOf(r) === stage) && (!tag || r.tags.includes(tag)));
  const href = (s: string, t: string) => {
    const p = new URLSearchParams();
    if (s) p.set('stage', s);
    if (t) p.set('tag', t);
    const qs = p.toString();
    return qs ? `/gallery?${qs}` : '/gallery';
  };

  return (
    <Shell>
      <div className="subbar"><BackHome /></div>
      <div className="page-title"><h1>看图找问题</h1></div>
      <p className="muted">对照管理员提供的脱敏画面。本站不会识别你手机拍的照片，也不能上传照片。</p>

      {rows.length === 0 ? (
        <div className="card empty" style={{ marginTop: 18 }}>
          <p>还没有已发布的报错画面。</p>
          <div className="row">
            <Link className="btn" href="/">用错误码搜索</Link>
            <Link className="btn" href="/guide">按步骤排查</Link>
            <Link className="btn" href="/feedback?from=gallery">告诉管理员</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="stack-sm" style={{ marginTop: 18 }}>
            <p className="small muted">阶段</p>
            <div className="chips">
              <Link className="chip" aria-current={!stage} href={href('', tag)}>全部</Link>
              {stages.map((s) => <Link key={s} className="chip" aria-current={stage === s} href={href(s, tag)}>{s}</Link>)}
            </div>
            {tags.length > 0 && (
              <>
                <p className="small muted" style={{ marginTop: 12 }}>症状</p>
                <div className="chips">
                  {tag && <Link className="chip" href={href(stage, '')}>不限症状</Link>}
                  {tags.map((t) => <Link key={t} className="chip" aria-current={tag === t} href={href(stage, t)}>{t}</Link>)}
                </div>
              </>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="card empty" style={{ marginTop: 18 }}><p>这个条件下没有画面，换一个阶段或症状试试。</p></div>
          ) : (
            <ul className="gallery-grid" style={{ listStyle: 'none', padding: 0 }}>
              {shown.map((r) => (
                <li key={r.id} className="shot">
                  <GalleryShot shot={{ id: r.id, alt: r.caption || r.title, rev: r.rev }} href={`/a/${r.slug}`} />
                  <div className="cap">
                    <span className="tag mint">{stageOf(r)}</span>
                    {r.tags[0] && <span className="tag">{r.tags[0]}</span>}
                    <Link href={`/a/${r.slug}`} className="small" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>{r.title}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Shell>
  );
}
