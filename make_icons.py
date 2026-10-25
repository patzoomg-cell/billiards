#!/usr/bin/env python3
"""앱 아이콘(PNG)을 만든다. 외부 라이브러리 없이 순수 파이썬으로 그린다.

사용법:  python3 -I ".../당구연습앱/make_icons.py"
"""
import os
import struct
import zlib

BASE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(BASE, 'icons')

BG = (20, 24, 29)
WOOD = (107, 68, 35)
FELT = (29, 122, 94)
BALLS = [
    (0.33, 0.60, (247, 244, 233)),
    (0.52, 0.40, (243, 191, 44)),
    (0.70, 0.64, (207, 58, 43)),
]
BALL_R = 0.105
SS = 3  # 수퍼샘플링 배율 (계단현상 제거)


def rounded(x, y, x0, y0, x1, y1, r):
    """둥근 사각형 내부인지"""
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    if x0 + r <= x <= x1 - r or y0 + r <= y <= y1 - r:
        return x0 <= x <= x1 and y0 <= y <= y1
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def sample(x, y):
    """정규좌표(0~1)의 색"""
    for bx, by, col in BALLS:
        dx, dy = x - bx, y - by
        if dx * dx + dy * dy <= BALL_R * BALL_R:
            # 왼쪽 위에서 빛이 오는 단순 음영
            k = 1.0 + 0.45 * (-dx - dy) / BALL_R
            k = max(0.55, min(1.35, k))
            return tuple(min(255, int(c * k)) for c in col)
    if rounded(x, y, 0.11, 0.11, 0.89, 0.89, 0.04):
        return FELT
    if rounded(x, y, 0.04, 0.04, 0.96, 0.96, 0.10):
        return WOOD
    return BG


def make(size, path):
    px = bytearray(size * size * 4)
    inv = 1.0 / (size * SS)
    for py in range(size):
        row = py * size * 4
        for pxi in range(size):
            r = g = b = 0
            for sy in range(SS):
                yy = (py * SS + sy + 0.5) * inv
                for sx in range(SS):
                    xx = (pxi * SS + sx + 0.5) * inv
                    c = sample(xx, yy)
                    r += c[0]; g += c[1]; b += c[2]
            n = SS * SS
            i = row + pxi * 4
            px[i] = r // n
            px[i + 1] = g // n
            px[i + 2] = b // n
            px[i + 3] = 255
    raw = b''.join(b'\x00' + bytes(px[y * size * 4:(y + 1) * size * 4])
                   for y in range(size))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    head = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head) +
                chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    print('%s  %d x %d  %.1f KB' % (os.path.basename(path), size, size,
                                    os.path.getsize(path) / 1024))


os.makedirs(ICONS, exist_ok=True)
make(180, os.path.join(ICONS, 'apple-touch-icon.png'))
make(192, os.path.join(ICONS, 'icon-192.png'))
make(512, os.path.join(ICONS, 'icon-512.png'))
