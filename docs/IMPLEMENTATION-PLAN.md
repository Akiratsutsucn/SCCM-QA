# 实现计划与已定决策（工作记录）

> 日期：2026-11-19 · 来源 Agent：Claude Code CLI · 机器：Laptop · 规格：projects/SCCM自助排错网站/_spec/Windows11升级排障网站设计（v0.1.6）

## 已定事项（My Lord 已答复）
- 服务器（2026-11-19 My Lord 补充）：腾讯云东京 43.133.216.85，SSH 22，密钥 projects/SCCM自助排错网站/SCCM_QA.pem（不入仓库）；HTTPS 用 **14443** 端口，80 也开放。需完成部署。代码推送 git@github.com:Akiratsutsucn/SCCM-QA.git。
- 代码目录：`Code/SCCM-QA`；projects/ 只放笔记。git 作者 `Akiratsutsucn <register@tsutsu.cn>`。
- 新增需求：首页**公告栏**（管理员发布，用于手册下载地址等）。位置：首页两个入口下方、「最近更新」之上；无公告不显示；链接仅 http/https；发布须勾选「已确认可公开」。
- 新增需求：把 `projects/SCCM自助排错网站/已知问题和解决方法 2026-11-19.md` 解析为第一批 QA。原文含主机名、站点代码、包 ID、内部文档链接，按规格必须脱敏。决策：只导入面向现场操作员的两类（Win11 升级/下载/任务序列 8 条；客户端/Software Center 6 条），去掉主机名/站点/包 ID/内部链接，以**草稿**导入（不自动发布），并生成草稿引导树；DP/站点/数据库类为服务端问题，不导入。原文多处写「待核对」，不编造步骤。数据：`seed/known-issues.json`（Agent 手工脱敏），脚本：`scripts/import-known-issues.ts`。

## 技术栈
- Next.js 16（App Router，`proxy.ts` 生成 CSP nonce）、React 19、TypeScript 5、zod、sharp、pg。
- 生产 PostgreSQL 16 + pg_trgm；本地/测试 PGlite（`DATABASE_URL=pglite:./data/dev` 或 `pglite:memory`）。`src/lib/db.ts` 统一 `query/tx`。
- 部署：Docker Compose（app + postgres + caddy，自签名证书挂 `/certs`），GitHub Actions 构建镜像推 GHCR；`scripts/gen-cert.sh`（SAN 含公网 IP，在服务器运行）、`scripts/backup.sh`/`restore.sh`。
- 测试：vitest（单元 + PGlite 集成）。本机无 Docker、无 gh。

## 数据模型（src/lib/schema.ts）
admin_users, admin_sessions, vocabularies, settings, articles(draft jsonb, published jsonb), article_versions, article_codes, article_tags, media, synonyms, guide_trees(published_snapshot jsonb), guide_nodes, guide_options, query_log, events(idem_key unique), feedback, candidates, stats_daily, audit_log, announcements。

## 关键约定
- 文章正文为结构化 JSON；渲染为纯文本段落/列表/代码块，不用 dangerouslySetInnerHTML。
- 发布校验：必填、占位符、敏感串（IP、域\用户、邮箱、UNC、C:\Users\…）、勾选已脱敏。
- 搜索 /search?q=&k=（k 为提交随机键，用于 search_submit 幂等）；排序：码/别名精确 > 短语/同义词 > pg_trgm。
- 操作员会话：localStorage UUID（12h），镜像 cookie `w11s`；服务端存 HMAC 哈希。
- 匿名写 /api/events、/api/feedback：Origin 校验 + IP 限流（仅防刷）+ 长度 + 幂等 + honeypot。
- 管理端：Server Actions + 每个 action 鉴权；cookie HttpOnly/Secure/SameSite=Strict；scrypt；ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD。
- 图片：魔数校验、≤5MB、sharp 去元数据、缩略图、裁切与打码；随机 ID；仅被已发布内容引用的图公开。
- 保留：原词/事件 30 天，聚合 90 天，进程内每日任务。

## 进度
- [x] 骨架、依赖、db.ts
- [x] 核心库 src/lib：db schema errorcode redact time content guide guides settings password bootstrap ratelimit auth http search events articles media announcements retention
- [x] 核心测试 tests/core.test.ts 16 项通过（PGlite 用 PGlite.create）
- [ ] 操作端页面 + 公告栏
- [ ] 管理端页面
- [ ] 部署文件、README、自审清单
- [ ] 第一批 QA 导入（草稿）
- [ ] 测试、截图验收、推送、项目笔记

## 备注（压缩前记录）
- 写文件时 GateGuard 钩子首次会拒绝一次，复述事实后重试即可。
- 网络走 HTTP(S)_PROXY=127.0.0.1:10808；SSH 推送 GitHub 已验证可用。
- 用户补充文件原文是 Markdown 索引表（症状关键词 | 结论与阅读入口），四大类：Win11 升级/下载/任务序列；SCCM 客户端/Software Center；DP/边界组；主站/次站/数据库。
- 服务器实测（2026-11-19）：ssh -i ~/.ssh/keys/sccm_qa.pem ubuntu@43.133.216.85（密钥已复制到本机 ~/.ssh/keys，root 不可登录）；Ubuntu 26.04、2 核、3.6G、88G、sudo 免密、未装 Docker。部署对外端口 14443（HTTPS，Caddy 自签名，SAN=43.133.216.85），80 仅跳转到 https://43.133.216.85:14443。
