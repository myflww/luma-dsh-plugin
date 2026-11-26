"""Register the two painted keystrokes in each rear and rear three-quarter view.

The source paintings are complete seated Q-style characters. One similarity
transform preserves the head, shoulder, hip and bent knees. No furniture or
keyboard is painted into these images.
"""
import hashlib
from io import BytesIO
import json
import math
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from PIL import Image

PLUGIN=Path(__file__).resolve().parents[1]
OFFICE=PLUGIN.parents[1]/'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
ART=Path('luma-office/luma-plugin-art/rear-desk')
SOURCE=PLUGIN/'art/desk-q-keys'
CELL=352
HIP=(176,249)
SKULL=116
EXPECTED={f'{role}-{variant}' for role in ('shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok')
          for variant in (('v1',) if role in ('gemini','grok') else ('base','v1'))}
Y,X=np.indices((CELL,CELL),dtype='float32')


def masked_bounds(alpha):
    # Ignore isolated sampling dust but retain separate head accessories.
    _,label,stats,_=cv2.connectedComponentsWithStats(np.uint8(alpha>25))
    keep=np.array([False]+[s[cv2.CC_STAT_AREA]>max(10,alpha.size*.00010) for s in stats[1:]])
    valid=keep[label]
    if not valid.any():
        raise ValueError('Empty key')
    return Image.fromarray(np.uint8(valid)*255).getbbox()


def cut_keys(file):
    sheet=Image.open(file).convert('RGBA')
    alpha=np.asarray(sheet)[:,:,3]
    ink=alpha>48
    if ink.mean()>.85:
        raise ValueError('A transparent character sheet is required: '+str(file))
    w,h=sheet.size
    def gap(count):
        size=len(count);a,b=round(size*.38),round(size*.62)
        value=count[a:b]
        # The middle of the blank band is safe for tails and hanging sleeves.
        best=np.flatnonzero(value==value.min())+a
        return int(best[np.argmin(abs(best-size/2))])
    cx,cy=gap(ink.sum(0)),gap(ink.sum(1))
    frames=[]
    for ya,yb in [(0,cy),(cy,h)]:
        for xa,xb in [(0,cx),(cx,w)]:
            tile=sheet.crop((xa,ya,xb,yb))
            frames.append(tile.crop(masked_bounds(np.asarray(tile)[:,:,3])))
    return frames


def cut_high_keys(source):
    # A neighbouring curl can cross the geometric row boundary. Assign
    # connected pieces on the full painting before extracting any cell.
    sheet=Image.open(source).convert('RGBA');alpha=np.array(sheet)[:,:,3]
    if np.mean((alpha>8)&(alpha<130))>.065:
        # Some supplied four-keys have a translucent grey matte behind
        # otherwise opaque art. Recover their true high-contrast alpha.
        alpha=np.uint8(np.clip((alpha.astype(float)-112)*255/131,0,255))
        sheet.putalpha(Image.fromarray(alpha))
    n,labels,stats,centres=cv2.connectedComponentsWithStats(np.uint8(alpha>15))
    h,w=alpha.shape
    quad=lambda x,y:int(y>=h*.5)*2+int(x>=w*.5)
    majors=[max((j for j in range(1,n) if quad(*centres[j])==i),key=lambda j:stats[j,4]) for i in range(4)]
    boxes=[stats[j,:4] for j in majors]
    def distance(c,box):
        x,y=c;bx,by,bw,bh=box
        dx=max(bx-x,0,x-bx-bw);dy=max(by-y,0,y-by-bh)
        return (dx/w)**2+(dy/h)**2
    assign=np.full(n,-1)
    for j in range(1,n):
        if stats[j,4]>6:
            assign[j]=min(range(4),key=lambda i:(distance(centres[j],boxes[i]),np.linalg.norm((centres[j]-centres[majors[i]])/[w,h])))
    keys=[]
    for i in range(4):
        mask=np.uint8(assign[labels]==i)
        # Keep subpixel alpha antialias immediately outside the contour.
        mask=cv2.dilate(mask,np.ones((3,3),np.uint8))*alpha
        im=sheet.copy();im.putalpha(Image.fromarray(mask));keys.append(im.crop(masked_bounds(mask)))
    return keys


def pm(im):
    arr=np.array(im,dtype='float32')/255
    arr[:,:,:3]*=arr[:,:,3:4]
    return arr


def rgba(arr):
    rgb=arr.copy()
    rgb[:,:,:3]/=np.maximum(rgb[:,:,3:4],.00001)
    return Image.fromarray(np.uint8(np.clip(rgb,0,1)*255+.5))


def registration(im,rig):
    # Percent coordinates refer to each pose's tight transparent silhouette.
    # The nape is measured independently of ears, horns and hair extending
    # behind the shoulders. Exactly the same scalar is used on both axes.
    w,h=im.size
    crown,nape,hipx,hipy,lx,ly,rx,ry,ankle,kx,ky,fx,fy=rig
    scale=SKULL/((nape-crown)*h/100)
    px,py=hipx*w/100,hipy*h/100
    ox=HIP[0]-px*scale;oy=HIP[1]-py*scale
    at=lambda x,y:[round(ox+x*w*scale/100,2),round(oy+y*h*scale/100,2)]
    image=cv2.warpAffine(pm(im),np.float32([[scale,0,ox],[0,scale,oy]]),(CELL,CELL),flags=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
    if image[0,:,3].max()>.4 or image[-1,:,3].max()>.4 or image[:,0,3].max()>.4 or image[:,-1,3].max()>.4:
        raise ValueError('Registration clipped the silhouette: '+str(rig))
    return image,{'hip':list(HIP),'head':at(hipx,(crown+nape)/2),'palms':[at(lx,ly),at(rx,ry)],
                  'ankleLine':round(at(hipx,ankle)[1]),'headHeight':SKULL,
                  'knee':at(kx,ky),'sole':at(fx,fy),'soleY':at(fx,fy)[1]}


# Centre of the visible near elbow and the width of its cuff in registered
# artwork. Coordinates are independent of horns, long hair and costume hems.
ELBOW = {
    "bai-shuangming-base": [(202,209,12),(205,204,13)], "bai-shuangming-v1": [(204,208,9),(211,191,9)],
    "claude-base": [(210,185,13),(222,189,12)], "claude-v1": [(212,190,10),(220,196,12)],
    "gemini-v1": [(204,191,9),(226,190,9)], "grok-v1": [(210,197,11),(226,187,10)],
    "jingyuniang-base": [(211,208,13),(226,198,14)], "jingyuniang-v1": [(219,184,14),(225,184,15)],
    "longmama-base": [(222,211,11),(222,198,11)], "longmama-v1": [(219,193,12),(220,192,11)],
    "lu-mi-base": [(204,191,9),(232,199,8)], "lu-mi-v1": [(219,204,12),(222,194,12)],
    "shan-base": [(211,196,12),(216,191,12)], "shan-v1": [(216,205,12),(216,198,12)],
}


def set_arm(pose,joint):
    ex,ey,r=joint
    near=max(pose['palms'], key=lambda p:p[0])
    pose['nearElbow']=[round(ex,2),round(ey,2)]
    pose['cuffRadius']=r
    fx,fy=near
    # Taper the near sleeve towards the wrist. Only this sector can pass
    # above the chair arm; the torso, far arm and hair retain their depth.
    dx,dy=fx-ex,fy-ey
    length=max(1,math.hypot(dx,dy));nx,ny=-dy/length,dx/length
    tip=[fx+dx/length*6,fy+dy/length*6]
    points=[(ex-dx/length*4+nx*r,ey-dy/length*4+ny*r),
            (fx+nx*6,fy+ny*6),tip,(fx-nx*6,fy-ny*6),
            (ex-dx/length*4-nx*r,ey-dy/length*4-ny*r)]
    pose['forearm']='M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in points)+'Z'


def keystrokes(first,second,pose):
    # Paint in the alternate hand/forearm from its independently drawn key.
    # Bidirectional flow follows the fingers between the drawings. The pelvis
    # and head retain their registered rest textures throughout the loop.
    gray=lambda x:np.uint8(cv2.cvtColor(x[:,:,:3],cv2.COLOR_RGB2GRAY)*255)
    ga,gb=gray(first),gray(second)
    def flow(a,b):
        return cv2.calcOpticalFlowFarneback(a,b,None,.5,4,17,4,7,1.3,0)
    ab,ba=flow(ga,gb),flow(gb,ga)
    arms=[]
    for fx,fy in pose['palms']:
        # The upper arm holds its shoulder. The feather includes both cuffs.
        arms.append(np.exp(-(((X-fx)/28)**2+((Y-fy-4)/20)**2)**1.7))
    heel=pose['ankleLine']
    for index in range(8):
        beat=index/8*2*math.pi
        phase=(1-math.cos(beat))/2
        # Each hand has a different contact/release exposure. Where both
        # sleeves overlap in projection, use the nearer hand's weight.
        strokes=[.5-.5*math.cos(beat),.5-.5*math.cos(beat+math.pi*.94)]
        p=arms[1]*strokes[1]+arms[0]*(1-arms[1])*strokes[0]
        a=cv2.remap(first,X-ab[:,:,0]*p,Y-ab[:,:,1]*p,cv2.INTER_LINEAR)
        b=cv2.remap(second,X-ba[:,:,0]*(1-p),Y-ba[:,:,1]*(1-p),cv2.INTER_LINEAR)
        image=a*(1-p[:,:,None])+b*p[:,:,None]
        sx=X.copy();sy=Y.copy()
        for n,(fx,fy) in enumerate(pose['palms']):
            finger=np.exp(-((X-fx)/8)**2-((Y-fy)/7)**2)
            wrist=np.exp(-((X-fx)/18)**2-((Y-fy-5)/13)**2)
            press=math.sin(beat+n*2.8)
            # A press bottoms out once; the resting wrist floats above the
            # row between strikes without pulling the shoulder or torso.
            lift=(1-math.cos(beat+n*math.pi))/2
            sy+=lift*(finger*6.4+wrist*2.3)-finger*1.1*press
            sx+=wrist*1.25*math.sin(beat+n*math.pi-.38)
        fringe=np.exp(-((Y-202)/35)**2)*np.clip((abs(X-HIP[0])-35)/27,0,1)
        sx-=fringe*1.15*math.sin(beat-.72)
        # A relaxed foot can roll about the ankle without stretching the shin.
        below=np.clip((Y-heel)/14,0,1)
        near=np.clip((X-HIP[0]+8)/28,0,1)
        sx+=below*near*(Y-heel)*.045*phase
        sy+=below*near*.94*phase
        yield rgba(cv2.remap(image,sx,sy,cv2.INTER_LINEAR))


def save_atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.read_bytes()==data:
        return
    with NamedTemporaryFile(dir=path.parent,delete=False) as f:
        scratch=Path(f.name)
        f.write(data)
    try:
        if path.exists():
            path.chmod(0o666)
        os.replace(scratch,path)
    finally:
        scratch.unlink(missing_ok=True)


def build(source,rigs):
    raw=cut_keys(source)
    sheet=Image.new('RGBA',(CELL*8,CELL*2))
    views=[]
    for i in range(2):
        a,landmarks=registration(raw[2*i],rigs[i][0])
        b,_=registration(raw[2*i+1],rigs[i][-1])
        set_arm(landmarks,ELBOW[source.stem][i])
        for frame,image in enumerate(keystrokes(a,b,landmarks)):
            sheet.paste(image,(frame*CELL,i*CELL))
        views.append(landmarks)
    out=BytesIO();sheet.save(out,format='WEBP',lossless=True,method=5)
    data=out.getvalue();digest=hashlib.sha256(data).hexdigest()
    path=(ART/(source.stem+'.'+digest[:12]+'.webp')).as_posix()
    # In these two rear paintings the wrists land over the long back hair.
    # The three-quarter keys clearly show the forearms reaching past the body.
    use_oblique=source.stem in ('lu-mi-base','jingyuniang-base')
    return path,data,{'src':'/'+path,'sha256':digest,'cell':[CELL,CELL],'count':8,
                      'preferOblique':use_oblique,'rear':views[0],'oblique':views[1]}


def stabilize_ink(reference,key):
    "Register the unchanging hair and coat before transferring a painted cuff."
    def edges(im):
        return np.uint8(np.clip(cv2.cvtColor(im[:,:,:3],cv2.COLOR_RGB2GRAY),0,1)*255)
    fixed,live=edges(reference),edges(key)
    sift=cv2.SIFT_create(nfeatures=480,contrastThreshold=.018)
    cap=np.zeros((CELL,CELL),dtype=np.uint8);cap[15:196,22:260]=255
    a,da=sift.detectAndCompute(fixed,cap);b,db=sift.detectAndCompute(live,cap)
    if da is None or db is None:return key
    pairs=cv2.BFMatcher().knnMatch(db,da,k=2)
    good=[m for item in pairs if len(item)==2 for m,n in [item] if m.distance<.73*n.distance]
    if len(good)<8:return key
    src=np.float32([b[m.queryIdx].pt for m in good]);dst=np.float32([a[m.trainIdx].pt for m in good])
    matrix,mask=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=2)
    if matrix is None or mask.sum()<7:return key
    if abs(matrix[0,1])>.06 or not .86<matrix[0,0]<1.15 or abs(matrix[:,2]).max()>42:return key
    return cv2.warpAffine(key,matrix,(CELL,CELL),flags=cv2.INTER_LINEAR)


def high_atlas(source,record):
    # All four drawings share the same camera and pose but have different
    # hands. Register to hip and skull before interpolating. Do not blend
    # independently drawn faces, skirt hems or supporting thighs.
    keys=cut_high_keys(source)
    rig=record['rig']
    painted=[]
    for idx,key in enumerate(keys):
        measured=record.get('overrides',{}).get(str(idx),rig)
        art,view=registration(key,measured)
        painted.append(stabilize_ink(painted[0],art) if painted else art)
    _,view=registration(keys[0],rig)
    w,h=keys[0].size
    sc=SKULL/((rig[1]-rig[0])*h/100)
    ex,ey,radius=record['elbow']
    set_arm(view,(HIP[0]+(ex-rig[2])*w*sc/100,HIP[1]+(ey-rig[3])*h*sc/100,radius))
    sheet=Image.new('RGBA',(CELL*8,CELL))
    # Painted poses A/C have opposite raised hands. B/D carry natural
    # recovery positions. Keep the head and the supported pelvis registered.
    skin=painted[0]
    def local_weight(point,rx,ry):
        x,y=point
        return np.exp(-(((X-x)/rx)**2+((Y-y)/ry)**2)**2)
    wrist=np.maximum.reduce([local_weight(f,28,17) for f in view['palms']])
    elbow=local_weight(view['nearElbow'],21,13)
    weight=np.maximum(wrist,.80*elbow)[:,:,None]
    for idx in range(8):
        base=idx//2
        a,b=painted[base],painted[(base+1)%4]
        if idx%2:
            # Interpolate the painter's fingers along their flow. The rest
            # pose stays crisp and front/back overlap does not crossfade.
            gray=lambda im:np.uint8(np.clip(cv2.cvtColor(im[:,:,:3],cv2.COLOR_RGB2GRAY),0,1)*255)
            flow=cv2.calcOpticalFlowFarneback(gray(a),gray(b),None,.5,3,15,3,5,1.1,0)
            hand=cv2.remap(a,X-flow[:,:,0]*.5,Y-flow[:,:,1]*.5,cv2.INTER_LINEAR)
        else:
            hand=a
        image=skin*(1-weight)+hand*weight
        # Fractional independent finger clearance is also visible on outfits
        # whose four painted keys differ only at the end of the fingertips.
        sy=Y.copy()
        for n,tip in enumerate(view['palms']):
            lift=.5-.5*math.cos(idx*math.pi/4+n*math.pi)
            sy+=lift*(local_weight(tip,10,8)*5.4+local_weight(tip,20,11)*1.7)
        sheet.paste(rgba(cv2.remap(image,X,sy,cv2.INTER_LINEAR)),(idx*CELL,0))
    out=BytesIO();sheet.save(out,format='WEBP',lossless=True,method=5)
    data=out.getvalue();digest=hashlib.sha256(data).hexdigest()
    path=(ART/(source.stem+'-high.'+digest[:12]+'.webp')).as_posix()
    return path,data,dict(view,src='/'+path,sha256=digest)

def chair_pairs():
    raw=json.loads((SOURCE/'joint/registration.json').read_text(encoding='utf8'))
    pairs={}
    for name,record in raw.items():
        family,key=name.split('-',1)
        room={'rose':'bedroom.shop.rose-sketchbook.v1','alpine':'bedroom.shop.alpine-library.v1'}[family]
        pairs[name]=(room,key,record['rig'],record['feet'])
    return pairs


def joint_atlas(name,reg):
    room,key,rig,castors=reg
    file=SOURCE/'joint'/(name+'.png')
    raw=cut_high_keys(file) if name=='rose-longmama-v1' else cut_keys(file)
    base=raw[0]
    cw,ch=448,552;hx,hy=210,255;w,h=base.size
    scale=SKULL/((rig[1]-rig[0])*h/100)
    def point(x,y):return [round(hx+(x-rig[2])*w*scale/100,2),round(hy+(y-rig[3])*h*scale/100,2)]
    def draw(im):
        # Use fixed chair furniture registration. Feet, cushion, hips and
        # backrest are one painted object, drawn in their real depth order.
        wi,hi=im.size;sc=scale*h/hi
        m=np.float32([[sc,0,hx-rig[2]*wi*sc/100],[0,sc,hy-rig[3]*hi*sc/100]])
        return cv2.warpAffine(pm(im),m,(cw,ch),flags=cv2.INTER_AREA)
    mask=Image.open(SOURCE/'joint/masks'/(name+'.png')).convert('L')
    if mask.size!=base.size:raise ValueError('Joint silhouette dimensions differ: '+name)
    masked=[]
    for im in raw:
        # Hands above the original upholstery have air behind them in every
        # drawing. Preserve their alpha as they lift outside the neutral key.
        a=np.array(im.getchannel('A'));mat=np.array(mask.resize(im.size))
        iy,ix=np.indices(a.shape);wi,hi=im.size
        for px,py in (rig[4:6],rig[6:8]):
            tips=(((ix-px*wi/100)/(wi*.085))**2+((iy-py*hi/100)/(hi*.038))**2)<1
            mat[tips]=a[tips]
        body=im.copy();body.putalpha(Image.fromarray(np.minimum(a,mat)));masked.append(body)
    frames=[draw(im) for im in masked];base=frames[0]
    yy,xx=np.indices((ch,cw),dtype='float32')
    palms=[point(*rig[4:6]),point(*rig[6:8])]
    weight=np.maximum.reduce([np.exp(-(((xx-x)/36)**2+((yy-y)/22)**2)**2) for x,y in palms])[:,:,None]
    desk=PLUGIN/'art/bedroom-poses'
    geometry=json.loads((PLUGIN/'src/client/bedroom-chair-plates.generated.json').read_text())[room]
    cell=geometry['cell'];px=(cell%5)*440+220;py=(cell//5)*260
    box=(px,py,px+geometry['w'],py+geometry['h'])
    day,night=[np.asarray(Image.open(desk/('desk-chairs-'+phase+'.webp')).crop(box)).astype(float) for phase in ['day','night']]
    opaque=(day[:,:,3]>190)&(night[:,:,3]>190)
    # Transfer the room's actual lamp response to the co-painted furniture
    # and clothing. Transparent floor and cast shadows are rendered separately.
    tint=np.median((night[:,:,:3][opaque]+8)/(day[:,:,:3][opaque]+8),axis=0).clip(.45,1.14)
    reg={'room':room,'cell':[cw,ch],'count':8,'hip':[hx,hy],'head':point(rig[2],(rig[0]+rig[1])/2),
         'headHeight':SKULL,'palms':palms,'knee':point(rig[9],rig[10]),'sole':point(rig[11],rig[12]),
         'ankleLine':round(point(rig[2],rig[8])[1]),'soleY':point(rig[11],rig[12])[1],
         'castors':[point(x,y) for x,y in castors]}
    # One stationary furniture/body plate and eight small wrist cells. The
    # standing light and room lamps use the same pixels and contact geometry.
    zone=np.nonzero(weight[:,:,0]>.001)
    left=max(0,int(zone[1].min())-2);top=max(0,int(zone[0].min())-2)
    right=min(cw,int(zone[1].max())+3);bottom=min(ch,int(zone[0].max())+3)
    box=(left,top,right,bottom);ww,hh=right-left,bottom-top
    sheet=Image.new('RGBA',(max(cw,(ww+8)*8),ch+hh+8))
    body=rgba(base)
    # Keep a four-pixel underlap along the patch. A transparent abutting
    # pair leaves a pale rectangular seam when the browser minifies it.
    body.paste((0,0,0,0),(left+4,top+4,right-4,bottom-4))
    sheet.paste(body,(0,0))
    switched=np.clip((weight-.013)/.045,0,1)
    for i in range(8):
        a=frames[i//2];b=frames[(i//2+1)%4]
        phase=0 if i%2==0 else .5
        if phase:
            gray=lambda im:np.uint8(np.clip(cv2.cvtColor(im[:,:,:3],cv2.COLOR_RGB2GRAY),0,1)*255)
            flow=cv2.calcOpticalFlowFarneback(gray(a),gray(b),None,.5,4,17,4,7,1.25,0)
            reach=cv2.remap(a,xx-flow[:,:,0]*phase,yy-flow[:,:,1]*phase,cv2.INTER_LINEAR)
        else:reach=a
        actual=base*(1-switched)+reach*switched
        mx=xx.copy();my=yy.copy()
        for n,(x,y) in enumerate(palms):
            lift=.5-.5*math.cos(i*math.pi/4+n*math.pi)
            my+=lift*3.6*np.exp(-((xx-x)/11)**2-((yy-y)/8)**2)
        actual=cv2.remap(actual,mx,my,cv2.INTER_LINEAR)
        sheet.paste(rgba(actual).crop(box),(i*(ww+8)+4,ch+4))
    set_arm(reg,(palms[1][0]-30,palms[1][1]+9,10))
    reg['rail']=point(65,43.5) if name.startswith('rose-') else point(67,50)
    reg['hands']=[left,top,ww,hh]
    reg['imageSize']=list(sheet.size)
    reg['nightTint']=[round(v,4) for v in tint]
    buf=BytesIO();sheet.save(buf,format='WEBP',lossless=True,method=5)
    payload=buf.getvalue();digest=hashlib.sha256(payload).hexdigest()
    path=(ART/(name+'-joint.'+digest[:12]+'.webp')).as_posix()
    reg['src']='/'+path
    data=[(path,payload,digest)]
    return key,reg,data


def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview',type=Path,help='Build available paintings into an isolated preview directory.')
    parser.add_argument('--joints-only',action='store_true',help='Retain the current three body views and rebuild room-specific joint masks and hand cells.')
    args=parser.parse_args()
    rigs=json.loads((SOURCE/'registration.json').read_text(encoding='utf8'))
    hpath=SOURCE/'high-oblique/registration.json'
    high=json.loads(hpath.read_text(encoding='utf8')) if hpath.exists() else {}
    keys={f.stem for f in SOURCE.glob('*.png')}
    if args.preview:
        keys&=rigs.keys()
    elif keys!=EXPECTED or set(rigs)!=EXPECTED:
        raise ValueError('Missing or unexpected source paintings or registrations: '+str((keys^EXPECTED,set(rigs)^EXPECTED)))
    meta={};new=[];payloads={}
    if args.joints_only:
        target=args.preview/'deskRearPoses.generated.json' if args.preview else OFFICE/'deskRearPoses.generated.json'
        meta=json.loads(target.read_text(encoding='utf8'))
        if set(meta)!=EXPECTED or not all('highOblique' in record for record in meta.values()):
            raise ValueError('Build and register the three body views before updating joint drawings.')
        for record in meta.values():record.pop('joints',None)
    for key in ([] if args.joints_only else sorted(keys)):
        path,data,meta[key]=build(SOURCE/(key+'.png'),rigs[key])
        new.append({'path':path,'bytes':len(data),'sha256':meta[key]['sha256']})
        payloads[path]=data
        if key in high:
            hp,hd,hv=high_atlas(SOURCE/'high-oblique'/(key+'.png'),high[key])
            meta[key]['highOblique']=hv
            new.append({'path':hp,'bytes':len(hd),'sha256':hv['sha256']});payloads[hp]=hd
    if not args.preview and set(high)!=EXPECTED:
        raise ValueError('Missing high-oblique registrations: '+str(EXPECTED-set(high)))
    pairs=chair_pairs()
    if not args.preview and set(pairs)!={r+'-'+k for r in ('alpine','rose') for k in EXPECTED}:
        raise ValueError('Both upholstered chairs must have a registered joint drawing for every outfit.')
    for name,spec in pairs.items():
        if not (SOURCE/'joint'/(name+'.png')).exists() and args.preview:continue
        key,record,files=joint_atlas(name,spec)
        if key not in meta:continue
        meta[key].setdefault('joints',{})[record['room']]=record
        for path,data,digest in files:
            new.append({'path':path,'bytes':len(data),'sha256':digest});payloads[path]=data
    for path,data in payloads.items():
        for base in ([args.preview] if args.preview else [PLUGIN/'art/release-assets',PLUGIN/'public']):
            save_atomic(base/path,data)
    dump=lambda v:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8')
    if args.preview:
        save_atomic(args.preview/'deskRearPoses.generated.json',dump(meta));return
    manifest=PLUGIN/'lib/asset-manifest.json'
    rows=json.loads(manifest.read_text(encoding='utf8'))
    prev=[r for r in rows if Path(r['path']).parent==ART]
    if args.joints_only:
        new=[r for r in prev if '-joint.' not in r['path']]+new
    save_atomic(OFFICE/'deskRearPoses.generated.json',dump(meta))
    save_atomic(manifest,dump([r for r in rows if r not in prev]+new))
    keep={r['path'] for r in new}
    for base in [PLUGIN/'art/release-assets',PLUGIN/'public']:
        for file in (base/ART).iterdir():
            bits=file.name.split('.')
            if len(bits)==3 and (bits[0].removesuffix("-high") in EXPECTED or bits[0].removesuffix("-joint") in pairs) and len(bits[1])==12 and (ART/file.name).as_posix() not in keep:
                file.chmod(0o666)
                file.unlink()



if __name__=='__main__':
    main()
