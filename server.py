#!/usr/bin/env python3
"""
FD ABRANTE3 SPOT 2 — Device Database Server & Web App Host.
Uses Python's built-in SQLite3 and HTTP server (zero external dependencies).
Stores all records and items in `data/stock.db` on this device.
"""

import http.server
import json
import os
import socket
import sqlite3
import sys
import time
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 4173))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "stock.db")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)


def init_db():
    """Initialize the SQLite database with the documents schema."""
    conn = sqlite3.connect(DB_PATH)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS docs (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at);
        """)
    conn.close()


def get_local_ip():
    """Detect the local Wi-Fi / LAN IP address for other devices on the network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


class StockRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Prevent caching for development/local server
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.path.startswith("/api/") or self.path.endswith(".html") or self.path.endswith(".js") or self.path.endswith(".css"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/docs":
            self.handle_get_docs()
        elif path == "/api/status":
            self.handle_get_status()
        else:
            # Fallback to standard static file serving
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/docs":
            self.handle_post_docs()
        else:
            self.send_error(404, "Endpoint not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/docs":
            self.handle_delete_docs()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_get_docs(self):
        """Retrieve all documents from SQLite database."""
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT id, data FROM docs")
            rows = cur.fetchall()
            conn.close()

            docs = []
            for doc_id, data_str in rows:
                try:
                    data = json.loads(data_str)
                    docs.append({"id": doc_id, "data": data})
                except json.JSONDecodeError:
                    continue

            body = json.dumps(docs).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_json_error(500, str(e))

    def handle_get_status(self):
        """Return server and database health status."""
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM docs WHERE id LIKE 'item:%'")
            items_count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM docs WHERE id LIKE 'sheet:%'")
            sheets_count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM docs")
            total_docs = cur.fetchone()[0]
            conn.close()

            status = {
                "status": "online",
                "database": "sqlite",
                "db_path": os.path.relpath(DB_PATH, BASE_DIR),
                "total_documents": total_docs,
                "items_count": items_count,
                "sheets_count": sheets_count,
                "local_ip": get_local_ip(),
                "port": PORT
            }
            body = json.dumps(status).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_json_error(500, str(e))

    def handle_post_docs(self):
        """Upsert a batch of documents into SQLite database."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                return self.send_json_error(400, "Empty payload")

            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))

            if not isinstance(payload, list):
                payload = [payload]

            now = int(time.time() * 1000)
            conn = sqlite3.connect(DB_PATH)
            with conn:
                for item in payload:
                    doc_id = item.get("id")
                    doc_data = item.get("data")
                    if not doc_id or doc_data is None:
                        continue
                    data_json = json.dumps(doc_data)
                    conn.execute("""
                        INSERT INTO docs (id, data, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            data = excluded.data,
                            updated_at = excluded.updated_at
                    """, (doc_id, data_json, now))
            conn.close()

            res = json.dumps({"ok": True, "count": len(payload)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(res)))
            self.end_headers()
            self.wfile.write(res)
        except Exception as e:
            self.send_json_error(500, str(e))

    def handle_delete_docs(self):
        """Delete documents by ID from SQLite database."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                return self.send_json_error(400, "Empty payload")

            raw_body = self.rfile.read(content_length)
            ids = json.loads(raw_body.decode("utf-8"))

            if not isinstance(ids, list):
                ids = [ids]

            conn = sqlite3.connect(DB_PATH)
            with conn:
                for doc_id in ids:
                    conn.execute("DELETE FROM docs WHERE id = ?", (doc_id,))
            conn.close()

            res = json.dumps({"ok": True, "deleted": len(ids)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(res)))
            self.end_headers()
            self.wfile.write(res)
        except Exception as e:
            self.send_json_error(500, str(e))

    def send_json_error(self, code, message):
        body = json.dumps({"ok": False, "error": message}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    init_db()
    local_ip = get_local_ip()

    # Allow dual-stack IPv4/IPv6 socket
    class DualStackServer(http.server.ThreadingHTTPServer):
        address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET

    server_address = ("::", PORT) if socket.has_ipv6 else ("0.0.0.0", PORT)
    
    try:
        httpd = DualStackServer(server_address, StockRequestHandler)
    except Exception:
        # Fallback to standard IPv4 binding
        httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), StockRequestHandler)

    print("=" * 64)
    print("  FD ABRANTE3 SPOT 2 — Device Database Server")
    print("=" * 64)
    print(f"  • Local Device:    http://localhost:{PORT}/")
    print(f"  • Shop Wi-Fi / IP: http://{local_ip}:{PORT}/")
    print(f"  • SQLite Database: {DB_PATH}")
    print("=" * 64)
    print("  Server is running. Press Ctrl+C to stop.")
    print("=" * 64)
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == "__main__":
    main()
