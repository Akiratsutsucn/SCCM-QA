'use client';
/** 带上报的链接：搜索结果点击（search_click）、引导选项（guide_answer）、图集选图（gallery_view）。 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession, sendEvent } from './session';
import { ShotThumb, type Shot } from './ImageViewer';

/** 「← 返回」：有站内历史时用浏览器后退（恢复搜索词或引导节点），否则回首页。 */
export function BackButton() {
  return (
    <button type="button" className="btn btn-quiet" onClick={() => {
      if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back();
      else location.href = '/';
    }}>← 返回</button>
  );
}

const GUIDE_KEY = 'w11.guide';

/** 记住引导进度（当前节点 URL），退出后可「继续上次」。 */
export function GuideMemory({ url }: { url: string | null }) {
  useEffect(() => {
    try {
      if (url) localStorage.setItem(GUIDE_KEY, url);
      else localStorage.removeItem(GUIDE_KEY);
    } catch {
      /* ignore */
    }
  }, [url]);
  return null;
}

export function ContinueGuide({ rootHref }: { rootHref: string }) {
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(GUIDE_KEY);
      if (v && v.startsWith('/guide/') && v !== rootHref) setLast(v);
    } catch {
      /* ignore */
    }
  }, [rootHref]);
  if (!last) return null;
  return (
    <div className="notice row" style={{ justifyContent: 'space-between' }}>
      <span>上次排查还没走完。</span>
      <span className="row">
        <Link className="btn btn-primary" href={last}>继续上次</Link>
        <Link className="btn" href={rootHref} onClick={() => localStorage.removeItem(GUIDE_KEY)}>从头开始</Link>
      </span>
    </div>
  );
}

/** 图集里的一张图：点开记 gallery_view（只记点选，不记单纯浏览）。 */
export function GalleryShot({ shot, href }: { shot: Shot; href: string | null }) {
  return (
    <ShotThumb
      shot={shot}
      action={href ? { href, label: '就是这个' } : undefined}
      onOpen={() => { getSession(); void sendEvent({ type: 'gallery_view', mediaId: shot.id }); }}
    />
  );
}

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
