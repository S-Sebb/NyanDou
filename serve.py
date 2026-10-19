"""Serve only NyanDou app assets, with no project-directory listing."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent / "dist"


class AppHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        file = (ROOT / path.lstrip("/")).resolve()
        allowed = path in {"/", "/index.html", "/robots.txt", "/sitemap.xml", "/third-party-notices.txt"} or (
            path.startswith("/assets/") and file.suffix in {".js", ".css", ".svg"}
            and file.is_relative_to(ROOT / "assets") and file.is_file()
        )
        if not allowed:
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        asset = unquote(urlsplit(self.path).path).startswith("/assets/") and self.path.endswith((".js", ".css", ".svg"))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if asset else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
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
