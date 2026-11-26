#!/usr/bin/env bash
# =====================================================================
# CẬP NHẬT MY FINANCE lên bản main mới nhất. Chạy THẲNG TRÊN MÁY CHỦ:
#
#   bash /root/kho/my-finance/trien-khai/cap-nhat.sh          ← cập nhật
#   bash /root/kho/my-finance/trien-khai/cap-nhat.sh --xem    ← chỉ xem tệp nào sẽ đổi
#
#  - Sao lưu database + code trước khi chép (/root/backups/my-finance, giữ 30 bản).
#  - Không đụng .env và dữ liệu.
#  - App không trả lời sau khi khởi động lại thì tự quay về bản cũ.
# =====================================================================
set -euo pipefail
KHO=/root/kho/my-finance
DICH=/var/www/my-finance
APP=my-finance
DB=myfinance
B=/root/backups/my-finance
XEM=0; [ "${1:-}" = "--xem" ] && XEM=1

cd "$KHO"
git fetch -q origin main
git reset -q --hard origin/main   # kho trên máy chủ chỉ để lấy code, không sửa tay ở đây
REV=$(git rev-parse --short HEAD)
echo "==> Đang chạy: $(cat "$DICH/REVISION" 2>/dev/null || echo '?')   →   bản mới: $REV"
MOI=$(mktemp -d); trap 'rm -rf "$MOI"' EXIT
git archive HEAD | tar -x -C "$MOI"
DOI=$(rsync -rcn --delete --out-format='%n' --exclude=node_modules --exclude=.env --exclude=REVISION "$MOI/" "$DICH/" | grep -v '/$' || true)
echo "${DOI:-   (không có tệp nào đổi)}" | sed 's/^/   /'
[ "$XEM" = 1 ] && exit 0

TS=$(date +%Y%m%d-%H%M); mkdir -p "$B"
(cd /tmp && sudo -u postgres pg_dump -Fc "$DB" > "$B/$DB-truoc-cap-nhat-$TS.dump")
tar -czf "$B/code-$TS.tgz" -C "$DICH" --exclude=node_modules .
ls -1t "$B"/code-*.tgz | tail -n +31 | xargs -r rm -f
echo "==> Đã sao lưu: $B/$DB-truoc-cap-nhat-$TS.dump"

rsync -a --delete --exclude=node_modules --exclude=.env "$MOI/" "$DICH/"
echo "$REV" > "$DICH/REVISION"
cd "$DICH"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
pm2 reload "$APP" --update-env
CONG=$(grep -E '^PORT=' .env | cut -d= -f2)
for i in $(seq 1 20); do curl -fsS "http://127.0.0.1:$CONG/suc-khoe" >/dev/null 2>&1 && { echo "==> Xong, đang chạy bản $REV"; exit 0; }; sleep 1; done

echo "!!  App không trả lời sau khi cập nhật. Quay về bản cũ..."
find "$DICH" -mindepth 1 -maxdepth 1 ! -name .env ! -name node_modules -exec rm -rf {} +
tar -xzf "$B/code-$TS.tgz" -C "$DICH"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
pm2 reload "$APP" --update-env
echo "    Đã quay về bản cũ. Database chưa bị khôi phục; nếu cần: pg_restore -c -d $DB $B/$DB-truoc-cap-nhat-$TS.dump"
exit 1
