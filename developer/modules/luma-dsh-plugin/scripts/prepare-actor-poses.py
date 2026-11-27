"""Register complete, independently illustrated poses and articulate their hinges.

Idle poses use calibrated eyes, hands and fixed sole pixels. Pickup, suspension
and landing use separately painted keys registered by eye spacing, with
articulated cutouts for the sleeves, hair, shins and shoes.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from PIL import Image

from standing_motion import make_idle

ROOT = Path(__file__).resolve().parents[1]
OFFICE = ROOT.parents[1] / 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
SOURCE = ROOT / 'art/actor-poses-keys'
ART = Path('luma-office/luma-plugin-art/actor-poses')
W, H = 384, 336
SOLE = 299
# Measurement board is 384 x 336 with the complete silhouette fit to 256 px.
STANDING_MARKS = json.loads((SOURCE/'standing'/'landmarks.json').read_text(encoding='utf8'))


def save_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as f:
        name = Path(f.name)
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        name.replace(path)
    finally:
        name.unlink(missing_ok=True)


def clean_soft_backing(rgba):
    """Discard isolated low-alpha backing but preserve antialiased strands."""
    alpha = rgba[:, :, 3]
    distance = cv2.distanceTransform(np.uint8(alpha < 142), cv2.DIST_L2, 5)
    edge = np.clip((3.2 - distance) / 2.5, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    clean = rgba.copy()
    clean[:, :, 3] = np.rint(alpha * edge).astype(np.uint8)
    return clean


def bounds(alpha, threshold=91):
    y, x = np.where(alpha > threshold)
    if not len(x):
        raise ValueError('Empty drawing')
    return x.min(), y.min(), x.max()+1, y.max()+1


def premult(im):
    out = im.astype(np.float32) / 255
    out[:, :, :3] *= out[:, :, 3:4]
    return out


def as_image(p):
    a = p[:, :, 3:4]
    rgb = p[:, :, :3] / np.maximum(a, 1e-6)
    return Image.fromarray(np.uint8(np.clip(np.dstack([rgb, a]), 0, 1)*255 + .5))


def over(front, back):
    return front + back * (1 - front[:, :, 3:4])


def transform(src, matrix, size=(W, H)):
    return cv2.warpAffine(src, np.asarray(matrix, np.float32), size, flags=cv2.INTER_LINEAR)


def shift(src, x, y):
    if not (x or y):
        return src
    return transform(src, [[1,0,x],[0,1,y]])


def rotate(src, pivot, degrees):
    if not degrees:
        return src
    return transform(src, cv2.getRotationMatrix2D(tuple(map(float, pivot)), degrees, 1))


def rectified(src, position, scale=1):
    """Maps the center of an illustration bounded by alpha to a 256px board."""
    left, top, right, bottom = bounds(src[:, :, 3])
    s = 256 / (bottom-top) * scale
    return [[s,0,position[0] - (left+right)*s/2],[0,s,position[1] - top*s]]


def normal_board(rgb):
    return transform(premult(rgb), rectified(rgb, (144,44)), (288,320))


def choose_cells(path):
    image = np.array(Image.open(path).convert('RGBA'))
    h,w = image.shape[:2]
    # Some paintings cross the arithmetic centerline with the very tip of one
    # shoe. Select four complete connected subjects instead of slicing at it.
    _, labels, stats, centers = cv2.connectedComponentsWithStats(np.uint8(image[:,:,3]>91))
    principal=[]
    for bottom, right in ((False,False),(False,True),(True,False),(True,True)):
        candidates=[i for i in range(1,len(stats)) if (centers[i,1]>=h/2)==bottom
                    and (centers[i,0]>=w/2)==right]
        principal.append(max(candidates,key=lambda i:stats[i,cv2.CC_STAT_AREA]))
    result=[]
    for subject in principal:
        x,y,bw,bh,_=stats[subject]
        distances=cv2.distanceTransform(np.uint8(labels!=subject),cv2.DIST_L2,3)
        selected=[subject]
        for i in range(1,len(stats)):
            if i in principal or stats[i,cv2.CC_STAT_AREA]<6:
                continue
            lx,ly,ww,hh,_=stats[i]
            if lx>x+bw+bh*.11 or ly>y+bh+bh*.11 or lx+ww<x-bh*.11 or ly+hh<y-bh*.11:
                continue
            patch=labels[ly:ly+hh,lx:lx+ww]==i
            if distances[ly:ly+hh,lx:lx+ww][patch].min()<bh*.085:
                selected.append(i)
        own=np.isin(labels,selected)
        rim=cv2.dilate(np.uint8(own),np.ones((7,7),np.uint8))
        l,t,r,b=bounds(rim,0)
        cell=image[t:b,l:r].copy()
        cell[:,:,3]*=rim[t:b,l:r]
        result.append(clean_soft_backing(cell))
    return result


@dataclass
class Registration:
    scale: float
    offset_x: float
    offset_y: float

    def point(self, pt):
        return [self.offset_x + self.scale*pt[0], self.offset_y + self.scale*pt[1]]

    def apply(self, source):
        # Compose source-to-board and board-to-screen transforms before painting
        # so face lines and iris highlights are sampled only once.
        ((s,_,dx),(_,_,dy)) = rectified(source, (144,44))
        return transform(premult(source), [[s*self.scale,0,dx*self.scale+self.offset_x],
                                           [0,s*self.scale,dy*self.scale+self.offset_y]])


def register(source, marks, neutral_eyes, grounded=False):
    eyes = np.asarray(marks, dtype=float)
    target = np.asarray(neutral_eyes, dtype=float)
    scale = np.linalg.norm(target[1]-target[0]) / np.linalg.norm(eyes[1]-eyes[0])
    cx, cy = eyes.mean(axis=0)
    tx, ty = target.mean(axis=0)
    if grounded:
        ty = SOLE-(299-cy)*scale
    return Registration(scale, tx-scale*cx, ty-scale*cy)


def polygon_mask(points):
    mask=np.zeros((H,W),np.uint8)
    cv2.fillPoly(mask, [np.rint(np.array(points)*16).astype(np.int32)], 255,
                 lineType=cv2.LINE_AA, shift=4)
    return mask.astype(np.float32)/255


@dataclass
class Cutout:
    pivot: tuple
    shape: list
    angle: float
    family: str


class ArticulatedDrawing:
    def __init__(self, src, parts, protected=None):
        self.src=src
        self.parts=[]
        omitted=np.zeros(src.shape[:2],np.float32)
        if protected is None:
            protected=np.zeros(src.shape[:2],bool)
        self.protected=protected
        for part in parts:
            mask=polygon_mask(part.shape)
            if part.family=='shin':
                # Let a detached shoe take its whole painted outline with it.
                heel=np.indices(mask.shape)[0] > part.pivot[1]+9
                expanded=cv2.dilate(mask,np.ones((5,5),np.uint8))
                mask[heel]=expanded[heel]
            mask[protected]=0
            mask*=1-omitted
            self.parts.append((part, src*mask[:,:,None]))
            omitted+=mask
        # Only the strips revealed behind a rotating sleeve or shoe use this
        # backing. The original color and alpha are restored everywhere else.
        hole = np.uint8((omitted>.01) & (src[:,:,3]>.002))
        self.back=np.empty_like(src)
        for ch in range(4):
            plane=np.uint8(np.rint(src[:,:,ch]*255))
            self.back[:,:,ch]=cv2.inpaint(plane,hole,3,cv2.INPAINT_TELEA)/255
        self.back=np.minimum(self.back,self.back[:,:,3:4])
        # A detached shoe is surrounded by transparent air. Reconstruct only
        # where the surrounding *stationary* artwork actually has coverage.
        stationary=(src[:,:,3]>.32) & (omitted<.5)
        distance=cv2.distanceTransform(np.uint8(~stationary),cv2.DIST_L2,5)
        proximity=np.clip((7-distance)/4,0,1)
        self.back *= (1-omitted+omitted*proximity)[:,:,None]
        self.back[hole==0]=src[hole==0]

    def frame(self, amounts, offsets=None, vertical=0):
        offsets=offsets or {}
        if not vertical and all(abs(amounts.get(p.family,0)*p.angle)<.001 and not any(offsets.get(p.family,(0,0))) for p,_ in self.parts):
            return self.src
        body=self.back.copy()
        for part, layer in self.parts:
            # The two forearms and calves fold towards different sides of
            # the torso; a vertical pull must never just rotate both left.
            side=1 if part.pivot[0]>=W/2 else -1
            bend={'arm':21,'shin':24,'tip':7}.get(part.family,0)
            angle=part.angle*amounts.get(part.family,0)+side*bend*vertical
            sprite=rotate(layer,part.pivot,angle)
            x,y=offsets.get(part.family,(0,0))
            if vertical:
                y+=vertical*{'arm':-1,'shin':-2,'tip':-2.5}.get(part.family,0)
            body=over(shift(sprite,x,y),body)
        body[self.protected]=self.src[self.protected]
        return body


def neutral_stance(key):
    src=np.array(Image.open(SOURCE/'standing'/(key+'.png')).convert('RGBA'))
    mat=rectified(src,(W/2,44))
    return transform(premult(src),mat), STANDING_MARKS[key]['eyes']


def protect_face(eyes):
    (lx,ly),(rx,ry)=eyes
    y,x=np.indices((H,W))
    span=math.dist(eyes[0],eyes[1])
    return ((x-(lx+rx)/2)/(.88*span))**2 + ((y-(ly+ry)/2)/(.80*span))**2 < 1


def forearm(pivot, palm, width, angle):
    elbow, hand = (np.asarray(v, dtype=float) for v in (pivot,palm))
    along=(hand-elbow)/max(1, np.linalg.norm(hand-elbow))
    across=np.array([-along[1],along[0]])
    rim=[elbow-2*along-width*.8*across, elbow+width*.8*across,
         hand+width*across, hand+width*along+width*.65*across,
         hand+width*along-width*.65*across,hand-width*across]
    return Cutout(elbow, rim, angle, 'arm')


def outer_lock(art, eyes, side):
    center=np.mean(eyes,axis=0)
    alpha=art[:,:,3]
    # Follow one outer hair lock or coat edge to its own terminal contour.
    # The face and skull always remain part of the untouched original drawing.
    start_y=int(center[1]+53)
    edge_points=[]
    for y in range(start_y,min(251,start_y+63),4):
        covered=np.flatnonzero(alpha[y]>.37)
        if len(covered):
            x=covered.min() if side<0 else covered.max()
            if abs(x-center[0])>39:
                edge_points.append([int(x),y])
    if len(edge_points)>4:
        exterior=[[x+side*4,y] for x,y in edge_points]
        inside=[[x-side*9,y] for x,y in reversed(edge_points)]
        return Cutout([exterior[0][0]-side*5,exterior[0][1]],exterior+inside,2.7,'tip')
    return None


def standing_layers(neutral, key, eyes):
    parts=[]
    tip=outer_lock(neutral,eyes,1 if key=='longmama-v1' else -1)
    if tip:
        parts.append(tip)
    return ArticulatedDrawing(neutral,parts,protect_face(eyes))


def part_from_spec(item, tr):
    return Cutout(tr.point(item['pivot']), [tr.point(pt) for pt in item['outline']],
                  item['angle'],item['family'])


def lower_leg(knee, toe, width, angle):
    knee,toe=np.array(knee),np.array(toe)
    along=(toe-knee)/max(1,np.linalg.norm(toe-knee))
    across=np.array([-along[1],along[0]])
    ankle=knee+.73*(toe-knee)
    rim=[knee-2*along-width*across,knee-2*along+width*across,
         ankle+width*.75*across,toe+width*across,
         toe+4*along+width*.75*across,toe+4*along-width*.75*across,
         toe-width*across,ankle-width*.75*across]
    return Cutout(knee,rim,angle,'shin')


def held_layers(entry, reg, art, eyes):
    if 'heldParts' in entry:
        return [part_from_spec(item,reg) for item in entry['heldParts']]
    parts=[]
    for elbow,palm,width,angle in entry['forearms']:
        parts.append(forearm(reg.point(elbow),reg.point(palm),width*reg.scale,angle))
    for knee,toe,width,angle in entry['shins']:
        parts.append(lower_leg(reg.point(knee),reg.point(toe),width*reg.scale,angle))
    tip=outer_lock(art,eyes,-1)
    if tip:
        parts.append(tip)
    return parts


def bend_knees(drawing, pixels):
    """The heel stays planted; only the short band through the knees bends.

    Above the knee the painted head and dress travel as one rigid drawing.
    The integer translation keeps the face identical to the source painting.
    """
    if not pixels:
        return drawing
    ys,xs=np.indices(drawing.shape[:2],dtype=np.float32)
    weight=np.clip((SOLE-9-ys)/34,0,1)
    return cv2.remap(drawing,xs,ys-pixels*weight,cv2.INTER_LINEAR)


def swing_hips(drawing, waist, angle):
    """Pivot the hips, skirt, and feet as one piece below a narrow waist joint."""
    if not angle:
        return drawing
    y,x=np.indices(drawing.shape[:2],dtype=np.float32)
    wx,wy=np.asarray(waist,np.float32)
    weight=np.clip((y-wy+5)/18,0,1)
    radians=np.float32(np.deg2rad(angle))*weight*weight*(3-2*weight)
    s,c=np.sin(radians),np.cos(radians)
    return cv2.remap(drawing,wx+c*(x-wx)-s*(y-wy),wy+s*(x-wx)+c*(y-wy),cv2.INTER_LINEAR)


def frame_sequences(neutral, caught, held, crouch, eyes, idle):
    brace=neutral.frame({'tip':-.30})
    # One relaxed hang and seven vertical reactions. Upward travel leaves the
    # shoes behind; a quick downward movement lifts and folds both knees.
    vertical=[0,-.30,-.64,-1,.25,.52,.78,1]
    rising=[held.frame({},vertical=v) for v in vertical]
    rows=[idle[:8],[neutral.src,bend_knees(brace,2),caught,shift(caught,0,-3),
                shift(caught,0,-6),rising[2],rising[1],held.src],rising]
    for side in (-1,1):
        # Cardinal and diagonal reactions use the same painted hinges. When
        # the pointer stops the controller returns to row two, column zero.
        reactions=[(.25,0),(.52,0),(.82,0),(1.12,0),(.54,-.63),(1,-.85),(.54,.63),(1,.85)]
        center=np.asarray(eyes).mean(axis=0)
        waist=(center[0],center[1]+60)
        rows.append([swing_hips(held.frame({'arm':side*x,'shin':side*x*1.14,'tip':side*x},
                                          vertical=y),waist,side*x*7.5) for x,y in reactions])
    rows.append([held.src,rising[3],bend_knees(crouch,-5),bend_knees(crouch,4),
                 crouch,bend_knees(crouch,-7),bend_knees(brace,3),neutral.src])
    return rows+[idle[8:16],idle[16:]]


def make_actor(key, entry, path):
    neutral, eyes=neutral_stance(key)
    paintings=choose_cells(path)
    regs=[register(paintings[i], entry['eyes'][i], eyes, i==2) for i in range(3)]
    caught, held, crouch=[r.apply(paintings[i]) for i,r in enumerate(regs)]
    parts=held_layers(entry,regs[1],held,eyes)
    layered=ArticulatedDrawing(held, parts, protect_face(eyes))
    standing=standing_layers(neutral,key,eyes)
    marks=STANDING_MARKS[key]
    idle,eye_frames,durations=make_idle(key,neutral,eyes,marks['hands'],marks['mouth'],[0,1])
    _,ground_x=np.where(neutral[SOLE-3:SOLE+1,:,3]>.55)
    foot_x=int(np.median(ground_x))
    return frame_sequences(standing,caught,layered,crouch,eyes,idle),eye_frames,durations,foot_x


def export_png(frames):
    atlas=Image.new('RGBA',(W*8,H*len(frames)))
    for r,row in enumerate(frames):
        for c,frame in enumerate(row):
            drawn=as_image(frame)
            box=drawn.getchannel('A').getbbox()
            if not box or min(box[0],box[1],W-box[2],H-box[3])<1:
                raise ValueError(f'row {r}, column {c}: silhouette touches cell edge')
            atlas.paste(drawn,(c*W,r*H))
    stream=BytesIO();atlas.save(stream,format='PNG',compress_level=6)
    return stream.getvalue()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=STANDING_MARKS,help='Export a single preview without changing manifests')
    parser.add_argument('--output',type=Path,help='PNG destination for --only')
    args=parser.parse_args()
    entries=json.loads((SOURCE/'landmarks.json').read_text(encoding='utf-8-sig'))
    if set(entries)!=set(STANDING_MARKS):
        raise ValueError('Every costume must have its own plate landmarks')
    if args.only:
        if args.output is None:
            parser.error('--only requires --output')
        frames,_,_,_=make_actor(args.only,entries[args.only],SOURCE/(args.only+'.png'))
        save_atomic(args.output,export_png(frames))
        return
    art_manifest=[]
    metadata={}
    for key in sorted(STANDING_MARKS):
        path=SOURCE/(key+'.png')
        frames,eye_frames,durations,foot_x=make_actor(key,entries[key],path)
        data=export_png(frames)
        digest=sha256(data).hexdigest()
        rel=(ART/(key+'.'+digest[:12]+'.png')).as_posix()
        for directory in (ROOT/'art/release-assets',ROOT/'public'):
            save_atomic(directory/rel,data)
        art_manifest.append({'path':rel,'sha256':digest,'bytes':len(data)})
        metadata[key]={'src':'/'+rel,'sha256':digest,'cell':[W,H],'columns':8,'count':64,
                       'figureHeight':256,'foot':[foot_x,300],'grip':[192,60],
                       'eyes':eye_frames[0],'idleDurationsMs':durations,'idleEyes':eye_frames}
        print(key,flush=True)
    manifest=ROOT/'lib/asset-manifest.json'
    old=json.loads(manifest.read_text(encoding='utf8'))
    retained=[row for row in old if Path(row['path']).parent!=ART]
    save_atomic(manifest,(json.dumps(retained+art_manifest,indent=2,ensure_ascii=False)+'\n').encode('utf8'))
    save_atomic(OFFICE/'actorPoseAtlas.generated.json',(json.dumps(metadata,indent=2)+'\n').encode('utf8'))
    valid={Path(entry['path']).name for entry in art_manifest}
    for directory in (ROOT/'public',ROOT/'art/release-assets'):
        for obsolete in (directory/ART).glob('*.png'):
            parts=obsolete.name.split('.')
            if (obsolete.name not in valid and len(parts)==3 and parts[0] in metadata and
                    len(parts[1])==12 and all(c in '0123456789abcdef' for c in parts[1])):
                obsolete.unlink()


if __name__=='__main__':
    main()
