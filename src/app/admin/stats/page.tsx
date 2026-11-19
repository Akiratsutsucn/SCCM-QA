/** 统计：标题先写口径再写数字。没有「故障率」，没有总览 KPI 大数字。 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { checkTree, mainTree } from '@/lib/guides';
import { contentHealth, perArticle, reportStats, usageStats } from '@/lib/stats';

export const metadata: Metadata = { title: '统计' };

type Props = { searchParams: Promise<{ days?: string }> };

function Num({ label, n, note }: { label: string; n: number; note?: string }) {
  return (
    <div className="kpi" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <span>{label}</span>
      <b>{n}</b>
      {note && <span className="small">{note}</span>}
    </div>
  );
}

export default async function StatsPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const days = (await searchParams).days === '30' ? 30 : 7;
  const db = await getDb();
  const s = await getSettings(db);
  const [usage, reports, articles, health, tree] = await Promise.all([usageStats(db, days), reportStats(db, days), perArticle(db, days), contentHealth(db, s.reviewCycleDays), mainTree(db)]);
  const guideErrors = (tree.root_node_id || tree.published_snapshot ? await checkTree(db, tree.id) : []).filter((i) => i.level === 'error').length;

  return (
    <AdminShell current="/admin/stats" user={user.username}>
      <div className="split">
        <h1>统计</h1>
        <div className="row">
          <div className="chips">
            <Link className="chip" aria-current={days === 7} href="/admin/stats?days=7">最近 7 天</Link>
            <Link className="chip" aria-current={days === 30} href="/admin/stats?days=30">最近 30 天</Link>
          </div>
          <a className="btn btn-sm" href={`/admin/stats/export?days=${days}`}>导出 CSV</a>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>时区 Asia/Shanghai。逐条数据保留 {s.rawRetentionDays} 天，按日聚合保留 {s.aggregateRetentionDays} 天。</p>

      <section className="stat-sec">
        <h2>使用情况</h2>
        <p className="scope">以下均不等于故障发生次数：同一人反复搜、多人搜同一码、搜错再搜都会推高搜索量。</p>
        <div className="kpis">
          <Num label="搜索提交" n={usage.submits} />
          <Num label="结果为 0 的搜索" n={usage.zero} />
          <Num label="有结果无点击" n={usage.noclick} />
          <Num label="办法页浏览（每会话每篇记 1 次）" n={usage.views} />
          <Num label="引导点选" n={usage.guideAnswers} />
          <Num label="图集点开（只记点选）" n={usage.galleryPicks} />
        </div>
      </section>

      <section className="stat-sec">
        <h2>匿名自报发生量</h2>
        <p className="scope">来自办法页「这台也遇到了」。无登录、无资产基数；「会话」是打开本站的浏览器排障会话，不等于被升级的电脑；同一浏览器处理多台、清理存储、换手机、两人处理同一台都会造成偏差，跨人重复无法完美排除；没有按 IP 合并（现场多为 NAT）。本系统不能给出全网故障率。</p>
        <div className="kpis">
          <Num label="「这台也遇到了」生效次数" n={reports.encounter.n} />
          <Num label="去重后的会话数" n={reports.encounter.sessions} note="聚合期按日去重后相加，可能偏大" />
          <Num label="自报受影响台数合计" n={reports.encounter.units} note={`其中 ${reports.capped} 次填了上限 20，请单独核实`} />
        </div>
      </section>

      <section className="stat-sec">
        <h2>结果反馈</h2>
        <p className="scope">同一会话同一篇只保留最后一次结论；「改口次数」用于去噪。</p>
        <div className="kpis">
          <Num label="已解决" n={reports.resolved.n} />
          <Num label="没解决" n={reports.unresolved.n} />
          <Num label="同一会话改口次数" n={reports.changes} />
        </div>
      </section>

      <section className="stat-sec">
        <h2>按文章（最近 {days} 天逐条数据）</h2>
        {articles.length === 0 ? <div className="card empty"><p>暂无数据。</p></div> : (
          <table className="table responsive">
            <thead><tr><th>文章</th><th>浏览</th><th>这台也遇到了</th><th>会话</th><th>自报台数</th><th>已解决</th><th>没解决</th></tr></thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td data-label="文章"><Link href={`/admin/articles/${a.id}/edit`}>{a.title}</Link></td>
                  <td data-label="浏览" className="num">{a.views}</td>
                  <td data-label="这台也遇到了" className="num">{a.encounter}</td>
                  <td data-label="会话" className="num">{a.encounter_sessions}</td>
                  <td data-label="自报台数" className="num">{a.units}</td>
                  <td data-label="已解决" className="num">{a.resolved}</td>
                  <td data-label="没解决" className="num">{a.unresolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="stat-sec">
        <h2>内容健康</h2>
        <div className="kpis">
          <Num label="已发布" n={health.published} />
          <Num label="草稿" n={health.drafts} />
          <Num label={`待复核（>${s.reviewCycleDays} 天）`} n={health.review} />
          <Num label="已下线" n={health.archived} />
          <Num label="图片文件缺失" n={health.broken} />
          <Num label="未确认脱敏的图片" n={health.unchecked} />
          <Num label="引导校验错误" n={guideErrors} />
        </div>
      </section>
    </AdminShell>
  );
}
