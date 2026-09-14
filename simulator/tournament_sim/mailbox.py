"""Disposable, loopback-only SMTP capture for synthetic fixture journeys.

Messages stay in bounded process memory; neither server logs nor disk receives
mail content. This is a test tool, never a production mail backend or relay.
"""
from __future__ import annotations

import argparse
import json
import re
import threading
import time
from collections import deque
from contextlib import contextmanager
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from socketserver import StreamRequestHandler, ThreadingTCPServer
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

MAX_MESSAGE_BYTES = 64 * 1024
MAX_MESSAGES = 256


@contextmanager
def capture_mail():
    """Start two ephemeral loopback ports and erase all mail on exit."""
    messages: deque[dict[str, str]] = deque(maxlen=MAX_MESSAGES)
    lock = threading.Lock()

    class SMTPHandler(StreamRequestHandler):
        timeout = 10

        def reply(self, line):
            self.wfile.write(line + b"\r\n")

        def handle(self):
            recipients = []
            self.reply(b"220 fixture SMTP")
            while line := self.rfile.readline(2048):
                if not line.endswith(b"\n"):
                    self.reply(b"500 command too long")
                    return
                verb = line.split(b" ", 1)[0].strip().upper()
                if verb in (b"EHLO", b"HELO", b"NOOP"):
                    self.reply(b"250 localhost")
                elif verb in (b"MAIL", b"RSET"):
                    recipients = []
                    self.reply(b"250 OK")
                elif verb == b"RCPT":
                    address = parseaddr(line.decode("utf-8", errors="replace").split(":", 1)[-1])[1]
                    domain = address.rpartition("@")[2].lower()
                    if not (domain == "example.test" or domain.endswith(".example.test")):
                        self.reply(b"550 synthetic example.test recipients only")
                    elif len(recipients) >= 32:
                        self.reply(b"452 too many recipients")
                    else:
                        recipients.append(address)
                        self.reply(b"250 OK")
                elif verb == b"DATA" and recipients:
                    self.reply(b"354 end with dot")
                    chunks, size = [], 0
                    while chunk := self.rfile.readline(MAX_MESSAGE_BYTES + 1):
                        if chunk == b".\r\n":
                            break
                        size += len(chunk)
                        if size > MAX_MESSAGE_BYTES:
                            self.reply(b"552 message too large")
                            return
                        chunks.append(chunk[1:] if chunk.startswith(b"..") else chunk)
                    else:
                        return
                    message = BytesParser(policy=policy.default).parsebytes(b"".join(chunks))
                    body = message.get_body(preferencelist=("plain",))
                    text = body.get_content() if body else ""
                    with lock:
                        for recipient in recipients:
                            messages.append({"to": recipient, "body": text})
                    recipients = []
                    self.reply(b"250 captured")
                elif verb == b"QUIT":
                    self.reply(b"221 bye")
                    return
                else:
                    self.reply(b"503 command unavailable")

    class MailHandler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Request paths can contain recipient data.

        def do_GET(self):
            request = urlsplit(self.path)
            if request.path != "/messages":
                self.send_error(404)
                return
            recipient = parse_qs(request.query).get("to", [""])[0]
            with lock:
                payload = json.dumps([m for m in messages if m["to"] == recipient]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    with ThreadingTCPServer(("127.0.0.1", 0), SMTPHandler) as smtp, ThreadingHTTPServer(("127.0.0.1", 0), MailHandler) as http:
        smtp.daemon_threads = True
        workers = [threading.Thread(target=s.serve_forever, daemon=True) for s in (smtp, http)]
        for worker in workers:
            worker.start()
        try:
            yield {"smtpPort": smtp.server_address[1], "url": f"http://127.0.0.1:{http.server_address[1]}"}
        finally:
            for server in (smtp, http):
                server.shutdown()
            for worker in workers:
                worker.join()
            messages.clear()


def wait_for_token(mailbox_url: str, recipient: str, pattern: re.Pattern[str], *, timeout_s: float = 10) -> str:
    """Read the latest delivered matching link from a fixture's memory sink."""
    endpoint = urlsplit(mailbox_url)
    if endpoint.scheme != "http" or endpoint.hostname != "127.0.0.1" or endpoint.path:
        raise ValueError("fixture mailbox must be a loopback HTTP origin")
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        with urlopen(f"{mailbox_url}/messages?{urlencode({'to': recipient})}", timeout=2) as response:
            messages = json.load(response)
        for message in reversed(messages):
            match = pattern.search(message["body"])
            if match:
                return match.group(1)
        time.sleep(0.1)
    raise AssertionError("expected synthetic mail was not delivered before the deadline")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    with capture_mail() as state:
        args.state.write_text(json.dumps(state), encoding="utf-8")
        threading.Event().wait()


if __name__ == "__main__":
    main()
