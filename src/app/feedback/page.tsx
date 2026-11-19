/** 未收录反馈：极短表单，不是工单。 */
import type { Metadata } from 'next';
import { Shell } from '@/components/Shell';
import { BackButton } from '@/components/client/Track';
import { FeedbackForm } from '@/components/client/FeedbackForm';
import { getDb } from '@/lib/db';
import { stageLabels } from '@/lib/articles';
import { clip } from '@/lib/redact';

export const metadata: Metadata = { title: '告诉管理员' };

type Props = { searchParams: Promise<{ text?: string; from?: string; ref?: string }> };

export default async function FeedbackPage({ searchParams }: Props) {
  const { text, from, ref } = await searchParams;
  const stages = await stageLabels(await getDb());
  const context = [clip(from, 20), clip(ref, 20)].filter(Boolean).join(':');
  return (
    <Shell>
      <div className="subbar"><BackButton /></div>
      <h1>告诉管理员</h1>
      <p className="muted" style={{ margin: '6px 0 20px' }}>没找到办法时留一句话，管理员更新内容时会查看。不会形成工单，也不会回访。</p>
      <div className="card pad">
        <FeedbackForm stages={stages} defaultText={clip(text, 200)} context={context} />
      </div>
    </Shell>
  );
}
