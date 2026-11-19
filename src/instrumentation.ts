/** 服务启动时：初始化数据库（迁移 + 种子）并启动保留期清理任务。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.W11_DISABLE_JOBS === '1') return;
  const { getDb } = await import('./lib/db');
  const { startRetentionTimer } = await import('./lib/retention');
  await getDb();
  startRetentionTimer(getDb);
}
