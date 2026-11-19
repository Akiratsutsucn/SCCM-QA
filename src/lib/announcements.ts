/** 首页公告栏（My Lord 追加需求）：管理员发布，例如手册下载地址。公开可读，须确认可公开。 */
import type { Db } from './db';
import { findSensitive } from './redact';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  pinned: boolean;
  published: boolean;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
}

export const MAX_HOME_ANNOUNCEMENTS = 3;

/** 只接受 http/https 链接，拒绝 javascript: 等协议。 */
export function safeLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface AnnouncementInput {
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  pinned: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export function validateAnnouncement(a: AnnouncementInput, publish: boolean, confirmedPublic: boolean): string[] {
  const errs: string[] = [];
  if (!a.title.trim()) errs.push('标题为必填');
  if (a.linkUrl.trim() && !safeLink(a.linkUrl)) errs.push('链接须以 http:// 或 https:// 开头');
  if (publish) {
    if (!confirmedPublic) errs.push('请勾选「已确认文字和链接可以公开」');
    // 链接是管理员有意发布的下载地址，只检查标题和正文
    const hits = findSensitive([a.title, a.body].join('\n'));
    if (hits.length) errs.push(`文字疑似含敏感信息：${hits.join('、')}`);
  }
  return errs;
}

export async function activeAnnouncements(db: Db, limit = MAX_HOME_ANNOUNCEMENTS): Promise<Announcement[]> {
  return db.query<Announcement>(
    `SELECT * FROM announcements
      WHERE published AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
      ORDER BY pinned DESC, updated_at DESC LIMIT $1`,
    [limit],
  );
}

export async function listAnnouncements(db: Db): Promise<Announcement[]> {
  return db.query<Announcement>('SELECT * FROM announcements ORDER BY published DESC, pinned DESC, updated_at DESC');
}

export async function saveAnnouncement(db: Db, id: number | null, a: AnnouncementInput, published: boolean): Promise<number> {
  const params = [a.title.trim().slice(0, 80), a.body.trim().slice(0, 500), safeLink(a.linkUrl), a.linkLabel.trim().slice(0, 40) || null, a.pinned, published, a.startsAt, a.endsAt];
  if (id) {
    await db.query(
      `UPDATE announcements SET title=$1, body=$2, link_url=$3, link_label=$4, pinned=$5, published=$6, starts_at=$7, ends_at=$8, updated_at=now() WHERE id=$9`,
      [...params, id],
    );
    return id;
  }
  const r = await db.query<{ id: number }>(
    `INSERT INTO announcements (title, body, link_url, link_label, pinned, published, starts_at, ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    params,
  );
  return r[0].id;
}
