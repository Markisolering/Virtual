"""Konverterar Rocketbox-texturer (TGA, 2048 px) till mobilvänliga WebP-filer.

Användning: python3 textures.py <kind> <in.tga> <out.webp> <size>
kind: color | normal | rough (från specular) | alpha (färg med alfakanal)
"""
import sys
from PIL import Image

kind, src, dst, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
img = Image.open(src)
img = img.resize((size, size), Image.LANCZOS)
if kind == 'rough':
    # glTF läser roughness ur grönkanalen. Blank specular betyder låg roughness.
    spec = img.convert('L')
    rough = spec.point(lambda v: int(max(0.35, min(1.0, 0.95 - (v / 255) * 0.7)) * 255))
    black = Image.new('L', rough.size, 0)
    Image.merge('RGB', (black, rough, black)).save(dst, 'WEBP', quality=80, method=6)
elif kind == 'alpha':
    img.convert('RGBA').save(dst, 'WEBP', quality=82, method=6)
elif kind == 'normal':
    img.convert('RGB').save(dst, 'WEBP', quality=88, method=6)
else:
    img.convert('RGB').save(dst, 'WEBP', quality=84, method=6)
