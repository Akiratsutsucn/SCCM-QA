#!/usr/bin/env bash
# 恢复：bash restore.sh backups/w11-<时间>.tar.gz
# 会覆盖当前数据库与图片。执行前请先运行一次 backup.sh。
set -euo pipefail
cd "$(dirname "$0")"
F="${1:?用法: restore.sh <备份文件.tar.gz>}"
read -r -p "将用 $F 覆盖当前数据库与图片，确认请输入 yes：" ok
[[ "$ok" == yes ]] || { echo "已取消"; exit 1; }
TMP=$(mktemp -d)
tar -C "$TMP" -xzf "$F"
D=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
sudo docker compose up -d db
sudo docker compose stop app
sudo docker compose exec -T db pg_restore -U w11 -d w11 --clean --if-exists < "$D/db.dump"
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c "rm -rf /data/media/* && tar -C /data -xf -" < "$D/media.tar"
sudo docker compose up -d app
rm -rf "$TMP"
echo "恢复完成。请登录后台并抽查一篇带图文章。"
