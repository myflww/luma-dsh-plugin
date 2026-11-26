"""Register the four separately painted strokes of the occupied front-desk chair.

The four whole figures use their original pixels. Registration is a similarity
transform centred on the face; hats, locks and palms can be asymmetric.
"""
import argparse
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

spec=importlib.util.spec_from_file_location('desk_source',Path(__file__).with_name('prepare-desk-rear.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
SOURCE=base.SOURCE/'reception'
ART=Path('luma-office/luma-plugin-art/office-reception')
CELL=480
HEAD=116
HIP=(240,308)


def register(key,rig):
    crowns,chin,face_x,hip_y,hand_x,hand_y=rig
    cells=base.cut_keys(SOURCE/(key+'.png'))
    heights=[cell.height for cell in cells]
    refh=heights[0]
    scale=HEAD/(refh*(chin-crowns)/100)
    def scaled(im):
        # A single uniform scale per drawing keeps shoes, cheeks and chair rigid.
        factor=refh/im.height*scale
        return im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS)
    images=[scaled(im) for im in cells]
    ref=images[0]
    anchor=(ref.width*face_x/100,ref.height*hip_y/100)
    face=(anchor[0],ref.height*(crowns+chin)/200)
    # The inner facial features register all four paintings to the first. Search
    # only near the expected face, so gold buttons and ribbons cannot become anchors.
    def gray(im):
        composite=Image.new('RGBA',im.size,'#b1afb0')
        composite.alpha_composite(im)
        return np.array(composite.convert('L'))
    ref_gray=gray(ref);x0=round(face[0]-HEAD*.28);y0=round(face[1]-HEAD*.20)
    stamp=ref_gray[y0:y0+round(HEAD*.39),x0:x0+round(HEAD*.56)]
    atlas=Image.new('RGBA',(CELL*4,CELL))
    for i,img in enumerate(images):
        dx=round(HIP[0]-anchor[0]);dy=round(HIP[1]-anchor[1])
        if i:
            u=round(img.width*face_x/100-HEAD*.28);v=round(img.height*(crowns+chin)/200-HEAD*.20)
            l=max(0,u-16);t=max(0,v-16);r=min(img.width,u+stamp.shape[1]+16);b=min(img.height,v+stamp.shape[0]+16)
            score=cv2.matchTemplate(gray(img)[t:b,l:r],stamp,cv2.TM_CCOEFF_NORMED)
            _,quality,_,point=cv2.minMaxLoc(score)
            if quality<.44:raise ValueError(f'{key} frame {i} face registration {quality:.2f}')
            dx+=x0-(l+point[0]);dy+=y0-(t+point[1])
        cell=Image.new('RGBA',(CELL,CELL));cell.alpha_composite(img,(dx,dy))
        if cell.getchannel('A').point(lambda a:255 if a>50 else 0).getbbox() is None:
            raise ValueError('Empty image '+key)
        layer=np.array(cell)[:,:,3]
        if np.max(np.concatenate([layer[0],layer[-1],layer[:,0],layer[:,-1]]))>55:
            raise ValueError('Clipped chair '+key)
        atlas.paste(cell,(i*CELL,0))
    out=BytesIO();atlas.save(out,format='WEBP',lossless=True,method=5)
    data=out.getvalue();digest=hashlib.sha256(data).hexdigest()
    point=lambda x,y:[round(HIP[0]-anchor[0]+ref.width*x/100,2),round(HIP[1]-anchor[1]+ref.height*y/100,2)]
    path=(ART/(key+'.'+digest[:12]+'.webp')).as_posix()
    return path,data,{'src':'/'+path,'sha256':digest,'cell':[CELL,CELL],'count':4,'hip':list(HIP),
                      'headHeight':HEAD,'palms':point(hand_x,hand_y)}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--preview',type=Path);args=parser.parse_args()
    rigs=json.loads((SOURCE/'registration.json').read_text('utf8'))
    keys={f.stem for f in SOURCE.glob('*.png')}
    if not args.preview and (keys!=base.EXPECTED or rigs.keys()!=base.EXPECTED):
        raise ValueError('Complete front desk set required')
    meta={};rows=[]
    for key in sorted(keys & rigs.keys()):
        path,data,meta[key]=register(key,rigs[key])
        for root in ([args.preview] if args.preview else [base.PLUGIN/'public',base.PLUGIN/'art/release-assets']):
            base.save_atomic(root/path,data)
        rows.append({'path':path,'bytes':len(data),'sha256':meta[key]['sha256']})
    encode=lambda v:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8')
    if args.preview:
        base.save_atomic(args.preview/'officeReceptionPoses.generated.json',encode(meta));return
    base.save_atomic(base.OFFICE/'officeReceptionPoses.generated.json',encode(meta))
    manifest=base.PLUGIN/'lib/asset-manifest.json'
    prev=json.loads(manifest.read_text('utf8'))
    base.save_atomic(manifest,encode([p for p in prev if Path(p['path']).parent!=ART]+rows))
    current={r['path'] for r in rows}
    for row in prev:
        file=Path(row['path'])
        if file.parent==ART and row['path'] not in current:
            for root in [base.PLUGIN/'public',base.PLUGIN/'art/release-assets']:
                old=root/file
                if old.exists():old.chmod(0o666);old.unlink()


if __name__=='__main__':main()
