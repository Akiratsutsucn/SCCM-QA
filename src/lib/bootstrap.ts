/**
 * 种子：只写管理员引导账号（环境变量）、阶段/症状词汇、空的主引导树。
 * 不写文章、不写统计（空库启动）。
 */
import type { Db } from './db';
import { hashPassword, MIN_PASSWORD_LENGTH } from './password';

export const STAGES = ['兼容性或前置检查', '内容下载或分发', '任务序列执行', 'Windows 安装过程', '重启或首次登录', '回滚或失败恢复', '其他'];
export const SYMPTOMS = ['进度长时间不动', '出现错误码', '蓝屏或红字', '反复重启', '自动回滚', '磁盘或空间提示', '驱动或软件阻止', 'BitLocker 或加密相关', '网络或获取内容失败', '登录后功能异常'];

async function count(db: Db, table: string): Promise<number> {
  return (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n;
}

export async function bootstrap(db: Db) {
  if ((await count(db, 'vocabularies')) === 0) {
    for (const [i, label] of STAGES.entries()) {
      await db.query("INSERT INTO vocabularies (kind, label, sort) VALUES ('stage', $1, $2)", [label, i]);
    }
    for (const [i, label] of SYMPTOMS.entries()) {
      await db.query("INSERT INTO vocabularies (kind, label, sort) VALUES ('symptom', $1, $2)", [label, i]);
    }
  }
  if ((await count(db, 'guide_trees')) === 0) {
    await db.query("INSERT INTO guide_trees (name) VALUES ('Windows 11 升级排障')");
  }
  if ((await count(db, 'admin_users')) > 0) return;
  const u = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const p = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!u || !p) {
    console.warn('[w11-assist] 未设置 ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD，暂无管理员');
    return;
  }
  if (p.length < MIN_PASSWORD_LENGTH) {
    console.error(`[w11-assist] ADMIN_BOOTSTRAP_PASSWORD 至少 ${MIN_PASSWORD_LENGTH} 位，未创建管理员`);
    return;
  }
  await db.query(
    'INSERT INTO admin_users (username, password_hash, must_change) VALUES ($1, $2, true) ON CONFLICT DO NOTHING',
    [u, await hashPassword(p)],
  );
  console.info(`[w11-assist] 已创建引导管理员 ${u}，首次登录后须修改口令`);
}
