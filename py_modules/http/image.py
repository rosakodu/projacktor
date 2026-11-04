"""Image proxy and caching handler for /api/image."""

import os
import urllib.parse
import urllib.request

from ..core.env import CONFIG_DIR, logger
from ..core.network import get_ssl_context
from ..clients.tmdb import get_tmdb_image_urls


def _detect_ctype(data: bytes, name: str) -> str:
    if data.startswith(b'RIFF') and b'WEBP' in data[:12]:
        return 'image/webp'
    if data.startswith(b'\x89PNG'):
        return 'image/png'
    if data.startswith(b'<svg') or b'<svg' in data[:200] or name.lower().endswith('.svg'):
        return 'image/svg+xml'
    if data.startswith(b'GIF8'):
        return 'image/gif'
    return 'image/jpeg'


def handle_image_proxy(handler, path="", query=None):
    query = query or {}
    img_path = query.get('path', [''])[0].lstrip('/')
    url_param = query.get('url', [''])[0]
    size = query.get('size', ['w342'])[0]

    if not img_path and url_param:
        parts = urllib.parse.urlparse(url_param).path.strip('/').split('/')
        if len(parts) >= 3 and parts[0] == 't' and parts[1] == 'p':
            size, img_path = parts[2], '/'.join(parts[3:])
        else:
            img_path = parts[-1]

    if not img_path:
        handler.send_response(400)
        handler.end_headers()
        return

    if img_path.lower().endswith('.svg'):
        size = 'original'

    cache_dir = os.path.join(CONFIG_DIR, "cache", "images", size)
    os.makedirs(cache_dir, exist_ok=True)
    local_file = os.path.join(cache_dir, os.path.basename(img_path))

    if os.path.isfile(local_file) and os.path.getsize(local_file) > 50:
        with open(local_file, 'rb') as f:
            content = f.read()
        _send_image(handler, content, _detect_ctype(content, img_path))
        return

    content = None
    ctx = get_ssl_context()
    for target_url in get_tmdb_image_urls(img_path, size):
        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                }
            )
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                content = resp.read()
                if len(content) > 50:
                    break
        except Exception as e:
            logger.warning(f"Failed to fetch image {target_url}: {e}")

    if content and len(content) > 50:
        try:
            with open(local_file, 'wb') as f:
                f.write(content)
        except Exception:
            pass
        _send_image(handler, content, _detect_ctype(content, img_path))
        return

    handler.send_response(404)
    handler.send_cors_headers()
    handler.send_header('Content-Type', 'text/plain')
    handler.end_headers()
    handler.wfile.write(b'Image not found')


def _send_image(handler, content: bytes, ctype: str):
    handler.send_response(200)
    handler.send_cors_headers()
    handler.send_header('Content-Type', ctype)
    handler.send_header('Cache-Control', 'public, max-age=31536000')
    handler.end_headers()
    handler.wfile.write(content)
