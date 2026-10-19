"""Serve only NyanDou app assets, with no project-directory listing."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent / "dist"
ASSETS = ROOT / "assets"
TOP_LEVEL_FILES = {"/", "/index.html", "/robots.txt", "/sitemap.xml", "/third-party-notices.txt"}
# Hashed build assets never change, so browsers may cache them for a year.
ASSET_SUFFIXES = (".js", ".css", ".svg")
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class AppHandler(SimpleHTTPRequestHandler):
    def request_path(self):
        return unquote(urlsplit(self.path).path)

    def is_asset_request(self):
        return self.request_path().startswith("/assets/") and self.path.endswith(ASSET_SUFFIXES)

    def is_allowed(self):
        path = self.request_path()
        if path in TOP_LEVEL_FILES:
            return True
        file = (ROOT / path.lstrip("/")).resolve()
        return (
            path.startswith("/assets/")
            and file.suffix in ASSET_SUFFIXES
            and file.is_relative_to(ASSETS)
            and file.is_file()
        )

    def send_head(self):
        if not self.is_allowed():
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", IMMUTABLE_CACHE if self.is_asset_request() else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4176)
    args = parser.parse_args()
    if not (ROOT / "index.html").is_file():
        parser.error("Missing production build. Run npm ci && npm run build first.")

    handler = partial(AppHandler, directory=str(ROOT))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"NyanDou: http://{args.bind}:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
