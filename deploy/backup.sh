#!/usr/bin/env bash
# 备份：数据库转储 + 图片卷 → deploy/backups/w11-<时间>.tar.gz（不含 .env、证书私钥）。
# 建议 cron：0 3 * * * cd /opt/w11-assist/deploy && bash backup.sh && 拷贝到异机
set -euo pipefail
cd "$(dirname "$0")"
TS=$(date +%Y%m%d-%H%M%S)
OUT="backups/w11-${TS}"
mkdir -p "$OUT"
sudo docker compose exec -T db pg_dump -U w11 -d w11 -Fc > "$OUT/db.dump"
sudo docker compose exec -T app tar -C /data -cf - media > "$OUT/media.tar"
tar -C backups -czf "backups/w11-${TS}.tar.gz" "w11-${TS}"
rm -rf "$OUT"
ls -1t backups/w11-*.tar.gz | tail -n +15 | xargs -r rm -f   # 本机保留最近 14 份
echo "备份完成：deploy/backups/w11-${TS}.tar.gz（请拷贝到另一台机器）"
