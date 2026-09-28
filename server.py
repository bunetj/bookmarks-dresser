#!/usr/bin/env python3
# server.py — serves the hub, search engine, and regenerates ref on demand.

import sys
import socket
import importlib.util
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 49187
ROOT = Path(__file__).resolve().parent
URL = f"http://localhost:{PORT}"


def regenerate_ref():
    bookmarks = ROOT / "bookmarks.html"
    if not bookmarks.exists():
        print("  [ref] bookmarks.html not found, skipping regen")
        return
    sci_ref_py = ROOT / "ref" / "generate.py"
    if not sci_ref_py.exists():
        print("  [ref] ref/generate.py not found, skipping regen")
        return
    out = ROOT / "ref" / "index.html"
    try:
        spec = importlib.util.spec_from_file_location("sci_ref", sci_ref_py)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        parser = mod.FirefoxBookmarkParser()
        with open(bookmarks, "r", encoding="utf-8", errors="replace") as f:
            parser.feed(f.read())
        total = mod.render(parser.items, str(out))
        print(f"  [ref] regenerated sci_ref.html ({total} bookmarks)")
    except Exception as e:
        print(f"  [ref] regen failed: {e}")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("localhost", port))
            return False
        except OSError:
            return True


def main():
    if is_port_in_use(PORT):
        print(f"Port {PORT} already in use. Close the other server or change PORT.")
        sys.exit(1)

    print("=" * 50)
    print("  FF Bookmark Hub v0.4")
    print("=" * 50)
    print(f"  Serving: {ROOT}")
    print(f"  Open:    {URL}")
    print("  Ctrl+C to stop")
    print("=" * 50)

    regenerate_ref()

    httpd = ThreadingHTTPServer(("localhost", PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
