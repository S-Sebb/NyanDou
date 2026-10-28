#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

remote=SebOracle
target=/home/ubuntu/Repos/NekoBeads

# Publish only the Vite production build. Upload hashed assets before switching
# HTML; retain previous assets so already-open pages and rollback still work.
npm run build
ssh -o BatchMode=yes -o ConnectTimeout=10 "$remote" \
  "install -d -m 755 '$target/public/assets' '$target/deploy' '$target/run'"
rsync -a -- dist/assets/ "$remote:$target/public/assets/"
rsync -a -- dist/index.html dist/robots.txt dist/robots.txt.gz dist/sitemap.xml dist/sitemap.xml.gz dist/third-party-notices.txt dist/third-party-notices.txt.gz "$remote:$target/deploy/"
rsync -a -- deploy/nginx.conf "$remote:$target/deploy/nginx-next.conf"
rsync -a -- deploy/nekobeads.service "$remote:$target/deploy/"

ssh -o BatchMode=yes -o ConnectTimeout=10 "$remote" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/Repos/NekoBeads
backup=$(mktemp -d deploy/release-backup.XXXXXX)
cp -a deploy/nginx.conf "$backup/nginx.conf"
cp -a public/index.html "$backup/index.html"
if [[ -f public/index.html.gz ]]; then cp -a public/index.html.gz "$backup/index.html.gz"; fi
rollback() {
  trap - ERR
  cp -a "$backup/nginx.conf" deploy/nginx.conf
  cp -a "$backup/index.html" public/index.html
  if [[ -f "$backup/index.html.gz" ]]; then cp -a "$backup/index.html.gz" public/index.html.gz;
  else rm -f -- public/index.html.gz; fi
  sudo -n systemctl restart nekobeads.service || true
  echo "Release failed; restored previous HTML/config. Backup: $backup" >&2
}
trap rollback ERR
/usr/sbin/nginx -t -e stderr -p /home/ubuntu/Repos/NekoBeads/ -c deploy/nginx-next.conf
cp -a deploy/nginx-next.conf deploy/nginx.conf
for file in robots.txt robots.txt.gz sitemap.xml sitemap.xml.gz third-party-notices.txt third-party-notices.txt.gz; do
  install -m 644 "deploy/$file" "public/$file"
done
# HTML is intentionally uncompressed: replacing one file atomically avoids
# mismatched compressed/uncompressed entry pages during a release.
rm -f -- public/index.html.gz
install -m 644 deploy/index.html public/index.next
mv -f -- public/index.next public/index.html
sudo -n install -m 644 /home/ubuntu/Repos/NekoBeads/deploy/nekobeads.service /etc/systemd/system/nekobeads.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable nekobeads.service
sudo -n systemctl restart nekobeads.service
systemctl is-active nekobeads.service
curl --fail --silent --retry 3 --retry-connrefused --retry-delay 1 --retry-max-time 10 --output /dev/null http://127.0.0.1:4173/
ss -ltn 'sport = :4173'
trap - ERR
echo "NyanDou production release ready. Backup: $backup"
REMOTE
