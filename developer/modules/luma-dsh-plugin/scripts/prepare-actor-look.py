"""Bake independently steerable eyes and heads from each costume's registered standing cel.

Full cels already contain the matching gaze. For an eye lead, composite the
small sheet's [head row, gaze column] at eyesOrigin in the same standing cel.
Both index axes run from top left to bottom right in a five-by-five grid.
"""
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OFFICE = ROOT.parents[1] / 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
ART = Path('luma-office/luma-plugin-art/actor-look')
DIRECTIONS = [(x / 2, y / 2) for y in range(-2, 3) for x in range(-2, 3)]
CENTER = 12


def ease(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def head_source_map(gx, gy, eyes, mouth, chin, look):
    """Turn the painted face together, with the neck anchored under its jaw."""
    hx, hy = look
    length = max(1., math.hypot(hx, hy))
    hx, hy = hx / length, hy / length
    cx, cy = np.mean(eyes, axis=0)
    span = math.dist(*eyes)
    nx, ny = mouth
    u, v = (gx - cx) / span, (gy - cy) / span
    # The bottom of the face rises towards both ears. Keep the mouth and
    # cheeks on the same moving plane as the eye sockets, then attach this
    # plane to the fixed neck only around the painted mandibular contour.
    jaw = chin[1] - span * np.minimum(.44, .53 * np.abs((gx - chin[0]) / span) ** 1.8)
    face_weight = 1 - ease(jaw - 1.3, jaw + 2., gy)
    hair_weight = 1 - ease(cy - .1 * span, chin[1] + 2., gy)
    outer = ease(.70, 1.25, np.abs(u))
    head = face_weight * (1 - outer) + hair_weight * outer
    depth = 1 - ease(.72, 1.75, np.hypot(u, (v - .11) * .77))
    angle = math.radians(.85) * hx
    cosine, sine = math.cos(angle), math.sin(angle)
    dx = (cosine - 1) * (gx - nx) - sine * (gy - chin[1])
    dy = sine * (gx - nx) + (cosine - 1) * (gy - chin[1])
    dx += span * hx * (.028 + .067 * depth) - .012 * hx * hx * (gx - cx) * depth
    dy += span * hy * (.021 + .045 * depth)
    return (gx - head * dx).astype(np.float32), (gy - head * dy).astype(np.float32)


def eye_aperture(patch, eyes, origin, key):
    """Register the inside of each eye; hold the lash, rims and visor glints."""
    oy, ox = origin[1], origin[0]
    gy, gx = np.indices(patch.shape[:2], dtype=np.float32)
    angle = math.atan2(eyes[1][1] - eyes[0][1], eyes[1][0] - eyes[0][0])
    cos, sin = math.cos(angle), math.sin(angle)
    span = math.dist(*eyes)
    weight = np.zeros_like(gx)
    for cx, cy in eyes:
        x, y = gx + ox - cx, gy + oy - cy
        u = (cos * x + sin * y) / (span * .29)
        v = (-sin * x + cos * y) / (span * .215)
        aperture = u * u + (v * np.where(v < 0, 1.19, 1.0)) ** 2
        weight = np.maximum(weight, 1 - ease(.20, .98, aperture)).astype(np.float32)
    weight *= patch[:, :, 3] >= 248
    glint = np.zeros(weight.shape, dtype=np.float32)
    if key == 'gemini-v1':
        r, g, b = patch[:, :, :3].astype(np.float32).transpose(2, 0, 1)
        glint = ((g > 213) & (b > 232) & ((r > 187) | (g - r > 32))).astype(np.float32)
        weight *= 1 - glint
    return weight, glint


def eye_views(ink, face, mx, my, weight, glint, span):
    # Compose both deformations in source coordinates, then sample the painted
    # pupil once. Two consecutive image resamples blur the catchlight on diagonals.
    aperture = cv2.remap(weight, mx, my, cv2.INTER_LINEAR)
    has_glass = np.any(glint)
    if has_glass:
        glass = cv2.remap(glint, mx, my, cv2.INTER_LINEAR)
    base = face[:, :, :3]
    for x, y in DIRECTIONS:
        radius = max(1., math.hypot(x, y))
        sx = mx - (x / radius) * span * .062 * aperture
        sy = my - (y / radius) * span * .039 * aperture
        moved = cv2.remap(ink, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        if has_glass:
            moved_glass = cv2.remap(glint, sx, sy, cv2.INTER_LINEAR)
            keep = 1 - np.maximum(glass, moved_glass)
            moved = base + (moved - base) * keep[:, :, None]
        changing = (aperture > 0) & (face[:, :, 3] >= 248)
        yield np.where(changing[:, :, None], np.uint8(np.clip(moved + .5, 0, 255)), base)


def head_pixels(neutral, premultiplied, gx, gy, mx, my):
    moved = cv2.remap(premultiplied, mx, my, cv2.INTER_CUBIC)
    alpha = moved[:, :, 3:4]
    rgb = moved[:, :, :3] / np.maximum(alpha / 255, 1e-6)
    result = np.uint8(np.clip(np.dstack((rgb, alpha)) + .5, 0, 255))
    unchanged = (np.abs(mx - gx) < 1 / 64) & (np.abs(my - gy) < 1 / 64)
    result[unchanged] = neutral[unchanged]
    return result


def make_sheets(key, meta, landmarks):
    w, h = meta['cell']
    with Image.open(ROOT / 'art/release-assets' / meta['src'][1:]) as original:
        neutral = np.array(original.crop((0, 0, w, h)).convert('RGBA'))
    eyes = np.array(landmarks['eyes'])
    if eyes.tolist() != [mark[:2] for mark in meta['eyes']]:
        raise ValueError(f'{key}: source eye registration differs from the standing atlas')
    low = eyes.min(axis=0) - [22, 21]
    high = eyes.max(axis=0) + [23, 22]
    x0, y0 = low.tolist()
    x1, y1 = high.tolist()
    rect = np.s_[y0:y1, x0:x1]
    sw, sh = x1 - x0, y1 - y0
    weight, glint = eye_aperture(neutral[rect], eyes, low, key)
    ink = neutral[rect][:, :, :3].astype(np.float32)
    premultiplied = neutral.astype(np.float32)
    premultiplied[:, :, :3] *= premultiplied[:, :, 3:4] / 255
    gy, gx = np.indices((h, w), dtype=np.float32)
    heads = Image.new('RGBA', (w * 5, h * 5))
    patches = []
    used = np.zeros((sh, sw), dtype=np.uint8)
    for head_index, direction in enumerate(DIRECTIONS):
        mx, my = head_source_map(gx, gy, eyes, landmarks['mouth'], landmarks['chin'], direction)
        cell = head_pixels(neutral, premultiplied, gx, gy, mx, my)
        views = list(eye_views(ink, cell[rect], mx[rect] - x0, my[rect] - y0,
                               weight, glint, math.dist(*eyes)))
        matching = views[head_index]
        cell[rect][:, :, :3] = matching
        stationary = landmarks['chin'][1] + 2
        if not np.array_equal(cell[stationary:], neutral[stationary:]):
            raise ValueError(f'{key}: gaze moved the neck or clothing')
        if head_index == CENTER and not np.array_equal(cell, neutral):
            raise ValueError(f'{key}: the frontal cell must match the landing pose')
        heads.paste(Image.fromarray(cell), ((head_index % 5) * w, (head_index // 5) * h))
        for gaze in views:
            changed = np.any(gaze != matching, axis=2)
            used[changed] = 1
            # Corrections replace the painted eye interior; use exact target
            # RGB without blending a second copy of the old pupil through it.
            patch = np.zeros((sh, sw, 4), dtype=np.uint8)
            patch[changed, :3] = gaze[changed]
            patch[changed, 3] = 255
            patches.append(Image.fromarray(patch))
    left, top, pw, ph = cv2.boundingRect(used)
    if not pw or not ph or min(left, top, sw - left - pw, sh - top - ph) < 1:
        raise ValueError(f'{key}: clipped or empty eye travel {(left, top, pw, ph)} in {(sw, sh)}')
    overlay = Image.new('RGBA', (pw * 25, ph * 25))
    for n, patch in enumerate(patches):
        tile = patch.crop((left, top, left + pw, top + ph))
        overlay.paste(tile, ((n % 25) * pw, (n // 25) * ph))
    center = eyes.mean(axis=0).tolist()
    return heads, overlay, dict(eyeCenter=center, eyesOrigin=[x0 + left, y0 + top], eyesCell=[pw, ph])


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(data)
        name = Path(temp.name)
    try:
        name.replace(path)
    finally:
        name.unlink(missing_ok=True)


def publish(name, image, records):
    buffer = BytesIO()
    image.save(buffer, format='PNG', compress_level=8)
    data = buffer.getvalue()
    digest = sha256(data).hexdigest()
    path = (ART / (name + '.' + digest[:12] + '.png')).as_posix()
    for folder in ('art/release-assets', 'public'):
        write(ROOT / folder / path, data)
    records.append(dict(path=path, bytes=len(data), sha256=digest))
    return '/' + path, digest


def main():
    bases = json.loads((OFFICE / 'actorPoseAtlas.generated.json').read_text(encoding='utf8'))
    landmarks = json.loads((ROOT / 'art/actor-poses-keys/standing/landmarks.json').read_text(encoding='utf8'))
    if bases.keys() != landmarks.keys():
        raise ValueError('Every selectable standing drawing needs head and eye registration')
    index, records = {}, []
    for key, meta in bases.items():
        heads, eyes, info = make_sheets(key, meta, landmarks[key])
        src, digest = publish(key, heads, records)
        eye_src, eye_digest = publish(key + '-eyes', eyes, records)
        index[key] = {k: meta[k] for k in ('cell', 'figureHeight', 'foot', 'grip')}
        index[key].update(src=src, sha256=digest, columns=5, count=25, neutralIndex=CENTER,
                          eyesSrc=eye_src, eyesSha256=eye_digest, **info)
        print(key, info['eyesCell'], flush=True)
    manifest = ROOT / 'lib/asset-manifest.json'
    previous = json.loads(manifest.read_text(encoding='utf8'))
    active = [row for row in previous if Path(row['path']).parent != ART] + records
    for path, obj in ((manifest, active), (OFFICE / 'actorLookAtlas.generated.json', index)):
        write(path, (json.dumps(obj, indent=2, ensure_ascii=False) + '\n').encode('utf8'))
    expected = {Path(record['path']).name for record in records}
    for folder in ('art/release-assets', 'public'):
        for file in (ROOT / folder / ART).glob('*.png'):
            parts = file.name.split('.')
            if file.name not in expected and len(parts) == 3 and len(parts[1]) == 12 and all(c in '0123456789abcdef' for c in parts[1]):
                file.unlink()


if __name__ == '__main__':
    main()
