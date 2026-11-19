import Link from 'next/link';
import { Shell } from '@/components/Shell';

export default function NotFound() {
  return (
    <Shell>
      <div className="card empty">
        <p>没有这个页面。</p>
        <div className="row">
          <Link className="btn btn-primary" href="/">回首页搜索</Link>
          <Link className="btn" href="/guide">按步骤排查</Link>
        </div>
      </div>
    </Shell>
  );
}
