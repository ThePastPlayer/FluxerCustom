#!/usr/bin/env python3
"""Read-only download origin, accessible only through Traefik."""
import http.server, pathlib, urllib.parse, socketserver, threading

ROOT = pathlib.Path("/opt/fluxer-custom/public").resolve()
PREFIX = "/fluxer-custom/"
class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    slots = threading.BoundedSemaphore(24)
    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        super().process_request(request, address)
    def process_request_thread(self, request, address):
        try: super().process_request_thread(request, address)
        finally: self.slots.release()

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "LePast"
    def do_HEAD(self): self.serve(False)
    def do_GET(self): self.serve(True)
    def serve(self, body):
        self.connection.settimeout(30)
        raw = urllib.parse.urlsplit(self.path).path
        if raw == PREFIX[:-1]:
            self.send_response(308); self.send_header("Location", PREFIX); self.end_headers(); return
        if not raw.startswith(PREFIX): self.send_error(404); return
        rel = urllib.parse.unquote(raw[len(PREFIX):]) or "index.html"
        if "\\" in rel or "\0" in rel or any(p in (".", "..") for p in rel.split("/")):
            self.send_error(400); return
        try:
            target = (ROOT / rel).resolve()
            target.relative_to(ROOT)
            if not target.is_file(): self.send_error(404); return
            size = target.stat().st_size
            types = {".html":"text/html; charset=utf-8", ".json":"application/json",
                     ".txt":"text/plain; charset=utf-8", ".sha256":"text/plain",
                     ".zip":"application/zip", ".exe":"application/octet-stream", ".nupkg":"application/octet-stream"}
            start, end = 0, size - 1
            range_header = self.headers.get("Range")
            if range_header:
                import re
                match = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header)
                if not match: self.send_error(416); return
                start, end = int(match[1]), int(match[2]) if match[2] else size - 1
                if start > end or end >= size: self.send_error(416); return
            self.send_response(206 if range_header else 200)
            self.send_header("Content-Type", types.get(target.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
            if range_header: self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if body:
                with target.open("rb") as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        chunk = stream.read(min(1024 * 1024, remaining))
                        if not chunk: break
                        self.wfile.write(chunk); remaining -= len(chunk)
        except (FileNotFoundError, ValueError): self.send_error(404)
        except (BrokenPipeError, ConnectionResetError, TimeoutError): pass
    def log_message(self, fmt, *args):
        # Paths are public files. Do not log query strings or request headers.
        print(self.command, urllib.parse.urlsplit(self.path).path, flush=True)

if __name__ == "__main__":
    Server(("127.0.0.1", 8179), Handler).serve_forever()
