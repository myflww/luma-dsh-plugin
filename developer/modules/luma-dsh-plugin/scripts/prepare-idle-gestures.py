"""Compile two independent, foot-registered idle gestures for every costume.

Each transparent six-key sheet is a 3-column, 2-row board. The untouched
neutral frame lives at either end of both sequences so each gesture can be
scheduled independently of a room or desktop pet's normal breathing clock.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OFFICE = ROOT.parents[1] / 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
SOURCE = ROOT / 'art/actor-poses-keys/idle-gestures'
ART = Path('luma-office/luma-plugin-art/idle-gestures')
ACTIONS = {
    'shan-base': [('cheer','握拳打气'),('clap','合掌轻拍')],
    'shan-v1': [('curtsy','提裙行礼'),('giggle','掩嘴轻笑')],
    'bai-shuangming-base': [('smooth-cape','理顺披肩'),('examine-palm','托手细看')],
    'bai-shuangming-v1': [('smooth-pleats','轻抚裙褶'),('listen','拢发侧听')],
    'lu-mi-base': [('straighten-ribbon','整理丝带'),('acknowledge','展掌致意')],
    'lu-mi-v1': [('gather-cape','拢好披肩'),('invite','侧身相邀')],
    'jingyuniang-base': [('smooth-apron','抚平围裙'),('watch-fluke','回头看尾鳍')],
    'jingyuniang-v1': [('stretch','伸展肩臂'),('balance','张臂稳住')],
    'longmama-base': [('tuck-hair','拢发至耳后'),('reassure','垂掌安抚')],
    'longmama-v1': [('brush-cloak','拂披风下摆'),('watch-tail','回望卷尾')],
    'claude-base': [('nod','会意点头'),('count','屈指数数')],
    'claude-v1': [('adjust-bow','理领结'),('raise-hand','举手回应')],
    'gemini-v1': [('adjust-visor','轻调面罩'),('trace-orbit','指尖描星轨')],
    'grok-v1': [('straighten-crown','扶正小皇冠'),('shrug','摊手反问')],
}


# Preparatory pause, time at the emphasized drawing, and recovery pause (ms).
# A quick clap and a quiet listening pose have different dramatic timing.
HOLDS = {
    'cheer':(115,265,130), 'clap':(90,120,115),
    'curtsy':(155,385,170), 'giggle':(110,310,125),
    'smooth-cape':(150,310,165), 'examine-palm':(155,490,150),
    'smooth-pleats':(170,350,185), 'listen':(155,520,170),
    'straighten-ribbon':(145,285,160), 'acknowledge':(135,330,180),
    'gather-cape':(160,325,180), 'invite':(145,400,155),
    'smooth-apron':(135,265,155), 'watch-fluke':(150,465,135),
    'stretch':(165,395,165), 'balance':(100,255,140),
    'tuck-hair':(160,280,160), 'reassure':(155,400,170),
    'brush-cloak':(170,340,165), 'watch-tail':(155,485,150),
    'nod':(115,220,130), 'count':(160,425,140),
    'adjust-bow':(135,290,130), 'raise-hand':(110,370,135),
    'adjust-visor':(140,350,165), 'trace-orbit':(160,440,175),
    'straighten-crown':(135,320,130), 'shrug':(125,415,145),
}


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(data)
        temporary=Path(f.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def drawings(path):
    image=np.asarray(Image.open(path).convert('RGBA'))
    height,width=image.shape[:2]
    alpha=image[:,:,3]
    # Generated cutouts can carry a broad, faint glow that connects adjacent
    # figures at mid-alpha. Seed ownership on their solid ink first.
    opaque=min(242,max(218,int(np.percentile(alpha,10))+45))
    solid=np.uint8(alpha>=opaque)
    _,labels,stats,centers=cv2.connectedComponentsWithStats(solid)
    if alpha.max()-float(alpha.min())<16:
        raise ValueError(f'{path}: expected transparent sprite sheet')
    bodies=[]
    for i in range(6):
        candidates=[n for n in range(1,len(stats)) if int(centers[n,0]*3/width)==i%3
                    and int(centers[n,1]*2/height)==i//3]
        if not candidates:
            raise ValueError(f'{path} missing exposure {i}')
        body=max(candidates,key=lambda n:stats[n,4])
        if stats[body,3]<height*.12 or stats[body,2]>width*.50:
            raise ValueError(f'{path} malformed silhouette in exposure {i}')
        bodies.append(body)
    groups=[[n] for n in bodies]
    # Assign every detached accessory to its nearest body. Hair tips can cross
    # a nominal grid boundary; a component is always owned by exactly one key.
    for n in range(1,len(stats)):
        if n in bodies or stats[n,4]<5: continue
        x,y,w,h,_=stats[n]
        distances=[]
        for body in bodies:
            bx,by,bw,bh,_=stats[body]
            gap=np.hypot(max(0,x-bx-bw,bx-x-w), max(0,y-by-bh,by-y-h))
            distances.append(gap/bh)
        owner=int(np.argmin(distances))
        if distances[owner]<.15: groups[owner].append(n)
    for group in groups:
        ink=np.uint8(np.isin(labels,group))
        mask=cv2.dilate(ink,np.ones((5,5),np.uint8))
        x,y,w,h=cv2.boundingRect(mask)
        rgba=image[y:y+h,x:x+w].copy()
        # Preserve a narrow antialiased edge and detached highlights. A matte
        # based solely on the bounding box leaves a conspicuous pink halo.
        distance=cv2.distanceTransform(1-ink[y:y+h,x:x+w],cv2.DIST_L2,5)
        rim=np.clip((3-distance)/2,0,1)
        floor=max(124,opaque-67)
        edge=np.clip((rgba[:,:,3].astype(np.float32)-floor)/(246-floor),0,1)
        rgba[:,:,3]=np.uint8(255*edge*rim+.5)
        yield rgba


def place(drawing, scale, contact, floor):
    """A single rigid similarity transform keeps the source anatomy and knee bend intact."""
    sx,sy=contact
    fx,fy=floor
    matrix=np.float32([[scale,0,fx-scale*sx],[0,scale,fy-scale*sy]])
    rgb=drawing.astype(np.float32)/255
    rgb[:,:,:3]*=rgb[:,:,3:4]
    return cv2.warpAffine(rgb,matrix,(384,336),flags=cv2.INTER_LINEAR)


def premultiply(image):
    result=np.asarray(image).astype(np.float32)/255
    result[:,:,:3]*=result[:,:,3:4]
    return result


def straight(cell):
    alpha=cell[:,:,3:4]
    rgb=cell[:,:,:3]/np.maximum(alpha,1e-6)
    return Image.fromarray(np.uint8(np.clip(np.dstack((rgb,alpha))*255+.5,0,255)))


def ease_towards(source, next_key, fraction, foot):
    """Warp a single painting; a distant sleeve or face is never crossfaded.

    Neighbouring keys can have completely different hand silhouettes. The
    displacement is bounded and smoothed, while the shoe's contact stays fixed.
    """
    def guide(cell):
        flat=cell[:,:,:3]+(1-cell[:,:,3:4])*.76
        return cv2.cvtColor(np.uint8(np.clip(flat*255,0,255)),cv2.COLOR_RGB2GRAY)
    a,b=guide(source),guide(next_key)
    flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,29,4,7,1.5,0)
    h,w=a.shape
    coarse=cv2.resize(flow,(max(4,w//18),max(4,h//18)),interpolation=cv2.INTER_AREA)
    field=cv2.resize(coarse,(w,h),interpolation=cv2.INTER_CUBIC)
    length=np.maximum(.001,np.linalg.norm(field,axis=2))
    field*=np.minimum(1,13/length)[:,:,None]
    y,x=np.indices((h,w),dtype=np.float32)
    # Only the toe currently supporting the dancer is pinned. The
    # unloaded leg and hips follow the painted movement towards the next key.
    around_heel=np.hypot((x-foot[0])/12,(y-foot[1])/7)
    field*=np.clip((around_heel-.5)/1.25,0,1)[:,:,None]
    return cv2.remap(source,x-fraction*field[:,:,0],y-fraction*field[:,:,1],cv2.INTER_LINEAR)


def build(key, meta, registration):
    path=meta['src'].lstrip('/')
    w,h=meta['cell']
    with Image.open(ROOT/'art/release-assets'/path) as sheet:
        neutral=sheet.crop((0,0,w,h)).convert('RGBA')
    ready=premultiply(neutral)
    source=SOURCE/(key+'.png')
    reg=registration[key]
    if sha256(source.read_bytes()).hexdigest()!=reg['source']:
        raise ValueError(f'{key}: shoe and head landmarks belong to a different sheet')
    raw=list(drawings(source))
    poses=[];contacts=[]
    placement=reg.get('placementX',[0,0])
    for i,(drawing,mark) in enumerate(zip(raw,reg['keys'],strict=True)):
        # The reference head determines scale. Each painted heel is registered
        # at the floor position for this phase; a dipping head stays lower.
        # Keep the local optical-flow grid fixed to the original drawings.
        # Compose the whole action's shoe alignment after its in-betweens.
        floor=[meta['foot'][0]+mark['floor'][0]-placement[i//3],meta['foot'][1]-1+mark['floor'][1]]
        contacts.append(floor)
        poses.append(place(drawing,mark['scale'],mark['sole'],floor))
    sheet=Image.new('RGBA',(w*8,h*2))
    actions=[]
    for row,(name,title) in enumerate(ACTIONS[key]):
        prep,peak,recover=poses[row*3:row*3+3]
        offset=placement[row]
        # Compute recovery toward the new neutral in the same local space.
        local_neutral=np.zeros_like(ready)
        source_x=max(offset,0)
        destination_x=max(-offset,0)
        span=w-abs(offset)
        local_neutral[:,destination_x:destination_x+span]=ready[:,source_x:source_x+span]
        # Eight exposures in a single strip. The two bases are exact copies
        # rather than re-encoded through a premultiplied intermediate.
        keys=[neutral,straight(prep),straight(ease_towards(prep,peak,.46,contacts[row*3])),
              straight(peak),straight(ease_towards(peak,recover,.39,contacts[row*3+1])),
              straight(recover),straight(ease_towards(recover,local_neutral,.46,contacts[row*3+2])),neutral]
        for col,picture in enumerate(keys):
            if offset and 0<col<7:
                positioned=Image.new('RGBA',(w,h))
                positioned.paste(picture,(offset,0))
                picture=positioned
            box=picture.getchannel('A').getbbox()
            if not box or min(*box[:2],w-box[2],h-box[3])<1:
                raise ValueError(f'{key} action {row} column {col} is clipped')
            sheet.paste(picture,(col*w,row*h))
        # The emphasis on the middle drawing lets the action finish before
        # the next autonomous decision, even at the desktop timer's cadence.
        lead,accent,settle=HOLDS[name]
        beat=[85,lead,95,accent,110,settle,100,90]
        actions.append({'id':name,'label':title,'frames':list(range(row*8,row*8+8)),'durationsMs':beat})
    buffer=BytesIO();sheet.save(buffer,format='PNG',compress_level=6)
    return buffer.getvalue(),actions


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=ACTIONS, help='Rebuild and register just this costume')
    args=parser.parse_args()
    bases=json.loads((OFFICE/'actorPoseAtlas.generated.json').read_text(encoding='utf8'))
    if set(bases)!=set(ACTIONS):
        raise ValueError('Every selectable costume needs two small gestures')
    registration_path=SOURCE/'registration.json'
    registration=json.loads(registration_path.read_text(encoding='utf8')) if registration_path.exists() else {}
    metadata_path=OFFICE/'actorGestureAtlas.generated.json'
    index=json.loads(metadata_path.read_text(encoding='utf-8-sig')) if args.only and metadata_path.exists() else {}
    targets=[args.only] if args.only else list(bases)
    records=[]
    for key in targets:
        base=bases[key]
        png,actions=build(key,base,registration)
        digest=sha256(png).hexdigest()
        rel=(ART/(key+'.'+digest[:12]+'.png')).as_posix()
        for folder in ['public','art/release-assets']: write_atomic(ROOT/folder/rel,png)
        records.append({'path':rel,'sha256':digest,'bytes':len(png)})
        index[key]={field:base[field] for field in ['cell','figureHeight','foot','grip']}
        index[key].update(src='/'+rel,sha256=digest,columns=8,count=16,actions=actions)
        print(key,flush=True)
    manifest=ROOT/'lib/asset-manifest.json'
    old=json.loads(manifest.read_text(encoding='utf8'))
    records=[row for row in old if Path(row['path']).parent!=ART
             or Path(row['path']).name.split('.')[0] not in targets]+records
    dump=lambda data:(json.dumps(data,indent=2,ensure_ascii=False)+'\n').encode('utf8')
    write_atomic(manifest,dump(records))
    write_atomic(metadata_path,dump(dict(sorted(index.items()))))
    active={Path(v['src']).name for v in index.values()}
    for folder in ['public','art/release-assets']:
        for file in (ROOT/folder/ART).glob('*.png'):
            parts=file.name.split('.')
            if file.name not in active and len(parts)==3 and parts[0] in targets and len(parts[1])==12 and all(c in '0123456789abcdef' for c in parts[1]):
                file.unlink()


if __name__=='__main__':
    main()
