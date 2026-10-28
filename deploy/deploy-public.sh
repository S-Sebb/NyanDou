#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Update app assets and its loopback-only backend before exposing the new vhost.
bash deploy/deploy.sh
remote=SebOracle
target=/home/ubuntu/Repos/NekoBeads
rsync -a -- deploy/nginx-public-http.conf deploy/nginx-public.conf deploy/nyandou-renew-hook.sh "$remote:$target/deploy/"

ssh -o BatchMode=yes -o ConnectTimeout=10 "$remote" 'sudo -n bash -s' <<'REMOTE'
set -euo pipefail
source=/home/ubuntu/Repos/NekoBeads/deploy
site=/etc/nginx/sites-available/dou.love765.me
enabled=/etc/nginx/sites-enabled/dou.love765.me
certificate=/etc/letsencrypt/live/dou.love765.me/fullchain.pem

# Do not overwrite an unrelated site or redirect an existing symlink.
if [[ -e "$site" ]] && ! grep -q '^# NyanDou public' "$site"; then
    echo 'Refusing to overwrite an existing, unmanaged dou.love765.me site.' >&2
    exit 1
fi
if [[ -e "$enabled" || -L "$enabled" ]]; then
    [[ -L "$enabled" && "$(readlink "$enabled")" == "$site" ]] || {
        echo 'Refusing to replace an unrelated enabled site.' >&2
        exit 1
    }
fi

/usr/sbin/nginx -t
backup=$(mktemp -d /var/backups/nyandou-https.XXXXXX)
had_site=false
had_link=false
if [[ -e "$site" ]]; then cp -a "$site" "$backup/site"; had_site=true; fi
if [[ -L "$enabled" ]]; then cp -a "$enabled" "$backup/enabled"; had_link=true; fi
rollback() {
    trap - ERR
    if $had_site; then cp -a "$backup/site" "$site"; else rm -f -- "$site"; fi
    if $had_link; then cp -a "$backup/enabled" "$enabled"; else rm -f -- "$enabled"; fi
    /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx || true
    echo "Public-site setup failed; nginx site restored. Backup: $backup" >&2
}
trap rollback ERR

install -d -m 755 /var/www/nyandou-acme /usr/local/lib/nyandou
install -m 755 "$source/nyandou-renew-hook.sh" /usr/local/lib/nyandou/certbot-deploy
if [[ -s "$certificate" ]]; then
    install -m 644 "$source/nginx-public.conf" "$site"
else
    install -m 644 "$source/nginx-public-http.conf" "$site"
fi
if ! $had_link; then ln -s "$site" "$enabled"; fi
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx

certbot certonly --non-interactive --agree-tos --webroot \
    --webroot-path /var/www/nyandou-acme \
    --cert-name dou.love765.me --domain dou.love765.me \
    --deploy-hook /usr/local/lib/nyandou/certbot-deploy

install -m 644 "$source/nginx-public.conf" "$site"
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
/usr/bin/systemctl enable --now certbot.timer
curl --fail --silent --resolve dou.love765.me:443:127.0.0.1 \
    --output /dev/null https://dou.love765.me/
trap - ERR
echo "NyanDou public HTTPS is ready. Site backup: $backup"
REMOTE
