#!/usr/bin/env python3
"""Serve the project locally without exposing Git metadata or directory listings."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC = {'index.html', 'styles.css', 'app.js', 'events.json', 'favicon.svg', 'site.json', 'companies.json', 'keynotes.ics'}

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.ics': 'text/calendar; charset=utf-8', '.json': 'application/json'}
    def do_GET(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def allowed(self):
        path = unquote(urlsplit(self.path).path)
        return path == '/' or path.lstrip('/') in PUBLIC

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    print(f'Upcoming is running at http://localhost:{args.port}', flush=True)
    print('Press Ctrl+C to stop. Refresh the browser after editing files.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
