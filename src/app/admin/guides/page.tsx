/**
 * 分支引导编辑：节点列表 + 选项指向（节点或文章）。窄屏同样是列表，不需要横屏画布。
 * 发布前跑校验（循环、死链、孤岛、缺「不确定」、指向草稿）；深度 > 3 或终端 > 5 篇只警告。
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/AdminShell';
import { ActionForm } from '@/components/admin/ActionForm';
import { getDb } from '@/lib/db';
import { checkTree, loadNodes, mainTree } from '@/lib/guides';
import {
  addNodeAction, addOptionAction, deleteNodeAction, deleteOptionAction, publishGuideAction,
  setRootAction, unpublishGuideAction, updateNodeAction, updateOptionAction,
} from '../actions';
import { fmtDateTime } from '@/lib/time';

export const metadata: Metadata = { title: '引导' };

export default async function GuidesPage() {
  const user = await requireAdmin();
  const db = await getDb();
  const tree = await mainTree(db);
  const [nodes, issues, articles] = await Promise.all([
    loadNodes(db, tree.id),
    checkTree(db, tree.id),
    db.query<{ id: number; title: string; status: string }>(`SELECT id, coalesce(published->>'title', draft->>'title') AS title, status FROM articles WHERE status <> 'archived' ORDER BY updated_at DESC`),
  ]);
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warning');
  const artTitle = new Map(articles.map((a) => [a.id, `${a.title}${a.status === 'draft' ? '（草稿）' : ''}`]));
  const targetSelect = (value: string) => (
    <select name="target" defaultValue={value} required>
      <option value="">选择去向</option>
      <optgroup label="下一个节点">
        {nodes.map((n) => <option key={n.id} value={`n:${n.id}`}>{n.kind === 'question' ? '问' : '果'} #{n.id} {n.title}</option>)}
      </optgroup>
      <optgroup label="直接进入文章">
        {articles.map((a) => <option key={a.id} value={`a:${a.id}`}>{artTitle.get(a.id)}</option>)}
      </optgroup>
    </select>
  );

  return (
    <AdminShell current="/admin/guides" user={user.username}>
      <div className="split" style={{ marginBottom: 8 }}>
        <h1>{tree.name}</h1>
        <div className="row">
          {tree.published_snapshot && <Link className="btn" href="/guide" target="_blank">查看操作端</Link>}
          {tree.published_snapshot && (
            <form action={unpublishGuideAction}><button className="btn btn-danger" type="submit">从操作端撤下</button></form>
          )}
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        {tree.published_at ? `操作端当前版本发布于 ${fmtDateTime(tree.published_at)}。修改不会立即生效，需要重新发布。` : '尚未发布，操作端显示「暂无已发布的排查引导」。'}
        一次只问一个可观察问题；每个问题都要有「不确定」。
      </p>

      <div className="card pad" style={{ marginBottom: 18 }}>
        <div className="split">
          <strong>发布前校验</strong>
          <ActionForm action={publishGuideAction}><button className="btn btn-primary" type="submit">校验并发布</button></ActionForm>
        </div>
        {errs.length === 0 && warns.length === 0 && <p className="small muted" style={{ marginTop: 6 }}>当前没有发现问题。</p>}
        {errs.length > 0 && <div className="errors" style={{ marginTop: 10 }}><strong>必须处理（{errs.length}）</strong><ul>{errs.map((e, i) => <li key={i}>{e.message}</li>)}</ul></div>}
        {warns.length > 0 && <div className="warns" style={{ marginTop: 10 }}><strong>提醒</strong><ul>{warns.map((e, i) => <li key={i}>{e.message}</li>)}</ul></div>}
      </div>

      <div className="stack">
        {nodes.map((n) => (
          <section key={n.id} id={`n${n.id}`} className="card pad stack-sm">
            <div className="split">
              <span className="row">
                <span className={`status ${n.kind === 'question' ? '' : 'published'}`}>{n.kind === 'question' ? '问题' : '结果'} #{n.id}</span>
                {tree.root_node_id === n.id && <span className="status draft">根问题</span>}
              </span>
              <span className="row">
                {n.kind === 'question' && tree.root_node_id !== n.id && (
                  <form action={setRootAction}><input type="hidden" name="id" value={n.id} /><button className="btn btn-sm" type="submit">设为根问题</button></form>
                )}
                <form action={deleteNodeAction}><input type="hidden" name="id" value={n.id} /><button className="btn btn-sm btn-danger" type="submit">删除节点</button></form>
              </span>
            </div>
            <form action={updateNodeAction} className="stack-sm">
              <input type="hidden" name="id" value={n.id} />
              <label htmlFor={`t${n.id}`}>{n.kind === 'question' ? '问题（操作员能看见的现象）' : '结果标题'}</label>
              <div className="row">
                <input id={`t${n.id}`} name="title" type="text" defaultValue={n.title} maxLength={200} style={{ flex: '1 1 260px' }} />
                {n.kind === 'question' && <button className="btn btn-sm" type="submit">保存问题</button>}
              </div>
              {n.kind === 'terminal' && (
                <>
                  <p className="small muted">要展示的文章（建议不超过 5 篇；没有文章时操作端会引导去「告诉管理员」）：</p>
                  <div className="chips">
                    {articles.map((a) => (
                      <label key={a.id} className="check chip" style={{ fontWeight: 400 }}>
                        <input type="checkbox" name="articleIds" value={a.id} defaultChecked={n.articleIds.includes(a.id)} />{artTitle.get(a.id)}
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-sm" type="submit">保存结果</button>
                </>
              )}
            </form>

            {n.kind === 'question' && (
              <>
                <ul className="list">
                  {n.options.map((o) => (
                    <li key={o.id}>
                      <form action={updateOptionAction} className="row">
                        <input type="hidden" name="id" value={o.id} />
                        {o.isUnsure && <span className="status">不确定</span>}
                        <input name="label" type="text" defaultValue={o.label} maxLength={120} style={{ flex: '1 1 180px' }} aria-label="选项文字" />
                        <span style={{ flex: '1 1 220px' }}>{targetSelect(o.targetNodeId ? `n:${o.targetNodeId}` : o.targetArticleId ? `a:${o.targetArticleId}` : '')}</span>
                        <button className="btn btn-sm" type="submit">保存</button>
                      </form>
                      <form action={deleteOptionAction} style={{ marginTop: 6 }}>
                        <input type="hidden" name="id" value={o.id} />
                        <button className="btn btn-sm btn-quiet" type="submit">删除选项</button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addOptionAction} className="row">
                  <input type="hidden" name="nodeId" value={n.id} />
                  <input name="label" type="text" placeholder="新选项文字" maxLength={120} required style={{ flex: '1 1 180px' }} />
                  <span style={{ flex: '1 1 220px' }}>{targetSelect('')}</span>
                  <label className="check"><input type="checkbox" name="isUnsure" />这是「不确定」</label>
                  <button className="btn btn-sm btn-primary" type="submit">添加选项</button>
                </form>
              </>
            )}
          </section>
        ))}
      </div>

      <div className="card pad" style={{ marginTop: 18 }}>
        <strong>新增节点</strong>
        <form action={addNodeAction} className="row" style={{ marginTop: 10 }}>
          <select name="kind" defaultValue="question" style={{ width: 'auto' }}>
            <option value="question">问题</option>
            <option value="terminal">结果（文章列表）</option>
          </select>
          <input name="title" type="text" placeholder="例如：现在停在哪一步？" maxLength={200} style={{ flex: '1 1 260px' }} />
          <button className="btn btn-primary" type="submit">新增</button>
        </form>
        <p className="hint">新问题会自动带一个「不确定」选项，请记得设置它的去向。</p>
      </div>
    </AdminShell>
  );
}
