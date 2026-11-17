"""Local preview server for docs/ that mirrors GitHub Pages clean URLs.

Usage: python scripts/serve.py [port]   ->  /stock?id=2330 serves docs/stock.html
/data/* falls back to the R2 bucket when docs/data has no local copy.
"""
import os
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

R2_BASE = "https://observer.smallplum.xyz/"
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")


class CleanURLHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # /data/* is not in git (it lives in R2): use a local copy if present, else proxy R2.
        if self.path.startswith("/data/") and not os.path.exists(self.translate_path(self.path.split("?")[0])):
            return self.proxy_r2()
        return super().do_GET()

    def proxy_r2(self):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(R2_BASE + self.path[len("/data/"):], headers={"User-Agent": "Mozilla/5.0 observe-market-local"}),
                timeout=15,
            ) as r:
                body, status = r.read(), r.status
                ctype = r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            body, status, ctype = b"not found", e.code, "text/plain"
        except Exception:
            body, status, ctype = b"bad gateway", 502, "text/plain"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        real = super().translate_path(path)
        if not os.path.exists(real) and not os.path.splitext(real)[1] and os.path.exists(real + ".html"):
            return real + ".html"
        return real


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(CleanURLHandler, directory=DOCS)
    print(f"Serving docs/ at http://localhost:{port}")
    ThreadingHTTPServer(("", port), handler).serve_forever()
