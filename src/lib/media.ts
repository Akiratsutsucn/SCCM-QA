/**
 * 图片：魔数校验（仅 JPEG/PNG/WebP）、≤5MB、sharp 重新编码（去 EXIF/GPS）、缩略图、裁切与矩形打码。
 * 文件名为随机 ID；只有被已发布文章引用、或挂在已发布文章下的图集图才 is_public。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';

export const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_EDGE = 2400;
const THUMB_EDGE = 480;

export function mediaDir(): string {
  return path.resolve(process.env.MEDIA_DIR || './data/media');
}

export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const filePath = (id: string, kind: 'full' | 'thumb') => path.join(mediaDir(), `${id}.${kind}.webp`);
const origPath = (id: string) => path.join(mediaDir(), `${id}.orig.webp`);

async function writeVariants(id: string, input: Buffer) {
  const sharp = (await import('sharp')).default;
  const full = await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(full.data).resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  await fs.writeFile(filePath(id, 'full'), full.data);
  await fs.writeFile(filePath(id, 'thumb'), thumb);
  return { width: full.info.width, height: full.info.height, sha256: createHash('sha256').update(full.data).digest('hex') };
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveUpload(db: Db, buf: Buffer, meta: { caption?: string; articleId?: number | null }): Promise<UploadResult> {
  if (buf.length > MAX_UPLOAD) return { ok: false, error: '文件超过 5 MB' };
  if (!sniffImage(buf)) return { ok: false, error: '只接受 JPEG / PNG / WebP 图片' };
  await fs.mkdir(mediaDir(), { recursive: true });
  const id = randomBytes(12).toString('base64url');
  let info;
  try {
    info = await writeVariants(id, buf);
    // 保留去元数据后的原图，重新裁切/打码时从它开始处理
    await fs.copyFile(filePath(id, 'full'), origPath(id));
  } catch {
    return { ok: false, error: '图片无法解码' };
  }
  await db.query(
    `INSERT INTO media (id, mime, width, height, sha256, caption, article_id) VALUES ($1, 'image/webp', $2, $3, $4, $5, $6)`,
    [id, info.width, info.height, info.sha256, (meta.caption ?? '').slice(0, 200), meta.articleId ?? null],
  );
  return { ok: true, id };
}

export interface Rect { x: number; y: number; w: number; h: number }

/** 在原图上应用矩形打码与裁切。坐标为 0–1 比例。改图后须重新确认脱敏。 */
export async function editImage(db: Db, id: string, edit: { crop?: Rect | null; boxes: Rect[] }) {
  const sharp = (await import('sharp')).default;
  const src = await fs.readFile(origPath(id));
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const px = (r: Rect) => {
    const left = Math.min(W - 1, Math.max(0, Math.round(r.x * W)));
    const top = Math.min(H - 1, Math.max(0, Math.round(r.y * H)));
    return { left, top, width: Math.max(1, Math.min(W - left, Math.round(r.w * W))), height: Math.max(1, Math.min(H - top, Math.round(r.h * H))) };
  };
  const overlays = edit.boxes.slice(0, 30).map((b) => {
    const p = px(b);
    return { input: { create: { width: p.width, height: p.height, channels: 3 as const, background: { r: 40, g: 40, b: 40 } } }, left: p.left, top: p.top };
  });
  let out = await sharp(src).composite(overlays).toBuffer();
  if (edit.crop) out = await sharp(out).extract(px(edit.crop)).toBuffer();
  const info = await writeVariants(id, out);
  await db.query(
    'UPDATE media SET width = $2, height = $3, sha256 = $4, rev = rev + 1, redaction_checked = false WHERE id = $1',
    [id, info.width, info.height, info.sha256],
  );
  await refreshMediaVisibility(db);
}

/** 重新计算哪些图可以公开读取。 */
export async function refreshMediaVisibility(db: Db) {
  await db.query(
    `UPDATE media m SET is_public = (
       m.redaction_checked AND (
         EXISTS (SELECT 1 FROM articles a, jsonb_array_elements(coalesce(a.published->'steps', '[]'::jsonb)) s
                  WHERE a.status = 'published' AND s->'mediaIds' ? m.id)
         OR (m.in_gallery AND EXISTS (SELECT 1 FROM articles a WHERE a.id = m.article_id AND a.status = 'published'))
       ))`,
  );
}

export async function readMediaFile(db: Db, id: string, kind: 'full' | 'thumb', isAdmin: boolean): Promise<Buffer | null> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const r = (await db.query<{ is_public: boolean }>('SELECT is_public FROM media WHERE id = $1', [id]))[0];
  if (!r || (!r.is_public && !isAdmin)) return null;
  try {
    return await fs.readFile(filePath(id, kind));
  } catch {
    await db.query('UPDATE media SET broken = true WHERE id = $1', [id]);
    return null;
  }
}

export async function deleteMedia(db: Db, id: string) {
  await db.query('DELETE FROM media WHERE id = $1', [id]);
  for (const p of [filePath(id, 'full'), filePath(id, 'thumb'), origPath(id)]) await fs.rm(p, { force: true });
}
