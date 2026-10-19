#!/usr/bin/env bash
set -euo pipefail

# This hook is saved only on the dou.love765.me certificate's renewal config.
case " ${RENEWED_DOMAINS:-} " in
    *" dou.love765.me "*)
        /usr/sbin/nginx -t
        /usr/bin/systemctl reload nginx
        ;;
esac
