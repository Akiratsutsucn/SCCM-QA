/** 设置：保留期限、复核周期、限流；阶段/症状词汇；同义词；最近审计日志。 */
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { addSynonymAction, addVocabAction, deleteSynonymAction, runPurgeAction, saveSettingsAction, updateVocabAction } from '../actions';
import { fmtDateTime } from '@/lib/time';

export const metadata: Metadata = { title: '设置' };

const TARGET: Record<string, string> = { phrase: '短语', code: '错误码', article: '文章' };

export default async function SettingsPage() {
  const user = await requireAdmin();
  const db = await getDb();
  const [s, vocab, syns, audit, articles] = await Promise.all([
    getSettings(db),
    db.query<{ id: number; kind: string; label: string; active: boolean }>('SELECT * FROM vocabularies ORDER BY kind, sort, id'),
    db.query<{ id: number; phrase: string; target_type: string; target_value: string }>('SELECT * FROM synonyms ORDER BY created_at DESC LIMIT 300'),
    db.query<{ id: number; actor: string; action: string; created_at: string }>('SELECT id, actor, action, created_at FROM audit_log ORDER BY id DESC LIMIT 30'),
    db.query<{ id: number; title: string }>(`SELECT id, published->>'title' AS title FROM articles WHERE status = 'published'`),
  ]);
  const artTitle = new Map(articles.map((a) => [String(a.id), a.title]));
  const vocabBlock = (kind: 'stage' | 'symptom', title: string) => (
    <section className="card pad stack-sm">
      <h2 style={{ fontSize: '1rem' }}>{title}</h2>
      <ul className="list">
        {vocab.filter((v) => v.kind === kind).map((v) => (
          <li key={v.id}>
            <form action={updateVocabAction} className="row">
              <input type="hidden" name="id" value={v.id} />
              <input name="label" type="text" defaultValue={v.label} maxLength={40} style={{ flex: '1 1 160px' }} aria-label="名称" />
              <label className="check"><input type="checkbox" name="active" defaultChecked={v.active} />启用</label>
              <button className="btn btn-sm" type="submit">保存</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addVocabAction} className="row">
        <input type="hidden" name="kind" value={kind} />
        <input name="label" type="text" placeholder="新增" maxLength={40} required style={{ flex: '1 1 160px' }} />
        <button className="btn btn-sm" type="submit">新增</button>
      </form>
      {kind === 'stage' && <p className="hint">改阶段名不会自动改已有文章里的阶段，请同步修改文章后重新发布。</p>}
    </section>
  );

  return (
    <AdminShell current="/admin/settings" user={user.username}>
      <h1 style={{ marginBottom: 16 }}>设置</h1>
      <div className="editor-grid" style={{ gap: 18 }}>
        <section className="card pad">
          <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>保留与复核</h2>
          <ActionForm action={saveSettingsAction}>
            <div className="field"><label htmlFor="raw">搜索原词与逐条事件保留（天）</label><input id="raw" name="rawRetentionDays" type="number" min={1} max={365} defaultValue={s.rawRetentionDays} /></div>
            <div className="field"><label htmlFor="agg">按日聚合统计保留（天）</label><input id="agg" name="aggregateRetentionDays" type="number" min={1} max={730} defaultValue={s.aggregateRetentionDays} /></div>
            <div className="field"><label htmlFor="rev">文章复核周期（天，超过只提醒，不下架）</label><input id="rev" name="reviewCycleDays" type="number" min={7} max={730} defaultValue={s.reviewCycleDays} /></div>
            <label className="check"><input type="checkbox" name="strictRateLimit" defaultChecked={s.strictRateLimit} />被刷时开启更严的匿名提交限流</label>
            <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>保存设置</button>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 12 }}>上次清理：{s.lastPurgeAt ? fmtDateTime(s.lastPurgeAt) : '尚未执行'}。服务每 6 小时检查，距上次超过 24 小时即清理。</p>
          <form action={runPurgeAction} style={{ marginTop: 8 }}><button className="btn btn-sm" type="submit">立即执行聚合与清理</button></form>
        </section>
        <section className="card pad stack-sm">
          <h2 style={{ fontSize: '1rem' }}>同义词 / 错误码别名</h2>
          <p className="hint">操作员输入中包含「口语」时，搜索会额外匹配右侧目标。例如「卡 44」→ 短语「卡在 44%」。</p>
          <form action={addSynonymAction} className="stack-sm">
            <input name="phrase" type="text" placeholder="口语，如：卡44" maxLength={100} required />
            <div className="row">
              <select name="targetType" defaultValue="phrase" style={{ width: 'auto' }}>
                <option value="phrase">短语</option><option value="code">错误码</option><option value="article">文章 ID</option>
              </select>
              <input name="targetValue" type="text" placeholder="目标" maxLength={100} required style={{ flex: '1 1 160px' }} />
              <button className="btn btn-sm" type="submit">添加</button>
            </div>
          </form>
          <ul className="list">
            {syns.length === 0 && <li className="muted">暂无。</li>}
            {syns.map((x) => (
              <li key={x.id} className="split">
                <span>{x.phrase} → {TARGET[x.target_type]}：{x.target_type === 'article' ? artTitle.get(x.target_value) ?? `#${x.target_value}` : x.target_value}</span>
                <form action={deleteSynonymAction}><input type="hidden" name="id" value={x.id} /><button className="btn btn-sm btn-quiet" type="submit">删除</button></form>
              </li>
            ))}
          </ul>
        </section>
        {vocabBlock('stage', '阶段词汇')}
        {vocabBlock('symptom', '症状标签')}
        <section className="card pad full">
          <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>最近审计日志</h2>
          <ul className="list">
            {audit.map((a) => <li key={a.id} className="small">{fmtDateTime(a.created_at)} · {a.actor} · {a.action}</li>)}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
