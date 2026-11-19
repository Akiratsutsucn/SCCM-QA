'use client';
/** 带匿名上报的链接：搜索结果点击（search_click）、分支选项（guide_answer）。 */
import Link from 'next/link';
import { getSession, sendEvent } from './session';

export function TrackLink({ href, event, className, children }: {
  href: string;
  event: Record<string, unknown>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => { getSession(); void sendEvent(event); }}>
      {children}
    </Link>
  );
}
