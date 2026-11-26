#!/usr/bin/env bash
# =====================================================================
# CÀI MY FINANCE LẦN ĐẦU lên máy chủ HCARE. Chạy THẲNG TRÊN MÁY CHỦ, bằng root, một lần.
#
#   bash /root/kho/my-finance/trien-khai/cai-dat.sh
#
# Làm gì:
#   1. Tạo database riêng "myfinance" (tách hẳn khỏi dữ liệu HCARE), mật khẩu ngẫu nhiên.
#   2. Chép code vào /var/www/my-finance, tạo .env (khóa bí mật ngẫu nhiên), cài thư viện.
#   3. Tạo 2 tài khoản: tu (nhập liệu), dung (chỉ xem). Mật khẩu in ra màn hình
#      và lưu ở /root/my-finance-tai-khoan.txt (chỉ root đọc được).
#   4. Chạy app bằng PM2 (tên my-finance, cổng 3060), mở tên miền qua nginx, xin HTTPS.
#   5. Sao lưu database mỗi đêm 2:30 vào /root/backups/my-finance (giữ 30 bản).
# Chạy lại lần nữa thì không tạo trùng, không đổi mật khẩu, không đụng dữ liệu.
# =====================================================================
set -euo pipefail

TEN_MIEN="${TEN_MIEN:-taichinh.hcarevietnam.vn}"
KHO=/root/kho/my-finance
DICH=/var/www/my-finance
CONG="${CONG:-3060}"
APP=my-finance
DB=myfinance

[ "$(id -u)" = 0 ] || { echo "Cần chạy bằng root."; exit 1; }
cd "$KHO"
git fetch -q origin main
REV=$(git rev-parse --short origin/main)
echo "==> Cài My Finance bản $REV cho $TEN_MIEN"

# --- 1. Cổng ----------------------------------------------------------
if [ ! -f "$DICH/.env" ] && ss -ltn | awk '{print $4}' | grep -qE "[:.]$CONG\$"; then
  echo "Cổng $CONG đang có chương trình khác dùng. Chạy lại với cổng khác: CONG=3065 bash $0"; exit 1
fi

# --- 2. Database --------------------------------------------------------
if [ -f "$DICH/.env" ]; then
  echo "==> Đã có $DICH/.env, giữ nguyên database và khóa bí mật."
else
  MK_DB=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER ROLE $DB WITH PASSWORD '$MK_DB'"
  else
    sudo -u postgres psql -qc "CREATE ROLE $DB LOGIN PASSWORD '$MK_DB'"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || sudo -u postgres createdb -O "$DB" "$DB"
  sudo -u postgres psql -qc "ALTER DATABASE $DB SET timezone TO 'Asia/Ho_Chi_Minh'"
  mkdir -p "$DICH"
  umask 077
  cat > "$DICH/.env" <<ENV
NODE_ENV=production
PORT=$CONG
DATABASE_URL=postgresql://$DB:$MK_DB@127.0.0.1:5432/$DB
JWT_SECRET=$(openssl rand -hex 48)
ENV
  umask 022
  echo "==> Đã tạo database $DB và $DICH/.env"
fi

# --- 3. Code ------------------------------------------------------------
MOI=$(mktemp -d); trap 'rm -rf "$MOI"' EXIT
git archive origin/main | tar -x -C "$MOI"
rsync -a --delete --exclude=node_modules --exclude=.env "$MOI/" "$DICH/"
echo "$REV" > "$DICH/REVISION"
cd "$DICH"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
node db/migrate.js

# --- 4. Tài khoản -------------------------------------------------------
TK=/root/my-finance-tai-khoan.txt
if [ "$(sudo -u postgres psql -d $DB -tAc 'SELECT count(*) FROM nguoi_dung')" = 0 ]; then
  umask 077
  { echo "My Finance — https://$TEN_MIEN"; node scripts/tao-nguoi-dung.js tu "Tú" nhap '#6a4ce2'; node scripts/tao-nguoi-dung.js dung "Dũng" xem '#0f6b55'; } | grep -v '^migration' > "$TK"
  umask 022
  echo "==> Đã tạo tài khoản:"; cat "$TK"
else
  echo "==> Đã có tài khoản, giữ nguyên. Xem lại: cat $TK"
fi

# --- 5. PM2 -------------------------------------------------------------
mkdir -p /var/log/$APP
if pm2 describe "$APP" >/dev/null 2>&1; then pm2 reload "$APP" --update-env
else pm2 start server.js --name "$APP" --cwd "$DICH" --max-memory-restart 200M -o /var/log/$APP/out.log -e /var/log/$APP/error.log --time; fi
pm2 save >/dev/null
for i in $(seq 1 20); do curl -fsS "http://127.0.0.1:$CONG/suc-khoe" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$CONG/suc-khoe" >/dev/null || { echo "App không chạy. Xem lỗi: pm2 logs $APP --lines 50"; exit 1; }
echo "==> App chạy ở cổng $CONG"

# --- 6. Nginx + HTTPS ---------------------------------------------------
CONF=/etc/nginx/sites-available/$TEN_MIEN
if [ ! -f "$CONF" ]; then
  cat > "$CONF" <<NGX
server {
    listen 80;
    server_name $TEN_MIEN;
    client_max_body_size 1m;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / {
        proxy_pass http://127.0.0.1:$CONG;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGX
  ln -sf "$CONF" /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  echo "==> Đã mở $TEN_MIEN trong nginx"
fi
IP_MAY=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
IP_TEN=$(getent ahostsv4 "$TEN_MIEN" | awk 'NR==1{print $1}' || true)
if [ "$IP_TEN" = "$IP_MAY" ]; then
  if ! grep -q "listen 443" "$CONF"; then
    certbot --nginx -d "$TEN_MIEN" --non-interactive --agree-tos --redirect --register-unsafely-without-email || certbot --nginx -d "$TEN_MIEN" --non-interactive --redirect
  fi
  echo "==> Xong: https://$TEN_MIEN"
else
  echo "!!  Tên miền $TEN_MIEN chưa trỏ về máy này (đang là: ${IP_TEN:-chưa có}, máy này: $IP_MAY)."
  echo "    Thêm bản ghi A 'taichinh' → $IP_MAY ở AZDIGI, đợi 5-10 phút rồi chạy lại lệnh này để lấy HTTPS."
fi

# --- 7. Sao lưu mỗi đêm ------------------------------------------------
mkdir -p /root/backups/my-finance
CRON=/etc/cron.d/my-finance-sao-luu
if [ ! -f "$CRON" ]; then
  echo "30 2 * * * root cd /tmp && sudo -u postgres pg_dump -Fc $DB > /root/backups/my-finance/$DB-\$(date +\%Y\%m\%d).dump && ls -1t /root/backups/my-finance/*.dump | tail -n +31 | xargs -r rm -f" > "$CRON"
  echo "==> Đã bật sao lưu database mỗi đêm 2:30"
fi
