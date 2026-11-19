'use server';
/**
 * 管理端 Server Actions。
 * - 每个 action 开头调用 requireAdmin()：未登录直接跳转登录页（前端隐藏不是控制手段）。
 * - Next.js Server Actions 自带 Origin/Host 校验（防 CSRF）；会话 cookie 为 SameSite=Strict。
 * - 关键动作写 audit_log。
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { ADMIN_COOKIE, audit, login, logout, requireAdmin, secureCookies } from '@/lib/auth';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { ContentSchema, emptyContent, templateContent } from '@/lib/content';
import { archiveArticle, createArticle, getArticle, publishArticle, restoreVersion, saveDraft } from '@/lib/articles';
import { deleteMedia, editImage, refreshMediaVisibility, saveUpload, type Rect } from '@/lib/media';
import { publishTree, unpublishTree, mainTree } from '@/lib/guides';
import { saveAnnouncement, validateAnnouncement } from '@/lib/announcements';
import { setSetting } from '@/lib/settings';
import { purge } from '@/lib/retention';
import { clip } from '@/lib/redact';

export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
  at?: number;
}

const str = (fd: FormData, k: string, max = 2000) => clip(fd.get(k), max);
const int = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
const refresh = () => revalidatePath('/', 'layout');
const ok = (message: string, extra: Partial<ActionState> = {}): ActionState => ({ ok: true, message, at: Date.now(), ...extra });
const fail = (errors: string[], extra: Partial<ActionState> = {}): ActionState => ({ ok: false, errors, at: Date.now(), ...extra });

/* ---------------- 登录 / 口令 ---------------- */

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const h = await headers();
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) return fail(['尝试次数过多，请 15 分钟后再试']);
  const db = await getDb();
  const token = await login(db, str(fd, 'username', 60), String(fd.get('password') ?? '').slice(0, 200));
  if (!token) return fail(['用户名或口令不正确']);
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: 'strict', path: '/', maxAge: 12 * 3600 });
  await audit(db, str(fd, 'username', 60), 'admin.login');
  redirect('/admin');
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(await getDb(), jar.get(ADMIN_COOKIE)?.value);
  jar.delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin({ allowMustChange: true });
  const db = await getDb();
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('next') ?? '');
  if (next.length < MIN_PASSWORD_LENGTH) return fail([`新口令至少 ${MIN_PASSWORD_LENGTH} 位`]);
  if (next !== String(fd.get('confirm') ?? '')) return fail(['两次输入的新口令不一致']);
  const row = (await db.query<{ password_hash: string }>('SELECT password_hash FROM admin_users WHERE id = $1', [user.id]))[0];
  if (!row || !(await verifyPassword(current, row.password_hash))) return fail(['当前口令不正确']);
  if (current === next) return fail(['新口令不能与当前口令相同']);
  await db.query('UPDATE admin_users SET password_hash = $2, must_change = false WHERE id = $1', [user.id, await hashPassword(next)]);
  await audit(db, user.username, 'admin.change_password');
  redirect('/admin');
}

/* ---------------- 文章 ---------------- */

export async function newArticleAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const content = fd.get('template') === '1' ? templateContent() : emptyContent();
  const title = str(fd, 'title', 200);
  if (title) content.title = title;
  const symptom = str(fd, 'symptom', 200);
  if (symptom) content.symptoms = [symptom];
  const a = await createArticle(db, content);
  await audit(db, user.username, 'article.create', { id: a.id });
  redirect(`/admin/articles/${a.id}/edit`);
}

export async function saveArticleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  if (!id || !(await getArticle(db, id))) return fail(['文章不存在']);
  let content;
  try {
    content = ContentSchema.parse(JSON.parse(String(fd.get('content') ?? '{}')));
  } catch {
    return fail(['内容格式有误或超出长度限制']);
  }
  await saveDraft(db, id, content);
  if (fd.get('intent') !== 'publish') {
    refresh();
    return ok('草稿已保存');
  }
  const r = await publishArticle(db, id, user.username, { redactionConfirmed: bool(fd, 'redactionConfirmed'), note: str(fd, 'note', 300) });
  if (!r.ok) return fail(r.issues.map((i) => i.message), { message: '草稿已保存，但未发布' });
  refresh();
  return ok(`已发布为第 ${r.version} 版`);
}

export async function archiveArticleAction(fd: FormData) {
  const user = await requireAdmin();
  const id = int(fd, 'id');
  if (id) await archiveArticle(await getDb(), id, user.username);
  refresh();
}

export async function restoreVersionAction(fd: FormData) {
  const user = await requireAdmin();
  const id = int(fd, 'id');
  const v = int(fd, 'version');
  if (id && v) await restoreVersion(await getDb(), id, v, user.username);
  refresh();
  redirect(`/admin/articles/${id}/edit?restored=${v}`);
}

/* ---------------- 图片 ---------------- */

export async function uploadMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const files = fd.getAll('files').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f && f.size > 0).slice(0, 10);
  if (!files.length) return fail(['请选择图片']);
  const articleId = int(fd, 'articleId');
  const errors: string[] = [];
  let n = 0;
  for (const f of files) {
    const r = await saveUpload(db, Buffer.from(await f.arrayBuffer()), { caption: str(fd, 'caption', 200), articleId });
    if (r.ok) n += 1;
    else errors.push(`${clip(f.name, 80)}：${r.error}`);
  }
  await audit(db, user.username, 'media.upload', { count: n });
  refresh();
  return errors.length ? fail(errors, { message: `已上传 ${n} 张` }) : ok(`已上传 ${n} 张。请逐张检查并打码后勾选「已检查脱敏」。`);
}

export async function updateMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const id = str(fd, 'id', 32);
  const tags = str(fd, 'tags', 400).split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const inGallery = bool(fd, 'inGallery');
  const articleId = int(fd, 'articleId');
  if (inGallery && !tags.length) return fail(['放入图集前至少填写一个症状标签']);
  if (inGallery && !articleId) return fail(['放入图集前请关联一篇文章']);
  await db.query(
    `UPDATE media SET caption = $2, stage = $3, tags = $4, article_id = $5, in_gallery = $6, redaction_checked = $7 WHERE id = $1`,
    [id, str(fd, 'caption', 200), str(fd, 'stage', 60) || null, tags, articleId, inGallery, bool(fd, 'redactionChecked')],
  );
  await refreshMediaVisibility(db);
  await audit(db, user.username, 'media.update', { id });
  refresh();
  return ok('已保存');
}

export async function editMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const id = str(fd, 'id', 32);
  const valid = (r: unknown): r is Rect => !!r && typeof r === 'object' && ['x', 'y', 'w', 'h'].every((k) => {
    const v = (r as Record<string, unknown>)[k];
    return typeof v === 'number' && v >= 0 && v <= 1;
  });
  let edit: { crop: Rect | null; boxes: Rect[] };
  try {
    const raw = JSON.parse(String(fd.get('edit') ?? '{}'));
    edit = { crop: valid(raw.crop) ? raw.crop : null, boxes: Array.isArray(raw.boxes) ? raw.boxes.filter(valid).slice(0, 30) : [] };
  } catch {
    return fail(['编辑数据有误']);
  }
  try {
    await editImage(db, id, edit);
  } catch {
    return fail(['处理图片失败']);
  }
  await audit(db, user.username, 'media.edit', { id, boxes: edit.boxes.length, crop: !!edit.crop });
  refresh();
  return ok('已应用。图片已变更，请重新确认脱敏。');
}

export async function deleteMediaAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const id = str(fd, 'id', 32);
  await deleteMedia(db, id);
  await audit(db, user.username, 'media.delete', { id });
  refresh();
}

/* ---------------- 引导 ---------------- */

async function treeId() {
  return (await mainTree(await getDb())).id;
}

export async function addNodeAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const tid = await treeId();
  const kind = fd.get('kind') === 'terminal' ? 'terminal' : 'question';
  const title = str(fd, 'title', 200) || (kind === 'terminal' ? '可以先看这些办法' : '新问题');
  const r = await db.query<{ id: number }>('INSERT INTO guide_nodes (tree_id, kind, title) VALUES ($1, $2, $3) RETURNING id', [tid, kind, title]);
  if (kind === 'question') {
    await db.query("INSERT INTO guide_options (node_id, label, is_unsure, sort) VALUES ($1, '不确定', true, 999)", [r[0].id]);
  }
  const tree = await mainTree(db);
  if (!tree.root_node_id && kind === 'question') await db.query('UPDATE guide_trees SET root_node_id = $2 WHERE id = $1', [tid, r[0].id]);
  await audit(db, user.username, 'guide.node_add', { id: r[0].id });
  refresh();
}

export async function updateNodeAction(fd: FormData) {
  await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  const articleIds = fd.getAll('articleIds').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  await db.query('UPDATE guide_nodes SET title = $2, article_ids = $3 WHERE id = $1 AND tree_id = $4', [id, str(fd, 'title', 200), articleIds, await treeId()]);
  refresh();
}

export async function deleteNodeAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  await db.query('UPDATE guide_trees SET root_node_id = NULL WHERE root_node_id = $1', [id]);
  await db.query('DELETE FROM guide_nodes WHERE id = $1', [id]);
  await audit(db, user.username, 'guide.node_delete', { id });
  refresh();
}

export async function setRootAction(fd: FormData) {
  await requireAdmin();
  const db = await getDb();
  await db.query('UPDATE guide_trees SET root_node_id = $2 WHERE id = $1', [await treeId(), int(fd, 'id')]);
  refresh();
}

export async function addOptionAction(fd: FormData) {
  await requireAdmin();
  const db = await getDb();
  const nodeId = int(fd, 'nodeId');
  const target = String(fd.get('target') ?? '');
  const m = /^(n|a):(\d+)$/.exec(target);
  const label = str(fd, 'label', 120);
  if (!nodeId || !label) return;
  await db.query(
    'INSERT INTO guide_options (node_id, label, is_unsure, sort, target_node_id, target_article_id) VALUES ($1, $2, $3, (SELECT coalesce(max(sort),0)+1 FROM guide_options WHERE node_id = $1 AND NOT is_unsure), $4, $5)',
    [nodeId, label, bool(fd, 'isUnsure'), m?.[1] === 'n' ? Number(m[2]) : null, m?.[1] === 'a' ? Number(m[2]) : null],
  );
  refresh();
}

export async function updateOptionAction(fd: FormData) {
  await requireAdmin();
  const db = await getDb();
  const m = /^(n|a):(\d+)$/.exec(String(fd.get('target') ?? ''));
  await db.query(
    'UPDATE guide_options SET label = $2, target_node_id = $3, target_article_id = $4 WHERE id = $1',
    [int(fd, 'id'), str(fd, 'label', 120), m?.[1] === 'n' ? Number(m[2]) : null, m?.[1] === 'a' ? Number(m[2]) : null],
  );
  refresh();
}

export async function deleteOptionAction(fd: FormData) {
  await requireAdmin();
  await (await getDb()).query('DELETE FROM guide_options WHERE id = $1', [int(fd, 'id')]);
  refresh();
}

export async function publishGuideAction(_: ActionState): Promise<ActionState> {
  const user = await requireAdmin();
  const r = await publishTree(await getDb(), await treeId(), user.username);
  refresh();
  const errors = r.issues.filter((i) => i.level === 'error').map((i) => i.message);
  const warnings = r.issues.filter((i) => i.level === 'warning').map((i) => i.message);
  return r.ok ? ok('引导已发布到操作端', { warnings }) : fail(errors, { warnings, message: '校验未通过，未发布' });
}

export async function unpublishGuideAction() {
  const user = await requireAdmin();
  await unpublishTree(await getDb(), await treeId(), user.username);
  refresh();
}

/* ---------------- 线索 ---------------- */

const IGNORE_REASONS = ['重复', '乱码', '测试', '已覆盖', '无效'];

export async function candidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  const c = (await db.query<{ id: number; text: string }>('SELECT id, text FROM candidates WHERE id = $1', [id]))[0];
  if (!c) return fail(['线索不存在']);
  const act = String(fd.get('act'));
  const articleId = int(fd, 'articleId');
  if (act === 'map' || act === 'synonym') {
    if (!articleId) return fail(['请选择文章']);
    if (act === 'synonym') {
      const phrase = str(fd, 'phrase', 100) || c.text.slice(0, 100);
      await db.query("INSERT INTO synonyms (phrase, target_type, target_value) VALUES ($1, 'article', $2) ON CONFLICT DO NOTHING", [phrase, String(articleId)]);
    }
    await db.query(`UPDATE candidates SET status = $2, article_id = $3, handled_at = now() WHERE id = $1`, [id, act === 'map' ? 'mapped' : 'synonym', articleId]);
  } else if (act === 'ignore') {
    const reason = str(fd, 'reason', 40);
    if (!IGNORE_REASONS.includes(reason)) return fail(['请选择忽略原因']);
    await db.query(`UPDATE candidates SET status = 'ignored', reason = $2, handled_at = now() WHERE id = $1`, [id, reason]);
  } else if (act === 'draft') {
    const content = emptyContent();
    content.title = c.text.slice(0, 200);
    content.symptoms = [c.text.slice(0, 200)];
    const a = await createArticle(db, content);
    await db.query(`UPDATE candidates SET status = 'drafted', article_id = $2, handled_at = now() WHERE id = $1`, [id, a.id]);
    await audit(db, user.username, 'candidate.draft', { id, articleId: a.id });
    redirect(`/admin/articles/${a.id}/edit`);
  } else {
    return fail(['未知操作']);
  }
  await audit(db, user.username, `candidate.${act}`, { id, articleId });
  refresh();
  return ok('已处理');
}

/* ---------------- 设置 / 词汇 / 同义词 ---------------- */

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const raw = Number(fd.get('rawRetentionDays'));
  const agg = Number(fd.get('aggregateRetentionDays'));
  const review = Number(fd.get('reviewCycleDays'));
  const errs: string[] = [];
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) errs.push('原始数据保留天数须为 1–365');
  if (!Number.isInteger(agg) || agg < raw || agg > 730) errs.push('聚合保留天数须不少于原始保留天数，且不超过 730');
  if (!Number.isInteger(review) || review < 7 || review > 730) errs.push('复核周期须为 7–730 天');
  if (errs.length) return fail(errs);
  await setSetting(db, 'rawRetentionDays', raw);
  await setSetting(db, 'aggregateRetentionDays', agg);
  await setSetting(db, 'reviewCycleDays', review);
  await setSetting(db, 'strictRateLimit', bool(fd, 'strictRateLimit'));
  await audit(db, user.username, 'settings.update', { raw, agg, review });
  refresh();
  return ok('设置已保存');
}

export async function runPurgeAction() {
  const user = await requireAdmin();
  const db = await getDb();
  await purge(db);
  await audit(db, user.username, 'retention.manual_purge');
  refresh();
}

export async function addVocabAction(fd: FormData) {
  await requireAdmin();
  const kind = fd.get('kind') === 'symptom' ? 'symptom' : 'stage';
  const label = str(fd, 'label', 40);
  if (!label) return;
  await (await getDb()).query(
    'INSERT INTO vocabularies (kind, label, sort) VALUES ($1, $2, (SELECT coalesce(max(sort),0)+1 FROM vocabularies WHERE kind = $1)) ON CONFLICT (kind, label) DO UPDATE SET active = true',
    [kind, label],
  );
  refresh();
}

export async function updateVocabAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  const label = str(fd, 'label', 40);
  if (!id || !label) return;
  await db.query('UPDATE vocabularies SET label = $2, active = $3 WHERE id = $1', [id, label, bool(fd, 'active')]);
  await audit(db, user.username, 'vocab.update', { id, label });
  refresh();
}

export async function addSynonymAction(fd: FormData) {
  await requireAdmin();
  const phrase = str(fd, 'phrase', 100);
  const type = String(fd.get('targetType'));
  const value = str(fd, 'targetValue', 100);
  if (!phrase || !value || !['phrase', 'code', 'article'].includes(type)) return;
  await (await getDb()).query('INSERT INTO synonyms (phrase, target_type, target_value) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [phrase, type, value]);
  refresh();
}

export async function deleteSynonymAction(fd: FormData) {
  await requireAdmin();
  await (await getDb()).query('DELETE FROM synonyms WHERE id = $1', [int(fd, 'id')]);
  refresh();
}

/* ---------------- 公告 ---------------- */

const toTs = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);

export async function saveAnnouncementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const db = await getDb();
  const input = {
    title: str(fd, 'title', 80), body: str(fd, 'body', 500), linkUrl: str(fd, 'linkUrl', 1000), linkLabel: str(fd, 'linkLabel', 40),
    pinned: bool(fd, 'pinned'), startsAt: toTs(str(fd, 'startsAt', 20)), endsAt: toTs(str(fd, 'endsAt', 20)),
  };
  const publish = fd.get('intent') === 'publish';
  const errs = validateAnnouncement(input, publish, bool(fd, 'confirmPublic'));
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) errs.push('结束时间须晚于开始时间');
  if (errs.length) return fail(errs);
  const id = await saveAnnouncement(db, int(fd, 'id'), input, publish);
  await audit(db, user.username, publish ? 'announcement.publish' : 'announcement.save_draft', { id });
  refresh();
  return ok(publish ? '公告已发布到首页' : '已保存为未发布');
}

export async function unpublishAnnouncementAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  await db.query('UPDATE announcements SET published = false, updated_at = now() WHERE id = $1', [id]);
  await audit(db, user.username, 'announcement.unpublish', { id });
  refresh();
}

export async function deleteAnnouncementAction(fd: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const id = int(fd, 'id');
  await db.query('DELETE FROM announcements WHERE id = $1', [id]);
  await audit(db, user.username, 'announcement.delete', { id });
  refresh();
}
