#!/usr/bin/env bash
# 在 Ubuntu 服务器上安装 / 更新。可重复运行。
#   bash deploy/install.sh <公网IP> [HTTPS端口=14443]
# 1) 安装 Docker（若无）  2) 生成 .env（若无，随机口令）  3) 生成自签名证书（若无）
# 4) 构建镜像并启动      5) 首次运行时导入第一批 QA（草稿 → 发布）
set -euo pipefail
IP="${1:?用法: install.sh <公网IP> [HTTPS端口]}"
PORT="${2:-14443}"
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "== 安装 Docker"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl openssl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
fi
DC="sudo docker compose"

rnd() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-"$1"; }
if [[ ! -f .env ]]; then
  echo "== 生成 deploy/.env（权限 600）"
  umask 077
  cat > .env <<EOF
PUBLIC_HOST=${IP}
PUBLIC_DOMAIN=${IP//./-}.sslip.io
HTTPS_PORT=${PORT}
PUBLIC_ORIGIN=https://${IP}:${PORT}
POSTGRES_PASSWORD=$(rnd 32)
SESSION_HASH_SECRET=$(rnd 40)
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=$(rnd 20)
EOF
  FIRST=1
fi

bash gen-cert.sh "$IP"

echo "== 构建并启动"
$DC up -d --build
for i in $(seq 1 60); do
  if curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1:${PORT}/healthz" | grep -q 200; then break; fi
  sleep 2
done
curl -sk -o /dev/null -w "healthz: %{http_code}\n" "https://127.0.0.1:${PORT}/healthz"

if [[ "${FIRST:-0}" == 1 ]]; then
  echo "== 导入第一批 QA"
  $DC exec -T app node dist/import.cjs --publish
fi
echo "完成。访问 https://${IP}:${PORT}/ ；管理员初始口令见 deploy/.env（首次登录后会要求修改）。"
