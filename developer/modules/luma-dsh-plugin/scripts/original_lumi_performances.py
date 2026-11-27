"""Register the original game's own costume pixels for the native pet.

Run after restore-public. All poses, including sleeping, use the same outfit's
front walk or front seat from the office/skin catalog. The snack is a separate prop.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from original_arms import Arms
from standing_motion import close_lids, smooth

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DEST = ROOT / "native-desktop/pet-art"
W, H, CX, SOLE = 384, 336, 192, 300
GY, GX = np.indices((H, W), dtype=np.float32)
# Landmarks in the original alpha bounds, normalized to a height of 256.
# Horizontal coordinates are relative to the bounds' centre. Each row holds
# the original eyes and wrist. The soles stay on the same coordinate as all other pets.
MARKS = {
    "lu-mi-base":         ((-12,70),(19,70),(-41,146)),
    "lu-mi-v1":           ((-13,71),(18,70),(-29,139)),

}


def image_at(record):
    path = PUBLIC / record["src"].lstrip("/")
    if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
        raise ValueError("Original catalog digest does not match " + str(path))
    source = Image.open(path).convert("RGBA")
    strip = record["strip"]
    return source.crop((0, 0, strip["frameWidth"], strip["frameHeight"]))


def crop(image):
    return image.crop(image.getchannel("A").getbbox())


def board(source, height=256, width=360, density=1):
    source = crop(source)
    scale = min(height / source.height, width / source.width)
    size = (round(source.width * scale * density), round(source.height * scale * density))
    cell = Image.new("RGBA", (W*density, H*density))
    cell.paste(source.resize(size, Image.Resampling.LANCZOS), (CX*density-size[0]//2, SOLE*density-size[1]))
    return cell


def coordinates(p):
    return (CX+p[0], SOLE-256+p[1])


def to_premult(image):
    a=np.array(image,dtype=np.float32)/255
    a[:,:,:3]*=a[:,:,3:]
    return a


def unpremult(a):
    a=a.copy()
    a[:,:,:3]/=np.maximum(a[:,:,3:],1/255)
    return Image.fromarray(np.uint8(np.clip(a*255+.5,0,255)))


def bend(a, eyes, tilt=0, nod=0, hand=None, move=(0,0)):
    """A continuous rotation from the hips up. Hair and face move together;
    localized hand motion decays before it reaches the eye line or the soles."""
    ex,ey=np.mean(eyes,axis=0)
    hip=SOLE-96
    turn=math.radians(tilt)
    local_y=hip-math.sin(turn)*(GX-ex)+math.cos(turn)*(GY-nod-hip)
    # A descending jaw still belongs to the same rigid head as the forehead.
    # Resolve the neck falloff in the original painting's coordinates.
    jaw=ey+.83*float(np.linalg.norm(eyes[1]-eyes[0]))
    influence=1-smooth(jaw,hip+20,local_y)
    angle=turn*influence
    vertical=GY-nod*influence
    px=ex+np.cos(angle)*(GX-ex)+np.sin(angle)*(vertical-hip)
    py=hip-np.sin(angle)*(GX-ex)+np.cos(angle)*(vertical-hip)
    if hand is not None:
        dx,dy=move
        influence=np.exp(-(((px-hand[0]-dx*.6)/20)**2+((py-hand[1]-dy*.6)/25)**2))
        px-=dx*influence
        py-=dy*influence
    return cv2.remap(a,px.astype(np.float32),py.astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT)


def sleeping(original, eyes, key):
    # Preserve the entire front drawing, including its real hair ornaments.
    # Head/shoulders recline as a unit, then the hips turn and the knees curl.
    # Work at 2x for use on both the bedroom mattress and the taskbar.
    density=2
    base=to_premult(board(original,density=density))
    ex,ey=np.mean(eyes,axis=0)
    rig=Arms(base,key,density)
    base=rig.pose([(ex-17,ey+22),(ex+9,ey+46)])
    base=close_lids(base,eyes*density,(0,1),1)
    t=np.arange(-80,H+80,dtype=np.float32)
    theta=(.92+.34*smooth(ey+5,224,t)+.43*smooth(174,302,t)
           +.28*smooth(212,320,t))
    sine,cosine=np.sin(theta),np.cos(theta)
    cx=np.cumsum(sine);cy=np.cumsum(cosine)
    face_row=round(ey)+80
    cx+=125-cx[face_row];cy+=165-cy[face_row]
    sleep_height=H+80
    yy,xx=np.indices((sleep_height*density,W*density),dtype=np.float32)/density
    nearest=np.zeros(xx.shape,np.int32)
    best=np.full(xx.shape,np.inf,np.float32)
    for j in range(0,len(t),4):
        delta=(xx-cx[j])**2+(yy-cy[j])**2
        take=delta<best
        best[take]=delta[take];nearest[take]=j
    s=t[nearest]
    curvature=np.gradient(theta)
    # Solve for the perpendicular continuous cross-section. Rounding its row
    # to the closest mesh band visibly saws the outer edges of long skirts.
    for _ in range(4):
        angle=np.interp(s,t,theta)
        co,si=np.cos(angle),np.sin(angle)
        off_x=xx-np.interp(s,t,cx)
        off_y=yy-np.interp(s,t,cy)
        q=off_x*co-off_y*si
        correction=(off_x*si+off_y*co)/np.maximum(.25,1-q*np.interp(s,t,curvature))
        s=np.clip(s+np.clip(correction,-3,3),t[0],t[-1])
    result=unpremult(cv2.remap(base,np.float32((ex+q)*density),np.float32(s*density),cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT))
    box=result.getchannel("A").getbbox()
    if not box or min(box[0],box[1],W*density-box[2],sleep_height*density-box[3])<4:raise ValueError(("lying bounds",key,box))
    trimmed=result.crop(box)
    def uv(x,y):
        i=round(y)+80; q=x-ex
        return [round(float(((cx[i]+q*cosine[i])*density-box[0])/trimmed.width),6),
                round(float(((cy[i]-q*sine[i])*density-box[1])/trimmed.height),6)]
    marks={"size":list(trimmed.size),"backOfHead":uv(ex-10,ey-32),
           "hips":uv(ex,SOLE-88),"feetCenter":uv(CX,SOLE-9)}
    return trimmed,marks


def biscuit(radius,bite):
    # Standalone food prop, rendered oversize to keep the contour antialiased.
    n=64; im=Image.new("RGBA",(n,n))
    pen=ImageDraw.Draw(im)
    pen.ellipse((4,7,59,58),fill="#b97842",outline="#80563d",width=3)
    pen.ellipse((5,5,59,53),fill="#e8b978",outline="#bf8953",width=2)
    for x,y in ((19,15),(38,12),(26,30),(46,31),(16,39),(36,43)):
        pen.ellipse((x,y,x+5,y+5),fill="#98653f")
    if bite:pen.ellipse((39,-5,70,19),fill=(0,0,0,0))
    return im.resize((radius*2,radius*2),Image.Resampling.LANCZOS)


def costume(key, source):
    original=image_at(source["down"])
    neutral=board(original)
    chair=board(image_at(source["seat"]))
    eye1,eye2,hand=map(coordinates,MARKS[key])
    eyes=np.asarray([eye1,eye2],dtype=np.float32)
    pixels=to_premult(neutral)
    rig=Arms(pixels,key)
    ex,ey=eyes.mean(axis=0)
    def pose(tilt=0,nod=0,lids=0,move=(0,0),targets=None):
        source=rig.pose(targets) if targets is not None else pixels
        source=close_lids(source,eyes,(0,1),lids)
        return unpremult(bend(source,eyes,tilt,nod,hand,move))
    greet=pose(-4,-1,0,(0,0),[(ex-41,ey+27),None])
    drowsy=pose(5,6,.82,(2,0))
    sleep,contacts=sleeping(original,eyes,key)
    ledge=board(sleep,height=211,width=256)
    snack=[]
    for fraction,bitten in ((0,False),(.50,False),(1,True),(.36,True)):
        palm=(ex-22+5*fraction,ey+43-20*fraction)
        im=pose(-1,2+4*fraction,.20*fraction,targets=[palm,None])
        item=np.array(palm)+[8,-6]
        radius=10
        im.alpha_composite(biscuit(radius,bitten),(round(item[0]-radius),round(item[1]-radius)))
        snack.append(im)
    def palms_for(targets,t):
        if t==0:return None
        return [None if dest is None else
                np.float32(bones[2])+(np.float32(dest)-bones[2])*t
                for bones,dest in zip(rig.rig,targets)]
    bows=[pose(tilt=6*t,nod=27*t,lids=.70*t,
               targets=palms_for([(ex-3,ey+49),(ex+60,ey+81)],t)) for t in (0,.52,1,.50)]
    pats=[pose(tilt=-7*t,nod=8*t,lids=.66*t,
               targets=palms_for([(ex-12,ey+45),None],t)) for t in (0,.47,1,.53)]
    side=crop(neutral).rotate(-50,Image.Resampling.BICUBIC,expand=True)
    elbows=pose(tilt=-2,lids=.13,targets=[(ex-18,ey+19),(ex+18,ey+20)])
    bottom=crop(elbows.crop((0,0,W,round(ey+59))))
    resting=pose(tilt=9,nod=7,lids=1,targets=[(ex-3,ey+33),(ex+11,ey+26)])
    bottom_sleep=crop(resting.crop((0,0,W,round(ey+64))))
    standard={"":crop(side),"bottom":bottom,"bottom-night":bottom_sleep,"greet":crop(greet),"drowsy":crop(drowsy),
              "lunch":crop(chair),"ledge":sleep}
    frames=[greet,drowsy,chair,ledge]+snack+bows+pats
    sheet=Image.new("RGBA",(W*4,H*4))
    for i,im in enumerate(frames):
        bounds=im.getchannel("A").getbbox()
        if not bounds or min(bounds[0],bounds[1],W-bounds[2],H-bounds[3])<2:raise ValueError((key,i,bounds))
        sheet.paste(im,(i%4*W,i//4*H))
    standard["performance"]=sheet
    for group,im in standard.items():
        dest=DEST/group/(key+".png");dest.parent.mkdir(parents=True,exist_ok=True)
        stream=io.BytesIO()
        im.save(stream,format="PNG",compress_level=8)
        data=stream.getvalue()
        if dest.exists() and dest.read_bytes()==data:continue
        stage=dest.with_suffix(".png.tmp")
        stage.write_bytes(data)
        stage.replace(dest)
    return dict(sourceSha256=source["down"]["sha256"],**contacts)


def build():
    listing=subprocess.check_output(["node", str(Path(__file__).with_name("desktop-original-sources.mjs"))],encoding="utf8")
    catalog=json.loads(listing)
    if not set(MARKS).issubset(catalog):raise ValueError("Missing original Lu Mi costume")
    placements={key:costume(key,catalog[key]) for key in MARKS}
    (ROOT/"art/original-sleep-landmarks.json").write_text(json.dumps(placements,indent=2)+"\n",encoding="utf8")
    subprocess.run([sys.executable,str(Path(__file__).with_name("prepare-bedroom-sleep.py"))],check=True)


if __name__=="__main__":
    build()
