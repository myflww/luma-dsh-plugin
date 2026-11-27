"""Fit the native costume drawings to the current room rigs and add registered typing beats.

Run from developer with node modules/luma-dsh-plugin/scripts/prepare-original-seating.mjs.
"""
import hashlib
import io
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

PLUGIN=Path("modules/luma-dsh-plugin")
OFFICE=Path("overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d")
ART=Path("luma-office/luma-plugin-art/room-seated")
SIZE=352
FIGURE=266
SOLE=319
Y,X=np.mgrid[:SIZE,:SIZE].astype("float32")


def registered(source):
    record=Path(source["src"].lstrip("/"))
    data=(PLUGIN/"public"/record).read_bytes()
    if hashlib.sha256(data).hexdigest()!=source["sha"]:
        raise ValueError("Unexpected source pixels: "+str(record))
    picture=Image.open(io.BytesIO(data)).convert("RGBA")
    matte=source.get("matte")
    if matte:
        mask_image=Image.open(PLUGIN/"public"/matte["path"].lstrip("/")).convert("RGBA")
        mask=np.asarray(mask_image)[:,:,3].astype("float32")/255
        alpha=np.asarray(picture.getchannel("A"))
        picture.putalpha(Image.fromarray(np.rint(alpha*mask).astype("uint8")))
    raw=source["strip"]
    w,h=raw["frameWidth"],raw["frameHeight"]
    cells=[]
    bounds=[]
    for i,(dx,dy) in enumerate(source["offsets"]):
        columns=picture.width//w
        x,y=i%columns*w,i//columns*h
        raw_cell=picture.crop((x,y,x+w,y+h))
        frame=Image.new("RGBA",(w,h))
        frame.paste(raw_cell,(dx,dy))
        if source["reflected"]:
            frame=ImageOps.mirror(frame)
        cells.append(frame)
        bounds.append(frame.getbbox())
    hip,head,foot,hand=[source[name] for name in ("hip","head","foot","hand")]
    def facing(point):
        return [w-point[0],point[1]] if source["reflected"] else point
    hip,head,foot,hand=map(facing,(hip,head,foot,hand))
    lo=min(b[0] for b in bounds); hi=max(b[2] for b in bounds)
    top=min(b[1] for b in bounds);bottom=max(b[3] for b in bounds)
    scale=min(FIGURE/source["height"],(SIZE-12)/(hi-lo),(SIZE-12)/(bottom-top))
    ox=SIZE/2-(lo+hi)*.5*scale
    oy=max(4-top*scale,min(SOLE-source["sole"]*scale,SIZE-4-bottom*scale))
    def point(p):return [round(ox+p[0]*scale,3),round(oy+p[1]*scale,3)]
    transform=[[1/scale,0,-ox/scale],[0,1/scale,-oy/scale]]
    frames=[f.transform((SIZE,SIZE),Image.Transform.AFFINE,sum(transform,[]),Image.Resampling.BICUBIC) for f in cells]
    return frames,{k:point(p) for k,p in zip(("hip","head","foot","hand"),(hip,head,foot,hand))},round(scale*source["height"],3)


def project(view,frames,points,height):
    hip=points["hip"]
    # The near torso leans towards a slightly offset monitor; the seated hip
    # remains the pivot. Keep native profiles for desks that turn farther.
    slant={"shallowRight":.073,"shallowLeft":-.073}.get(view,0)
    depth=.95 if view.startswith("quarter") else 1.
    def project_point(p):
        return [round(hip[0]+(p[0]-hip[0])*depth+slant*(hip[1]-p[1]),3),p[1]]
    if slant or depth!=1:
        ax=slant/depth
        affine=(1/depth,ax,hip[0]*(1-1/depth)-ax*hip[1],0,1,0)
        frames=[f.transform((SIZE,SIZE),Image.Transform.AFFINE,affine,Image.Resampling.BICUBIC) for f in frames]
    points={k:project_point(p) for k,p in points.items()}
    hand=points["hand"]
    reference=np.array(frames[0].convert("RGBa"))
    # Keep the crown, hairline, torso and shoes registered while retaining
    # the original complete forearms in their changing painted poses.
    spread=max(15,height*.20)
    dx=np.abs(X-hand[0]);dy=np.abs(Y-hand[1])
    if view=="front" or view.startswith("rear") or view.startswith("shallow"):
        dx=np.minimum(dx,np.abs(X-(2*points["hip"][0]-hand[0])))
    arm=np.clip(1-np.maximum((dx-spread*.5)/(spread*.7),(dy-spread*.45)/(spread*.6)),0,1)
    mod=(arm*arm*(3-2*arm))[:,:,None]
    keys=[np.rint(reference*(1-mod)+np.array(f.convert("RGBa"))*mod).astype("uint8") for f in frames]
    # The downstroke favours the nearer exposure, then switches to the next
    # drawing on its registered hand. Alpha is blended in premultiplied space.
    result=[]
    for i,first in enumerate(keys):
        following=keys[(i+1)%len(keys)]
        result.append(Image.fromarray(first,"RGBa").convert("RGBA"))
        middle=np.rint(first.astype("float32")*.5+following*.5).astype("uint8")
        result.append(Image.fromarray(middle,"RGBa").convert("RGBA"))
    return result,points


def save_variant(source,name,registered_frames,points,height,rows):
    frames,anatomy=project(name,registered_frames,points,height)
    atlas=Image.new("RGBA",(len(frames)*SIZE,SIZE))
    for i,frame in enumerate(frames):atlas.paste(frame,(i*SIZE,0))
    data=io.BytesIO();atlas.save(data,format="WEBP",lossless=True,method=3)
    binary=data.getvalue()
    sha=hashlib.sha256(binary).hexdigest()
    url=(ART/(source["key"]+"-"+name+"."+sha[:12]+".webp")).as_posix()
    for folder in [PLUGIN/"public",PLUGIN/"art/release-assets"]:
        path=folder/url;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(binary)
    rows.append({"path":url,"sha256":sha,"bytes":len(binary)})
    crown_y=round(anatomy["head"][1])
    alpha=np.asarray(frames[0])[:,:,3]
    crown_rows=[np.flatnonzero(row>=96) for row in alpha[crown_y-6:crown_y+7]]
    crown_width=float(np.median([xs[-1]-xs[0]+1 for xs in crown_rows if xs.size]))
    return {"src":"/"+url,"sha256":sha,"sourceSrc":source["src"],"sourceSha256":source["sha"],
            "cell":[SIZE,SIZE],"count":len(frames),"figureHeight":height,"crownWidth":crown_width,**anatomy}


def main():
    data={}
    rows=[]
    for source in json.load(sys.stdin):
        frames,points,height=registered(source)
        views={"back":["rear","shallowRight","shallowLeft"],"backRight":["sideRight","quarterRight"],
               "backLeft":["sideLeft","quarterLeft"],"front":["front"]}[source["view"]]
        for view in views:
            data.setdefault(source["key"],{})[view]=save_variant(source,view,frames,points,height,rows)
        print(source["key"],source["view"],flush=True)
    file=PLUGIN/"lib/asset-manifest.json"
    old=json.loads(file.read_text(encoding="utf8"))
    prefix=ART.as_posix()+"/"
    prior=[row for row in old if row["path"].startswith(prefix)]
    keep={row["path"] for row in rows}
    for row in prior:
        if row["path"] in keep:continue
        for folder in [PLUGIN/"public",PLUGIN/"art/release-assets"]:
            target=folder/row["path"]
            if target.parent==folder/ART:target.unlink(missing_ok=True)
    file.write_text(json.dumps([row for row in old if not row["path"].startswith(prefix)]+rows,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    (OFFICE/"roomSeated.generated.json").write_text(json.dumps(data,indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
