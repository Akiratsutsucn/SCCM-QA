# Windows 11 升级排障助手（w11-assist）

给 SCCM/MECM 现场操作员用的 Windows 11 升级排障站。操作端免登录、只有一页；管理员登录后台维护内容。

## 操作端（一页）

| 区域 | 内容 |
| --- | --- |
| 顶部 | 搜索框（错误码或一句话） |
| 主区域（最大） | 彩色积木分支：一次一问，点到底给出办法；办法只显示编号步骤，「更多说明」可展开 |
| 侧栏 | 管理员公告（手册下载地址等）、常见问题 TOP 10 |

状态都在 URL 里（`q` 搜索词、`n` 分支节点、`p` 已选路径、`a` 办法），浏览器返回即可回到上一步。

## 管理端 `/admin`

今日待办、文章（结构化编辑、草稿、预览、发布、历史版本恢复、下线）、图集（上传去 EXIF、裁切、打码、确认脱敏）、引导树（发布前校验循环、死链、孤岛、缺「不确定」）、线索（零结果、无点击、没解决、未收录反馈）、公告、统计（口径分开，没有「故障率」）、设置（保留期、词汇、同义词、审计日志）。

## 技术

Next.js 16 + React 19 + TypeScript · PostgreSQL 16（pg_trgm）· Caddy（HTTPS）· Docker Compose。本地开发与测试用 PGlite（嵌入式 PostgreSQL），不需要装数据库。

## 本地开发

```bash
npm ci
ADMIN_BOOTSTRAP_USERNAME=admin ADMIN_BOOTSTRAP_PASSWORD=<至少12位> npm run dev   # 数据在 ./data/dev
npx tsx scripts/import-known-issues.ts --publish   # 可选：导入第一批 QA
npm test
```

## 部署（Ubuntu 单机）

```bash
git clone https://github.com/Akiratsutsucn/SCCM-QA.git /opt/w11-assist
cd /opt/w11-assist
bash deploy/install.sh <公网IP> 14443
```

`install.sh` 依次完成：安装 Docker → 生成 `deploy/.env`（随机口令，权限 600）→ 生成自建根 CA 与服务器证书（SAN 为公网 IP）→ 构建并启动 → 首次导入第一批 QA。管理员初始口令在服务器的 `deploy/.env` 中，首次登录后必须修改。

更新：`git pull && cd deploy && sudo docker compose up -d --build app`

对外端口：HTTPS `14443`、HTTP `80`（只做跳转）。数据库和应用端口不对外开放。云防火墙另外把 22 限制为管理员来源 IP。

### 证书

默认由 Caddy 自动向 Let's Encrypt 申请公网 IP 证书（shortlived 配置，约 6 天有效期，到期前自动续期），浏览器直接信任，不用在终端装任何东西。

- 条件：80 端口必须对公网开放（HTTP-01 验证）；云防火墙不要关 80。
- 浏览器按 IP 访问时不发送 SNI，Caddyfile 里的  必须保留，否则握手失败。
- 自签名证书（ 生成，在 ）保留作备用：Let's Encrypt 不可用时，把 Caddyfile 中的  换成 。

### 备份与恢复

```bash
cd /opt/w11-assist/deploy
bash backup.sh                     # → backups/w11-<时间>.tar.gz（数据库 + 图片，不含 .env 和私钥）
bash restore.sh backups/<文件>     # 覆盖当前数据，需输入 yes 确认
```

建议每天用 cron 运行 `backup.sh`，并把备份拷到另一台机器。快照不能代替异机备份。

## 第一批 QA

`seed/known-issues.json` 整理自内部《已知问题和解决方法 2026-11-19》中面向现场的两类问题（升级/下载/任务序列，客户端/Software Center），共 13 篇，另有一棵 16 节点的多层引导树。设备名、站点代码、包 ID 和内部链接已去除。原文写「待核对」的处理方法没有编造，统一写为交给现场负责人或管理员。DP、站点、数据库类属于服务器端问题，未导入。

```bash
sudo docker compose exec app node dist/import.cjs [--publish] [--refresh] [--replace-guide]
```

## 统计口径

- 搜索次数、浏览次数不等于故障发生次数。
- 「我也遇到了」是匿名自报，按浏览器排障会话计，不能识别被升级的那台电脑，跨人重复无法排除。
- 不按 IP 合并操作员（现场多为 NAT）；IP 只用于限流。
- 本系统没有资产基数，不提供全网故障率。

## 上线前必须人工确认

1. 用手机 4G/5G（尽量覆盖不同运营商）输入网址，走完分支、搜索、办法页。
2. 抽查已发布文章和截图：没有客户名、主机名、IP、账号、内部路径。
3. 第一批 QA 由管理员逐篇复核内容是否正确。
4. 未登录访问 `/admin`、预览页、统计导出时全部被拒绝。
