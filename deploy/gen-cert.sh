#!/usr/bin/env bash
# 生成自建根 CA + 服务器证书（SAN 含公网 IP）。在服务器上运行，私钥不出服务器。
#   bash deploy/gen-cert.sh <公网IP>
# 产物：deploy/certs/ca.crt（分发给终端信任）、server.crt、server.key；根 CA 私钥 ca.key 权限 600。
# 已有证书时不覆盖；IP 变化时先删除 deploy/certs 再运行。
set -euo pipefail
IP="${1:?用法: gen-cert.sh <公网IP>}"
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
cd "$DIR"
umask 077
if [[ -f server.crt && -f server.key ]]; then
  echo "证书已存在：$DIR（不覆盖）"; exit 0
fi
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -keyout ca.key -out ca.crt \
  -subj "/CN=W11 Assist Local Root CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=${IP}"
cat > server.ext <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:${IP}
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -sha256 -extfile server.ext -out server.crt
rm -f server.csr server.ext
chmod 600 ca.key server.key
chmod 644 ca.crt server.crt
# caddy 容器以非 root 读取：给 key 只读组权限
chmod 644 server.key
echo "已生成：$DIR/server.crt（SAN=IP:${IP}）。终端如需信任，请安装 $DIR/ca.crt。"
