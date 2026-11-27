"""Verify the shipped artwork. Run with Python 3.11+ and Pillow."""
import argparse
import base64
from collections import Counter
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import struct
from urllib.parse import unquote, urlsplit

from PIL import Image


class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "img", "source", "iframe"} and attrs.get("src"):
            self.links.append(attrs["src"])
        if tag == "link" and attrs.get("rel") in {"stylesheet", "icon", "preload"} and attrs.get("href"):
            self.links.append(attrs["href"])


def check_image(data):
    with Image.open(io.BytesIO(data)) as im:
        for frame in range(getattr(im, "n_frames", 1)):
            im.seek(frame)
            im.load()
            if "A" in im.getbands() and not im.getchannel("A").getbbox():
                raise ValueError(f"fully transparent image at frame {frame}")


def check_glb(data):
    magic, version, length = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("invalid GLB header")
    offset, binary, model = 12, b"", None
    while offset < length:
        size, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        if offset + size > length or size % 4:
            raise ValueError("invalid GLB chunk")
        if kind == b"JSON":
            model = json.loads(data[offset:offset+size])
        elif kind == b"BIN\x00":
            binary = memoryview(data)[offset:offset+size]
        offset += size
    if not model or not model.get("meshes"):
        raise ValueError("empty 3D model")
    views = model.get("bufferViews", [])
    for v in views:
        if v.get("buffer", 0) == 0 and not model["buffers"][0].get("uri"):
            start = v.get("byteOffset", 0)
            if start < 0 or start + v["byteLength"] > len(binary):
                raise ValueError("out-of-range GLB buffer view")
    for image in model.get("images", []):
        if "bufferView" in image and image["mimeType"] in {"image/jpeg", "image/png", "image/webp"}:
            v = views[image["bufferView"]]
            start = v.get("byteOffset", 0)
            check_image(binary[start:start+v["byteLength"]])
    return [item["uri"] for item in model.get("images", []) + model.get("buffers", []) if "uri" in item]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    package = args.package.resolve()
    public = package / "public"
    plugin = Path(__file__).resolve().parent / "modules/luma-dsh-plugin"
    manifest = json.loads((plugin / "lib/asset-manifest.json").read_text(encoding="utf8"))
    expected = {row["path"]: row for row in manifest}
    files = {p.relative_to(public).as_posix(): p for p in public.rglob("*") if p.is_file()}
    if len(expected) != len(manifest) or expected.keys() != files.keys():
        raise ValueError(f"resource list mismatch: {sorted(expected.keys() ^ files.keys())[:15]}")
    counts, errors = Counter(), []

    def check_links(page, links):
        for link in links:
            uri = urlsplit(link)
            if not uri.path or uri.scheme or uri.netloc or link.startswith("#"):
                continue
            name = unquote(uri.path)
            target = ((public / name.lstrip("/")) if name.startswith("/") else (page.parent / name)).resolve()
            if not target.is_relative_to(public) or not target.is_file():
                raise ValueError("missing embedded resource: " + name)
            counts["localReferences"] += 1

    def inspect(file, data):
        if file.suffix.lower() in {".png", ".webp", ".jpg", ".jpeg", ".gif"}:
            check_image(data)
            counts["standaloneImages"] += 1
        elif file.suffix == ".glb":
            check_links(file, check_glb(data))
            counts["glbModels"] += 1
        elif file.suffix == ".html":
            page = PageLinks()
            page.feed(data.decode("utf-8-sig"))
            if file.name == "original-index.html":
                # Provenance copies sit one level above the authored web tree.
                originals = [p for p in file.parent.rglob("index.html") if p.read_bytes() == data]
                if originals:
                    check_links(originals[0], page.links)
                else:
                    # A repacked edition can version its asset directory. Match
                    # every relocated file against a link in its live entry.
                    live = PageLinks()
                    live.feed(file.with_name("index.html").read_text(encoding="utf-8-sig"))
                    for link in page.links:
                        try:
                            check_links(file, [link])
                        except ValueError:
                            name = Path(urlsplit(link).path).name
                            matches = [ref for ref in live.links if Path(urlsplit(ref).path).name == name]
                            if len(matches) != 1:
                                raise
                            check_links(file, matches)
                counts["authoredPageCopies"] += 1
            else:
                check_links(file, page.links)
            counts["htmlPages"] += 1
        elif file.suffix == ".css":
            check_links(file, [value.strip(" '\"") for value in re.findall(r"url\(([^()]*)\)", data.decode("utf-8-sig"))])
        elif file.suffix == ".json":
            json.loads(data)

    for name, file in files.items():
        try:
            data = file.read_bytes()
            row = expected[name]
            if len(data) != row["bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
                raise ValueError("manifest digest or byte length mismatch")
            inspect(file, data)
            counts["verifiedPublicFiles"] += 1
        except (ValueError, KeyError, OSError, IndexError, struct.error) as error:
            errors.append({"file": name, "error": str(error)})

    pet_art = package / "native-desktop/pet-art"
    pose_index = Path(__file__).resolve().parent / "overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json"
    costumes = set(json.loads(pose_index.read_text(encoding="utf8")))
    for folder in ("", "bottom", "bottom-night", "greet", "drowsy", "lunch", "ledge", "performance"):
        directory = pet_art / folder
        actual = {file.stem for file in directory.glob("*.png")}
        expected_costumes = {"lu-mi-base", "lu-mi-v1"} if folder == "bottom-night" else costumes
        if actual != expected_costumes:
            errors.append({"file": directory.relative_to(package).as_posix(),
                           "error": "costume mismatch: " + ", ".join(sorted(actual ^ expected_costumes))})
    for file in sorted(pet_art.rglob("*.png")):
        try:
            inspect(file, file.read_bytes())
            if file.parent.name == "performance":
                with Image.open(file) as sheet:
                    if sheet.size != (4 * 384, 4 * 336):
                        raise ValueError("expected four rows, including the head-pat response")
                    alpha = sheet.getchannel("A")
                    for y in range(0, sheet.height, 336):
                        for x in range(0, sheet.width, 384):
                            box = alpha.crop((x, y, x + 384, y + 336)).getbbox()
                            if not box or min(box[0], box[1], 384 - box[2], 336 - box[3]) < 2:
                                raise ValueError(f"empty or clipped performance frame at {x}, {y}")
            counts["desktopPetImages"] += 1
        except (OSError, ValueError) as error:
            errors.append({"file": file.relative_to(package).as_posix(), "error": str(error)})
    bundle = (package / "native-desktop/client.mjs").read_bytes()
    for asset in set(re.findall(rb"data:image/(?:webp|png|jpeg);base64,([A-Za-z0-9+/=]+)", bundle)):
        try:
            check_image(base64.b64decode(asset, validate=True))
            counts["inlinedImages"] += 1
        except (ValueError, OSError) as error:
            errors.append({"file": "native-desktop/client.mjs", "error": str(error)})
    result = {"counts": dict(counts), "errors": errors}
    if args.report:
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps(result, ensure_ascii=False))
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
