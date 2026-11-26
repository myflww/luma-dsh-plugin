"""Rebuild every outfit's four contact-registered walk cycles from its painted keys.

Run from developer with node modules/luma-dsh-plugin/scripts/prepare-walks.mjs.
Build-only dependencies: Python, Pillow, NumPy and OpenCV.
"""
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path("modules/luma-dsh-plugin")
ART = Path("luma-office/luma-plugin-art")
METADATA = Path("overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.generated.json")
STEPS = 4
FIGURE = 244
SOLE = 258
CELL_HEIGHT = 272


def landmarks(image):
    """Register the body on sturdy ink; isolated antialias pixels are not soles."""
    mask = np.uint8(np.asarray(image.getchannel("A")) >= 96)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    # Include separate horns, halos and shoes, while excluding tiny flecks.
    keep = stats[:, cv2.CC_STAT_AREA] >= max(3, mask.sum() * .00025)
    keep[0] = False
    ys, xs = np.where(keep[labels])
    top, sole = ys.min(), ys.max()
    height = sole - top + 1
    head = xs[(ys >= top + height * .16) & (ys <= top + height * .40)]
    return float(np.median(head)), int(sole), int(height)


def register(frames):
    marks = [landmarks(im) for im in frames]
    center = np.median([m[0] for m in marks])
    median_h = np.median([m[2] for m in marks])
    poses = []
    for image, (head_x, floor_y, height) in zip(frames, marks):
        # Preserve small weight transfers and knee flexion, remove framing jumps.
        body_h = FIGURE + np.clip((height / median_h - 1) * FIGURE, -1.5, 1.5)
        scale = body_h / height
        head_offset = np.clip((head_x - center) * scale * .18, -2, 2)
        crop = image.crop(image.getbbox())
        left, top = image.getbbox()[:2]
        pose = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
        poses.append((pose, round((left - head_x) * scale + head_offset),
                      round(SOLE - (floor_y - top) * scale)))
    half = max(max(-left, left + pose.width) for pose, left, _ in poses) + 3
    cells = []
    for pose, left, top in poses:
        cell = Image.new("RGBA", (half * 2, CELL_HEIGHT))
        cell.paste(pose, (half + left, top))
        cells.append(cell)
    return cells


def premultiply(image):
    data = np.asarray(image).astype("float32") / 255
    data[:, :, :3] *= data[:, :, 3:4]
    return data


def straight(data):
    alpha = data[:, :, 3:4]
    rgb = np.clip(data[:, :, :3] / np.maximum(alpha, 1e-5), 0, 1)
    return Image.fromarray(np.rint(np.concatenate((rgb, alpha), axis=2) * 255).astype("uint8"))


def smooth_flow(flow):
    # Outlines are connected strokes. Fit a coarse displacement field to the
    # measured motion so one shoe, ribbon or eyelash cannot split into shards.
    small = cv2.resize(flow, None, fx=1/12, fy=1/12, interpolation=cv2.INTER_AREA)
    field = cv2.resize(small, (flow.shape[1], flow.shape[0]), interpolation=cv2.INTER_CUBIC)
    # Bound the spatial gradient to avoid folds while inverse sampling a pose.
    derivative = max(np.max(np.abs(np.diff(field, axis=d))) for d in (0, 1))
    return field * min(1.0, 1.35 / max(.001, derivative))


def inverse_sample(image, flow, fraction, grid):
    pos = grid - flow * fraction
    for _ in range(2):
        displacement = cv2.remap(flow, pos, None, cv2.INTER_LINEAR)
        pos = grid - displacement * fraction
    return cv2.remap(image, pos, None, cv2.INTER_LINEAR)


def inbetween(a, b, forward, backward, fraction, grid):
    left = inverse_sample(a, forward, fraction, grid)
    right = inverse_sample(b, backward, 1-fraction, grid)
    # Keep one coherent silhouette through crossings. Blend corresponding colors
    # only inside opaque overlapping regions where both paintings already agree.
    base, other = (left, right) if fraction < .5 else (right, left)
    close = np.max(np.abs(base[:, :, :3] - other[:, :, :3]), axis=2, keepdims=True)
    weight = np.clip(1 - close / .16, 0, 1) * (np.minimum(base[:, :, 3:4], other[:, :, 3:4]) > .95)
    mixed = base.copy()
    mixed[:, :, :3] += (other[:, :, :3] - base[:, :, :3]) * weight * min(fraction, 1-fraction)
    return straight(mixed)


def compile_strip(asset, stage):
    source = Path(asset["src"])
    if hashlib.sha256(source.read_bytes()).hexdigest() != asset["sha"]:
        raise ValueError("Source hash mismatch: " + asset["id"])
    strip = asset["strip"]
    w, h, total = [strip[k] for k in ("frameWidth", "frameHeight", "frameCount")]
    with Image.open(source) as sheet:
        columns = sheet.width // w
        frames = [sheet.crop((i % columns * w, i // columns * h, (i % columns+1)*w, (i // columns+1)*h)).convert("RGBA")
                  for i in range(total)]
    registered = register(frames)
    cells = [premultiply(im) for im in registered]
    planes = [cv2.cvtColor(np.uint8((c[:, :, :3] + .36 * (1 - c[:, :, 3:4])) * 255),
                          cv2.COLOR_RGB2GRAY) for c in cells]
    order = strip.get("frameOrder") or list(range(total))
    count = len(order) * STEPS
    cell_w, cell_h = registered[0].size
    cols = math.ceil(math.sqrt(count * cell_h / cell_w))
    atlas = Image.new("RGBA", (cols * cell_w, math.ceil(count / cols) * cell_h))
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0)
    grid = np.indices((cell_h, cell_w), dtype="float32")[::-1].transpose(1, 2, 0).copy()
    for i, j in enumerate(order):
        k = order[(i + 1) % len(order)]
        forward = smooth_flow(dis.calc(planes[j], planes[k], None))
        backward = smooth_flow(dis.calc(planes[k], planes[j], None))
        for n in range(STEPS):
            index = i * STEPS + n
            frame = registered[j] if n == 0 else inbetween(cells[j], cells[k], forward, backward, n / STEPS, grid)
            # Flow can briefly lift both soles at a crossing. Constrain the planted
            # foot and drawing height in the packed cells, including the loop seam.
            if n:
                _, sole, height = landmarks(frame)
                fitted_h = np.clip(height, FIGURE - 2, FIGURE + 2)
                ratio = fitted_h / height
                half = cell_w * .5
                frame = frame.transform((cell_w, cell_h), Image.Transform.AFFINE,
                    (1/ratio, 0, half - half/ratio, 0, 1/ratio, sole - SOLE/ratio),
                    resample=Image.Resampling.BICUBIC)
            atlas.paste(frame, (index % cols * cell_w, index // cols * cell_h))
    scratch = stage / (asset["sha"][:12] + ".png")
    atlas.save(scratch, format="PNG", compress_level=6)
    binary = scratch.read_bytes()
    sha = hashlib.sha256(binary).hexdigest()
    name = "gait-" + asset["sha"][:12] + "." + sha[:12] + ".png"
    scratch.rename(stage / name)
    url = (ART / name).as_posix()
    factor = asset["height"] / FIGURE
    bounds = [asset["center"] - cell_w / 2 * factor, asset["sole"] - SOLE * factor,
              cell_w * factor, cell_h * factor]
    return ({"src": "/" + url, "sha256": sha, "bounds": [round(n, 4) for n in bounds],
             "cell": [cell_w, cell_h], "figureHeight": FIGURE, "sole": SOLE, "columns": cols, "count": count},
            {"path": url, "sha256": sha, "bytes": len(binary)})


def main():
    cv2.setNumThreads(2)
    assets = json.load(sys.stdin)
    meta, records = {}, []
    manifest = ROOT / "lib/asset-manifest.json"
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        for asset in assets:
            m, r = compile_strip(asset, stage)
            meta[asset["id"]] = m
            records.append(r)
            print(asset["id"], flush=True)
        # Do not disturb unrelated art generated during this build.
        rows = json.loads(manifest.read_text(encoding="utf-8"))
        previous = [r for r in rows if r["path"].startswith(ART.as_posix() + "/gait-")]
        current = {r["path"] for r in records}
        for folder in [ROOT / "art/release-assets", ROOT / "public"]:
            (folder / ART).mkdir(exist_ok=True, parents=True)
            for row in records:
                dest = folder / row["path"]
                dest.write_bytes((stage / dest.name).read_bytes())
            for row in previous:
                old = folder / row["path"]
                if row["path"] not in current and old.parent == folder / ART:
                    old.unlink(missing_ok=True)
        manifest.write_text(json.dumps([r for r in rows if r not in previous] + sorted(records, key=lambda r:r["path"]),
                                       indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        METADATA.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
