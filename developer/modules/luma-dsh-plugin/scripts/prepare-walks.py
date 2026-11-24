"""Compile contact-registered inbetweens from Luma's painted walk cycles.

Run from developer via node modules/luma-dsh-plugin/scripts/prepare-walks.mjs.
Build dependency only: Python 3, Pillow, NumPy and OpenCV (DIS optical flow).
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path("modules/luma-dsh-plugin")
ART = Path("luma-office/luma-plugin-art")
METADATA = Path("overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.generated.json")
STEPS = 3


def registration(frames):
    # Sample upper-body mass and the supporting sole, excluding wispy shadows.
    contacts = []
    for frame in frames:
        alpha = np.array(frame.getchannel("A"))
        ys, xs = np.where(alpha > 95)
        y0, y1 = np.percentile(ys, [0.5, 99.8])
        head = xs[(ys > y0 + .14 * (y1 - y0)) & (ys < y0 + .39 * (y1 - y0))]
        contacts.append((np.median(head), y1, y1 - y0))
    center, sole, height = np.median(contacts, axis=0)
    # Keep a small amount of the artist's weight shift. Correct only the root;
    # the trailing skirt, arms and feet retain their relative painted motion.
    return [(round(np.clip((center - x) * .72, -.075 * height, .075 * height)),
             round(np.clip((sole - y) * .88, -.06 * height, .06 * height)))
            for x, y, _ in contacts]


def intermediate(a, b, t, forward, backward, x, y):
    def sample(image, flow, ratio):
        # Two inverse-warp iterations bring the source hand/hem towards its
        # destination. Premultiplied edge colors avoid dark transparent fringes.
        dx = x - flow[:, :, 0] * ratio
        dy = y - flow[:, :, 1] * ratio
        vector = cv2.remap(flow, dx, dy, cv2.INTER_LINEAR)
        return cv2.remap(image, x - vector[:, :, 0] * ratio,
                         y - vector[:, :, 1] * ratio, cv2.INTER_LINEAR)
    left, right = sample(a, forward, t), sample(b, backward, 1 - t)
    # At disoccluding edges prefer the nearer original, rather than drawing
    # two partially transparent hands or shoes.
    mismatch = np.max(np.abs(left - right), axis=2, keepdims=True)
    confidence = np.clip(1 - (mismatch - .12) * 3.2, 0, 1)
    weight = confidence * t + (1 - confidence) * (0 if t < .5 else 1)
    return left * (1 - weight) + right * weight


def straight(image):
    alpha = image[:, :, 3:4]
    rgba = np.concatenate((np.clip(image[:, :, :3] / np.maximum(1e-5, alpha), 0, 1), alpha), axis=2)
    return Image.fromarray(np.rint(np.clip(rgba, 0, 1) * 255).astype("uint8"), "RGBA")


def compile_strip(asset):
    strip = asset["strip"]
    w, h, total = [strip[k] for k in ("frameWidth", "frameHeight", "frameCount")]
    source = Path(asset["src"])
    if hashlib.sha256(source.read_bytes()).hexdigest() != asset["sha"]:
        raise ValueError("Mismatched source " + asset["id"])
    with Image.open(source) as im:
        columns = im.width // w
        frames = [im.crop((i % columns * w, i // columns * h, (i % columns + 1) * w,
                           (i // columns + 1) * h)).convert("RGBA") for i in range(total)]
    offsets = registration(frames)
    boxes = [frame.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox() for frame in frames]
    left = min(box[0] + dx for box, (dx, _) in zip(boxes, offsets)) - 4
    top = min(box[1] + dy for box, (_, dy) in zip(boxes, offsets)) - 4
    right = max(box[2] + dx for box, (dx, _) in zip(boxes, offsets)) + 4
    bottom = max(box[3] + dy for box, (_, dy) in zip(boxes, offsets)) + 4
    sw, sh = right - left, bottom - top
    zoom = min(1, 256 / sh)
    size = (max(1, round(sw * zoom)), max(1, round(sh * zoom)))
    cells, planes = [], []
    for frame, (dx, dy) in zip(frames, offsets):
        image = frame.crop((left - dx, top - dy, right - dx, bottom - dy)).resize(size, Image.Resampling.LANCZOS)
        a = np.array(image).astype("float32") / 255
        a[:, :, :3] *= a[:, :, 3:4]
        cells.append(a)
        # Gentle neutral matte keeps white costumes visible to the motion estimator.
        planes.append(cv2.cvtColor(np.uint8((a[:, :, :3] + (1-a[:, :, 3:4])*.33) * 255), cv2.COLOR_RGB2GRAY))
    order = strip.get("frameOrder") or list(range(total))
    count = len(order) * STEPS
    cols = math.ceil(math.sqrt(count * size[1] / size[0]))
    atlas = Image.new("RGBA", (cols * size[0], math.ceil(count / cols) * size[1]))
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0)
    y, x = np.mgrid[0:size[1], 0:size[0]].astype("float32")
    for i, j in enumerate(order):
        k = order[(i + 1) % len(order)]
        forward = dis.calc(planes[j], planes[k], None)
        backward = dis.calc(planes[k], planes[j], None)
        for n in range(STEPS):
            idx = i * STEPS + n
            frame = cells[j] if n == 0 else intermediate(cells[j], cells[k], n / STEPS, forward, backward, x, y)
            atlas.paste(straight(frame), (idx % cols * size[0], idx // cols * size[1]))
    out = ROOT / "art/release-assets" / ART
    out.mkdir(exist_ok=True, parents=True)
    scratch = out / ("gait-" + asset["sha"][:12] + ".tmp")
    atlas.save(scratch, format="WEBP", quality=90, method=4)
    binary = scratch.read_bytes()
    sha = hashlib.sha256(binary).hexdigest()
    name = "gait-" + asset["sha"][:12] + "." + sha[:12] + ".webp"
    scratch.replace(out / name)
    public = ROOT / "public" / ART
    public.mkdir(exist_ok=True, parents=True)
    (public / name).write_bytes(binary)
    path = (ART / name).as_posix()
    return ({"src": "/" + path, "sha256": sha, "bounds": [left, top, sw, sh],
             "cell": list(size), "columns": cols, "count": count},
            {"path": path, "sha256": sha, "bytes": len(binary)})


def main():
    cv2.setNumThreads(2)
    assets = json.load(sys.stdin)
    meta, records = {}, []
    for asset in assets:
        if asset["id"] not in meta:
            m, r = compile_strip(asset)
            meta[asset["id"]] = m
            records.append(r)
            print(asset["id"], flush=True)
    METADATA.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    manifest = ROOT / "lib/asset-manifest.json"
    rows = [row for row in json.loads(manifest.read_text(encoding="utf-8"))
            if not row["path"].startswith(ART.as_posix() + "/gait-")]
    manifest.write_text(json.dumps(rows + sorted(records, key=lambda r:r["path"]), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
