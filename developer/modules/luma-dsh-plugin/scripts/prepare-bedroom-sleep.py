"""Register the same original-costume sleep cels used by the native desktop pet."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = Path("luma-office/luma-plugin-art/bedroom-sleep")
WARDROBE = {"lu-mi-base", "lu-mi-v1"}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def main():
    contacts = json.loads((ROOT / "art/original-sleep-landmarks.json").read_text(encoding="utf8"))
    if not WARDROBE.issubset(contacts):
        raise ValueError("The sleep catalog must cover both Lu Mi outfits")
    index, rows = {}, []
    for key in sorted(WARDROBE):
        marks = contacts[key]
        source = ROOT / "native-desktop/pet-art/ledge" / (key + ".png")
        with Image.open(source) as image:
            if list(image.size) != marks["size"] or image.mode != "RGBA":
                raise ValueError(f"Invalid sleep cel dimensions for {key}")
        if any(len(marks[p]) != 2 or not all(0 <= x <= 1 for x in marks[p]) for p in ("backOfHead", "hips", "feetCenter")):
            raise ValueError(f"Invalid sleep contacts for {key}")
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        url = (ART / f"{key}.{digest[:12]}.png").as_posix()
        for base in [ROOT / "public", ROOT / "art/release-assets"]:
            target = base / url
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != data:
                target.write_bytes(data)
        index[key] = dict(**marks, src="/" + url, sha256=digest)
        rows.append(dict(path=url, sha256=digest, bytes=len(data)))
    manifest = ROOT / "lib/asset-manifest.json"
    old = json.loads(manifest.read_text(encoding="utf8"))
    prefix = ART.as_posix() + "/"
    keep = {r["path"] for r in rows}
    for entry in old:
        if not entry["path"].startswith(prefix) or entry["path"] in keep:
            continue
        for base in [ROOT / "public", ROOT / "art/release-assets"]:
            target = base / entry["path"]
            if target.parent == base / ART:
                target.unlink(missing_ok=True)
    write_json(manifest, [r for r in old if not r["path"].startswith(prefix)] + rows)
    write_json(ROOT / "src/client/bedroomSleep.generated.json", index)


if __name__ == "__main__":
    main()
