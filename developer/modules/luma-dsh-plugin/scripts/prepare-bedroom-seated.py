"""Register the bedroom character-only paintings against the occupied chair models.

The first key supplies the body. Only the painted forearms and fingertips change
between strokes, keeping the head, clothes touching the seat, and shoes steady.
"""
import hashlib
import importlib.util
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('desk', Path(__file__).with_name('prepare-desk-rear.py'))
desk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desk)
SOURCE = desk.PLUGIN / 'art/bedroom-seated-keys'
ART = Path('luma-office/luma-plugin-art/bedroom-seated')
CELL = 512
HEAD_WIDTH = 128
HIP = (218, 353)


def build(source, rig, angle):
    keys = desk.cut_high_keys(source)
    w, h = keys[0].size
    back, nose, crown, chin, hip_x, hip_y, far_x, far_y, near_x, near_y, elbow_x, elbow_y, knee_x, knee_y, sole_x, sole_y = rig
    scale = HEAD_WIDTH / ((nose - back) * w / 100)
    def point(x, y):
        return [round(HIP[0] + (x - hip_x) * w * scale / 100, 2),
                round(HIP[1] + (y - hip_y) * h * scale / 100, 2)]
    def register(key):
        # Crop height varies slightly across keys. A single factor preserves
        # the anatomy and does not stretch or flatten any of the source drawings.
        kw, kh = key.size
        s = scale * h / kh
        transform = np.float32([[s, 0, HIP[0]-kw*s*hip_x/100], [0, s, HIP[1]-kh*s*hip_y/100]])
        return cv2.warpAffine(desk.pm(key), transform, (CELL, CELL), flags=cv2.INTER_AREA)
    figures = [register(key) for key in keys]
    base = figures[0]
    iy, ix = np.indices((CELL, CELL))
    palms = [point(far_x, far_y), point(near_x, near_y)]
    ex, ey = point(elbow_x, elbow_y)
    arm = np.zeros((CELL, CELL), dtype=np.float32)
    for px, py in palms:
        # Include both keys' transparent space around the fingers so lifting
        # a fingertip uncovers the keyboard and never leaves a duplicate hand.
        length = np.hypot(px-ex,py-ey)
        ux, uy = (px-ex)/length, (py-ey)/length
        dx, dy = ix-ex, iy-ey
        along = np.clip(dx*ux + dy*uy, 0, length)
        distance = np.hypot(dx-ux*along, dy-uy*along)
        arm = np.maximum(arm, np.clip((23-distance)/8, 0, 1))
    arm = arm[:,:,None]
    knee = point(knee_x, knee_y)
    sole = point(sole_x, sole_y)
    ankle_line = (knee[1]+sole[1])/2
    # The lower strip uses a separate, occasional ankle beat in the renderer.
    # Transfer the real painted shoe variation at low amplitude below the calf.
    lower = np.clip((iy-ankle_line-2)/12, 0, 1)[:,:,None]
    sheet = Image.new('RGBA', (4*CELL, CELL))
    for i, figure in enumerate(figures):
        changing = arm + (1-arm)*lower
        sheet.paste(desk.rgba(base*(1-changing) + figure*changing), (i*CELL, 0))
    bbox = sheet.crop((0,0,CELL,CELL)).getchannel('A').point(lambda a: 255 if a>60 else 0).getbbox()
    if min(bbox[0],bbox[1],CELL-bbox[2],CELL-bbox[3]) < 3:
        raise ValueError('Clipped character ' + source.stem)
    output = io.BytesIO()
    sheet.save(output, format='WEBP', lossless=True, method=5)
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    path = (ART / (source.stem+'-'+angle+'.'+digest[:12]+'.webp')).as_posix()
    head_height = round((chin-crown)*h*scale/100, 2)
    result = dict(src='/'+path,sha256=digest,look=source.stem,cell=[CELL,CELL],count=4,hip=list(HIP),
                  head=point((nose+back)/2,(chin+crown)/2),headWidth=HEAD_WIDTH,headHeight=head_height,
                  palms=palms,knee=knee,sole=sole,soleY=sole[1],ankleLine=round(ankle_line,2))
    desk.set_arm(result,(ex,ey,12))
    return path, data, result


def main():
    metadata = {}
    records = []
    paintings = {}
    for angle, folder in [('side',SOURCE), ('quarter',SOURCE/'quarter')]:
        rigs = json.loads((folder/'registration.json').read_text(encoding='utf8'))
        if set(rigs) != desk.EXPECTED:
            raise ValueError('Each angle needs all fourteen skull, hip, hand and foot registrations')
        for key, rig in sorted(rigs.items()):
            path, data, model = build(folder/(key+'.png'), rig, angle)
            metadata.setdefault(key,{})[angle]=model
            paintings[path]=data
            records.append(dict(path=path,sha256=model['sha256'],bytes=len(data)))
    def encode(value):
        return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode('utf8')
    chair_dir = desk.PLUGIN/'art/bedroom-poses'
    plates = [np.asarray(Image.open(chair_dir/('desk-chairs-'+phase+'.webp')).convert('RGBA'), dtype=float)
              for phase in ('day','night')]
    rooms = json.loads((desk.PLUGIN/'src/client/bedroom-chair-plates.generated.json').read_text())
    lighting = {}
    for room, geo in rooms.items():
        x = geo['cell']%5*440+220
        y = geo['cell']//5*260
        day, night = [p[y:y+geo['h'], x:x+geo['w']] for p in plates]
        solid = (day[:,:,3]>195) & (night[:,:,3]>195) & (day[:,:,:3].mean(axis=2)>35)
        tint = np.median((night[:,:,:3][solid]+8)/(day[:,:,:3][solid]+8), axis=0)
        lighting[room] = np.round(np.clip(tint, .45, 1.14),4).tolist()
    # The co-painted models retain their strokes and chair contacts. Measure
    # their cranium separately from horns and loose curls, just as for the
    # furniture-free views. Coordinates reference the original occupied art.
    joint_skulls = json.loads((SOURCE/'joint-skull-landmarks.json').read_text(encoding='utf8'))
    widths = {}
    for name, (room, key, rig, _) in desk.chair_pairs().items():
        family = name.split('-',1)[0]
        x0, x1 = joint_skulls[key][family]
        file = desk.SOURCE/'joint'/(name+'.png')
        tile = (desk.cut_high_keys(file) if name=='rose-longmama-v1' else desk.cut_keys(file))[0]
        size = (x1-x0)*tile.width*desk.SKULL/(tile.height*(rig[1]-rig[0]))
        widths.setdefault(room,{})[key]=round(size,3)
    for path, data in paintings.items():
        for dest in (desk.PLUGIN/'public', desk.PLUGIN/'art/release-assets'):
            desk.save_atomic(dest/path,data)
    manifest = desk.PLUGIN/'lib/asset-manifest.json'
    current = json.loads(manifest.read_text(encoding='utf8'))
    other = [row for row in current if Path(row['path']).parent != ART]
    desk.save_atomic(manifest, encode(other + records))
    desk.save_atomic(desk.PLUGIN/'src/client/bedroomSeated.generated.json',
                    encode({'models':metadata,'lighting':lighting,'jointHeadWidths':widths}))
    keep = {row['path'] for row in records}
    for row in current:
        if Path(row['path']).parent==ART and row['path'] not in keep:
            for folder in (desk.PLUGIN/'public', desk.PLUGIN/'art/release-assets'):
                (folder/row['path']).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
