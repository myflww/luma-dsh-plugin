"""Composite the original rear typing hands and hair over the matching rear garment.

Run after preparing the walk atlases and restoring public assets. Each source is a
reviewed, rear-facing four-key typing strip. The chair used in the original paint
covers part of the outfit, so that region comes from the same outfit's rear walk.
"""
import hashlib
import os
from tempfile import NamedTemporaryFile
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops

PLUGIN = Path(__file__).resolve().parents[1]
OFFICE = PLUGIN.parents[1]/'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
PUBLIC = PLUGIN/'public'
ART = Path('luma-office/luma-plugin-art/rear-desk')
CELL = (352, 320)
# Measured in the tight rear-typing silhouette (including the original casters):
# x of spine, y of wrists, top of backrest, y of cushion, depth of clothing, width of donor.
# The hip is the actual contact on the cushion; garment and shoes may hang below.
RIGS = {
    'shan-base': (.50,.355,.425,.714,.80,.90),
    'shan-v1': (.50,.355,.415,.715,.80,.90),
    'bai-shuangming-base': (.50,.265,.395,.694,.82,.95),
    'bai-shuangming-v1': (.47,.380,.425,.717,.87,.96),
    'lu-mi-base': (.50,.370,.55,.710,.83,.97),
    'lu-mi-v1': (.49,.355,.55,.710,.83,.99),
    'jingyuniang-base': (.398,.427,.49,.715,.81,.89),
    'jingyuniang-v1': (.397,.423,.49,.715,.81,.89),
    'longmama-base': (.49,.37,.54,.722,.855,.95),
    'longmama-v1': (.50,.37,.54,.720,.85,.96),
    'claude-base': (.50,.328,.48,.713,.82,.98),
    'claude-v1': (.50,.325,.48,.714,.82,.98),
    'gemini-v1': (.50,.395,.47,.712,.84,.99),
    'grok-v1': (.51,.40,.47,.710,.82,.96),
}


# Rear view: the two calves project forward under the desk, hidden by the skirt
# and cushion. Trace the *actual painted hem* (including its lace scallops)
# above the legs in each 352 x 320 cell. Preserve side tresses, cape and tail
# outside these points. A bent seated hip spreads the fabric over the cushion.
SEATED_HEMS = {
    'shan-base': [(139,225),(151,225),(164,228),(178,232),(192,234),(207,233),(216,232)],
    'shan-v1': [(147,260),(159,260),(170,258),(181,255),(193,259),(204,258)],
    'bai-shuangming-base': [(145,245),(157,241),(170,242),(180,240),(191,242),(204,241)],
    'bai-shuangming-v1': [(144,247),(155,243),(171,241),(181,243),(195,242),(211,246)],
    'lu-mi-base': [(144,239),(151,230),(164,227),(175,227),(188,228),(198,237)],
    'lu-mi-v1': [(145,248),(157,245),(167,242),(177,240),(187,245),(201,249)],
    'jingyuniang-base': [(146,259),(158,257),(171,256),(182,255),(191,261),(205,266)],
    'jingyuniang-v1': [(146,258),(158,255),(169,252),(180,251),(188,259),(204,265)],
    'longmama-base': [(161,283),(166,277),(173,274),(181,275),(187,282)],
    'longmama-v1': [(155,279),(163,268),(174,265),(183,265),(189,279)],
    'claude-base': [(155,265),(162,262),(173,260),(184,258),(196,260),(203,266)],
    'claude-v1': [(153,227),(159,227),(171,226),(184,224),(195,224),(204,226)],
    'gemini-v1': [(155,271),(163,268),(170,266),(176,268),(186,269),(192,271)],
    'grok-v1': [(147,256),(155,236),(165,235),(172,231),(176,244),(185,248),(196,250),(202,256)],
}


def seated_hem(cell, key):
    import cv2
    # Shared across animation keys: no flicker at the seam or in garment width.
    trace = np.asarray(SEATED_HEMS[key])
    w,h = cell.size
    y,x = np.indices((h,w),dtype='float32')
    # Round the side fall into the seat. An axis-aligned leg mask alone would
    # leave rectangular notches in the long white and blue dresses.
    left, right = trace[0], trace[-1]
    side_fall = np.vstack([left + [-30,33], left + [-16,14], left + [-7,4],
                           trace, right + [7,4], right + [16,14], right + [30,33]])
    edge = np.interp(x[0],side_fall[:,0],side_fall[:,1])
    pixels = np.array(cell)
    transparent = ((x>=side_fall[0,0]) & (x<=side_fall[-1,0]) & (y>edge))
    pixels[transparent] = 0
    # Bring the middle of the hem into actual contact with the registered hip.
    # Side folds still drape over the seat. The contact contour is rounded at
    # the hips even when the standing skirt exposes one knee higher than the other.
    flare = np.clip((y-174)/78,0,1)
    source_x = 176+(x-176)/(1+.14*flare**2)
    source_edge = np.interp(source_x,trace[:,0],trace[:,1]).astype('float32')
    center_weight = np.exp(-((source_x-176)/73)**4)
    seat_edge = 255-4*((source_x-176)/75)**2
    offset = (seat_edge-source_edge)*center_weight
    eased = np.clip((y-170)/np.maximum(1,source_edge+offset-170),0,1)
    source_y = y-offset*eased
    # Sample premultiplied RGBA to preserve watercolor and line edges.
    data = pixels.astype('float32')/255
    data[:,:,:3] *= data[:,:,3:4]
    data = cv2.remap(data,source_x.astype('float32'),source_y.astype('float32'),cv2.INTER_LINEAR)
    data[:,:,:3] /= np.maximum(.00001,data[:,:,3:4])
    return Image.fromarray(np.uint8(np.clip(data,0,1)*255+.5))


def bbox(im):
    return im.getchannel('A').point(lambda a: 255 if a >= 48 else 0).getbbox()


def compose(img, chair_mask, back, box, rig, role):
    spine, wrist, start, hip, shoes, width = rig
    l,t,r,b=box
    w,h=r-l,b-t
    art=img.crop(box)
    mat=chair_mask.crop(box)
    clean=np.asarray(ImageChops.multiply(art.getchannel('A'),mat)).astype(float)
    rgb=np.asarray(art,dtype=float)[:,:,:3]
    brightness=rgb.max(2)
    chroma=brightness-rgb.min(2)
    yy,xx=np.mgrid[:h,:w]
    u=(xx/w-spine)
    v=yy/h
    # Eliminate the rubber armrests and metal underframe, including colored
    # anti-aliased outlines left outside the original neutral-color matte.
    chair=(brightness<137) & (chroma < .32*brightness+17)
    threshold=start+np.where(np.abs(u)<.28,0,.009)
    if role=='lu-mi':
        # A dark-haired resident overlaps the central backrest. Her hair forms a
        # curved tip; protect it above that curve, clear all chair ink beneath it.
        threshold=np.maximum(threshold,.603-.18*np.minimum(1,np.abs(u)*2.6)**2)
    clean[(v>threshold)&chair]=0
    # The caster hub and spokes start below the cushion. Preserve the original
    # outer skirt/tail while the occluded center is reconstructed.
    clean[(v>hip+.012)&(np.abs(u)<.26)]=0
    clean[v>.865]=0
    if role=='lu-mi':
        clean[(v>threshold)&(np.abs(u)<.32)]=0
    if role=='claude':
        clean[(v>.493)&(v<.56)&(np.abs(u)>.41)]=0
    # Keep the rear portrait and working arms as one opaque layer. Its lower
    # edge follows the ends of the hairstyle or sleeves. Below that edge the
    # garment is drawn once from the back view, without leftover caster pieces.
    if role in ('longmama','lu-mi','jingyuniang','claude'):
        hair_end={'longmama':.645,'lu-mi':.61,'jingyuniang':.60,'claude':.58}[role]
    else:
        hair_end={'shan':.62,'bai-shuangming':.51,'gemini':.55,'grok':.65}[role]
    cutoff=hair_end+.045*np.minimum(1,np.abs(u)*3)
    clean*=np.clip((cutoff-v)/.025,0,1)
    if role=='jingyuniang':
        # The seated tail curls higher than the garment donor's tail. Keep only
        # the donor below this point to avoid a second detached fluke.
        clean[(u>.295)&(v>.56)]=0
    art.putalpha(Image.fromarray(clean.astype('uint8')))

    # Bend the lower body into sitting while retaining the painted shoes and hem.
    # Arms from the walker lie outside this central repair. Both working hands,
    # the face-away head and the outer costume contour come from the typing art.
    if role=='jingyuniang':
        back=back.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    donor_box=bbox(back)
    donor=back.crop(donor_box)
    donor_center=back.width/2-donor_box[0]
    dw,dh=donor.size
    dx=w*width
    sy=np.interp(v,[0,.39,hip,shoes,1.001],[0,.39,.75,1,1.4])*dh
    # A wing or an asymmetric tail should never displace the spine.
    sx=u*w/dx*dw+donor_center
    import cv2
    premul=np.asarray(donor).astype('float32')/255
    premul[:,:,:3]*=premul[:,:,3:]
    painted=cv2.remap(premul,sx.astype('float32'),sy.astype('float32'),cv2.INTER_LINEAR)
    a=painted[:,:,3:4]
    rgba=np.concatenate([np.clip(painted[:,:,:3]/np.maximum(a,.0001),0,1),a],axis=2)
    # A taper puts the repair behind the side locks, never alongside the hands.
    width_limit=np.interp(v,[0,start-.08,start+.06,hair_end,hip+.025,1],[.10,.13,.32,.5,.75,.75])
    clip=np.clip((width_limit-np.abs(u))/.025,0,1)*np.clip((v-start+.05)/.04,0,1)
    rgba[:,:,3]*=clip
    # Keep the reaching hands from the sitting pose. A donor's walking fingers
    # must not appear alongside the dress at hip height.
    rr,gg,bb=rgba[:,:,0],rgba[:,:,1],rgba[:,:,2]
    donor_hand=(rr>.68)&(rr>bb*1.06)&(rr>gg*1.025)&(gg>.54)&(bb>.40)
    lateral=(np.abs(u)>.17)&(sy/dh>.50)&(sy/dh<.72)
    if role not in ('claude','shan','grok'):
        rgba[:,:,3]*=1-cv2.GaussianBlur(np.float32(donor_hand&lateral),(3,3),.5)
    body=Image.fromarray(np.uint8(np.clip(rgba,0,1)*255))
    body.alpha_composite(art)
    # Remove isolated matte flecks detached from the seated silhouette.
    alpha=np.array(body.getchannel('A'))
    n,labels,stats,_=cv2.connectedComponentsWithStats(np.uint8(alpha>8))
    for idx in range(1,n):
        if stats[idx,cv2.CC_STAT_AREA]<max(3, w*h*.00009):
            alpha[labels==idx]=0
    body.putalpha(Image.fromarray(alpha))
    # One coordinate system and one fixed hip anchor for every key in a strip.
    scale=238/(h*hip)
    body=body.resize((round(w*scale),round(h*scale)),Image.Resampling.LANCZOS)
    x=round(CELL[0]/2-spine*w*scale)
    y=round(254-hip*h*scale)
    cell=Image.new('RGBA',CELL)
    cell.alpha_composite(body,(x,y))
    return cell,{'hip':[176,254],'hand':[176,round(y+wrist*h*scale)],'head':[176,round(y+.17*h*scale)],'bodyHeight':238}


def replace_verified(dest, raw):
    # Publish only a closed, fully written file. A cancelled generation can be
    # rerun without exposing truncated images under an existing content hash.
    dest.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=dest.parent, delete=False) as tmp:
        scratch = Path(tmp.name)
        try:
            tmp.write(raw)
            tmp.flush()
            os.fsync(tmp.fileno())
        except BaseException:
            tmp.close()
            scratch.unlink(missing_ok=True)
            raise
    try:
        if scratch.stat().st_size != len(raw):
            raise OSError('Incomplete write: ' + str(dest))
        scratch.replace(dest)
    finally:
        scratch.unlink(missing_ok=True)


def main():
    manifest=PLUGIN/'lib/asset-manifest.json'
    rows=json.loads(manifest.read_text(encoding='utf8'))
    paths={r['sha256']:r['path'] for r in rows}
    masks=json.loads((OFFICE/'sceneChairMattes.generated.json').read_text())
    walks=json.loads((OFFICE/'walkAtlas.generated.json').read_text())
    # Asset hashes are bound to the existing per-outfit reviewed rear chair mattes.
    variant_sources={}
    for sha in masks:
        stem=Path(paths[sha]).stem.split('.')[0]
        role=next((r for r in ['bai-shuangming','lu-mi','jingyuniang','longmama','claude','shan','gemini','grok'] if stem.startswith(r+'-')),None)
        if not role: raise ValueError(stem)
        variant_sources[role+('-v1' if 'skin-v1' in stem else '-base')]=sha
    if variant_sources.keys()!=RIGS.keys():
        raise ValueError(str(variant_sources))
    meta={};added=[]
    for key,rig in RIGS.items():
        role,variant=key.rsplit('-',1)
        source=variant_sources[key]
        sha=hashlib.sha256((PUBLIC/paths[source]).read_bytes()).hexdigest()
        if sha!=source: raise ValueError(key)
        source_img=Image.open(PUBLIC/paths[source]).convert('RGBA')
        mask=Image.open(PUBLIC/masks[source]['path'][1:]).getchannel('A')
        identity='duanmu-yan' if key=='shan-base' else role
        prefix='employee.'+identity+('.skin.v1.' if variant=='v1' else '.')+'walk.up'
        atlas=next(a for id,a in walks.items() if id.startswith(prefix))
        donor=Image.open(PUBLIC/atlas['src'][1:]).crop((0,0,*atlas['cell']))
        sheet=Image.new('RGBA',(CELL[0]*4,CELL[1]))
        box=bbox(source_img.crop((0,0,512,860)))
        for i in range(4):
            crop=(i*512,0,i*512+512,860)
            cell,landmarks=compose(source_img.crop(crop),mask.crop(crop),donor,box,rig,role)
            sheet.paste(seated_hem(cell,key),(i*CELL[0],0))
        from io import BytesIO
        stream=BytesIO();sheet.save(stream,format='PNG',optimize=True)
        raw=stream.getvalue(); digest=hashlib.sha256(raw).hexdigest()
        path=(ART/(key+'.'+digest[:12]+'.png')).as_posix()
        for base in [PUBLIC,PLUGIN/'art/release-assets']:
            replace_verified(base/path,raw)
        meta[key]={'src':'/'+path,'sha256':digest,'cell':list(CELL),'count':4,**landmarks}
        added.append({'path':path,'sha256':digest,'bytes':len(raw)})
    # Replace only previously generated rear-desk files owned by this script.
    rows=json.loads(manifest.read_text(encoding='utf8'))
    current={r['path'] for r in added}
    old=[r for r in rows if Path(r['path']).parent==ART]
    for row in old:
        if row['path'] not in current:
            for base in [PUBLIC,PLUGIN/'art/release-assets']:
                (base/row['path']).unlink(missing_ok=True)
    replace_verified(manifest,(json.dumps([r for r in rows if r not in old]+added,ensure_ascii=False,indent=2)+'\n').encode('utf8'))
    replace_verified(OFFICE/'deskRearPoses.generated.json',(json.dumps(meta,indent=2)+'\n').encode('utf8'))


if __name__=='__main__':
    main()
