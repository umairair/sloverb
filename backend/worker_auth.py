"""Authenticate the outbound worker without putting its private key on Render."""
import base64
import hashlib
import re
import secrets
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from fastapi import HTTPException, Request


def message(method, path, timestamp, nonce, digest):
    return f"{method.upper()}\n{path}\n{timestamp}\n{nonce}\n{digest}".encode()


def signed_headers(key: Ed25519PrivateKey, method: str, path: str, body: bytes):
    stamp, nonce = str(int(time.time())), secrets.token_hex(16)
    digest = hashlib.sha256(body).hexdigest()
    signature = key.sign(message(method, path, stamp, nonce, digest))
    return {"X-Worker-Time": stamp, "X-Worker-Nonce": nonce, "X-Worker-Digest": digest,
            "X-Worker-Signature": base64.b64encode(signature).decode()}


class WorkerAuth:
    def __init__(self, public_key: str):
        self.key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key, validate=True))
        self.used: dict[str, float] = {}

    def verify(self, request: Request) -> str:
        try:
            stamp = request.headers["x-worker-time"]
            nonce = request.headers["x-worker-nonce"]
            digest = request.headers["x-worker-digest"]
            if abs(time.time() - int(stamp)) > 90 or not re.fullmatch(r"[0-9a-f]{32}", nonce) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError
            signature = base64.b64decode(request.headers["x-worker-signature"], validate=True)
            self.key.verify(signature, message(request.method, request.url.path, stamp, nonce, digest))
            now = time.monotonic()
            self.used = {key: expires for key, expires in self.used.items() if expires > now}
            if nonce in self.used or len(self.used) >= 10000:
                raise ValueError
            self.used[nonce] = now + 180
            return digest
        except (ValueError, KeyError, InvalidSignature):
            raise HTTPException(401, "worker authentication required") from None

    async def json(self, request: Request):
        digest = self.verify(request)
        body = await request.body()
        if not secrets.compare_digest(hashlib.sha256(body).hexdigest(), digest):
            raise HTTPException(401, "invalid worker message")
        try:
            data = await request.json()
            if not isinstance(data, dict):
                raise ValueError
            return data
        except ValueError:
            raise HTTPException(400, "invalid worker message") from None
