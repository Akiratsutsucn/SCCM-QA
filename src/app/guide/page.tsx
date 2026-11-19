/** 按步骤排查入口：有已发布引导则进入根问题；可「继续上次」。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Shell, BackHome } from '@/components/Shell';
import { ContinueGuide } from '@/components/client/Track';
import { getDb } from '@/lib/db';
import { publishedGuide } from '@/lib/guides';

export const metadata: Metadata = { title: '按步骤排查' };

type Props = { searchParams: Promise<{ start?: string }> };

export default async function GuideEntry({ searchParams }: Props) {
  const { start } = await searchParams;
  const guide = await publishedGuide(await getDb());
  if (!guide) {
    return (
      <Shell>
        <div className="subbar"><BackHome /></div>
        <h1>按步骤排查</h1>
        <div className="card empty" style={{ marginTop: 18 }}>
          <p>暂无已发布的排查引导。</p>
          <div className="row">
            <Link className="btn" href="/">用错误码搜索</Link>
            <Link className="btn" href="/feedback?from=guide">告诉管理员</Link>
          </div>
        </div>
      </Shell>
    );
  }
  const rootHref = `/guide/${guide.rootId}`;
  if (start === '1') redirect(rootHref);
  return (
    <Shell>
      <div className="subbar"><BackHome /></div>
      <h1>按步骤排查</h1>
      <p className="muted" style={{ marginTop: 8 }}>一次只问一个你现在能看见的问题，大约 3 次点选后给出可以先看的办法。拿不准就选「不确定」。</p>
      <div className="stack" style={{ marginTop: 20 }}>
        <ContinueGuide rootHref={rootHref} />
        <Link className="btn btn-primary btn-block" href={rootHref}>开始排查</Link>
      </div>
    </Shell>
  );
}
