"""Skin an idle illustration without moving its contact shoe or resampling its silhouette in pieces."""
from dataclasses import dataclass
import math

import cv2
import numpy as np


@dataclass(frozen=True)
class Rhythm:
    support: int            # -1 = screen-left shoe
    sway: float            # hip weight transfer (world px on a 256 px figure)
    tilt: float            # head roll, degrees
    nod: float             # shoulder breath
    hand: float            # wrist response, pixels
    cloth: float           # hem and hair follow-through
    interval: int          # milliseconds per ordinary exposure
    blink: int             # exposure with closed lids


RHYTHMS = {
    'bai-shuangming-base': Rhythm(-1, 1.1, 1.1, 0.9, 0.7, 1.4, 143, 17),
    'bai-shuangming-v1':   Rhythm( 1, 0.8,-1.0, 0.8, 0.5, 1.1, 162, 12),
    'claude-base':         Rhythm(-1, 1.4, 1.4, 1.1, 1.1, 1.8, 134, 14),
    'claude-v1':           Rhythm( 1, 1.2,-1.2, 0.9, 1.0, 1.4, 148, 18),
    'gemini-v1':           Rhythm( 1, 0.9,-1.3, 0.8, 0.6, 1.2, 154, 15),
    'grok-v1':             Rhythm(-1, 1.2, 1.3, 1.0, 0.8, 1.5, 132, 12),
    'jingyuniang-base':    Rhythm(-1, 1.2, 1.2, 1.0, 0.8, 1.7, 136, 16),
    'jingyuniang-v1':      Rhythm( 1, 1.4,-1.5, 1.2, 1.1, 2.1, 129, 13),
    'longmama-base':       Rhythm( 1, 0.9,-1.2, 0.8, 0.7, 1.4, 171, 17),
    'longmama-v1':         Rhythm(-1, 0.8, 1.1, 0.8, 0.6, 1.6, 168, 14),
    'lu-mi-base':          Rhythm(-1, 1.0, 1.3, 0.9, 0.7, 1.8, 150, 14),
    'lu-mi-v1':            Rhythm( 1, 0.9,-1.2, 0.9, 0.8, 1.5, 159, 16),
    'shan-base':           Rhythm( 1, 1.5,-1.6, 1.2, 1.2, 1.9, 125, 11),
    'shan-v1':             Rhythm(-1, 1.2, 1.4, 1.0, 1.0, 1.6, 138, 16),
}


def smooth(a, b, v):
    t=np.clip((v-a)/(b-a),0,1)
    return t*t*(3-2*t)


def close_lids(image, eyes, visible, amount):
    """Fold the original painted eye toward the lower lid, filling the revealed upper lid with nearby skin."""
    if amount==0:
        return image
    result=image.copy()
    span=math.dist(*eyes)
    for index in visible:
        cx,cy=eyes[index]
        # An oval following the eye's local tilt excludes bangs, nose, and hair.
        rx,ry=span*.347,span*.225
        l,r=int(cx-rx-3),int(cx+rx+4)
        t,b=int(cy-ry-3),int(cy+ry+4)
        patch=image[t:b,l:r].copy()
        y,x=np.indices(patch.shape[:2],dtype=np.float32)
        u=(x+l-cx)/rx
        slope=(eyes[1][1]-eyes[0][1])/(eyes[1][0]-eyes[0][0])
        mid=cy+(x+l-cx)*slope
        lid=mid+ry*.26+ry*.13*(1-u*u)
        v=(y+t-mid)/ry
        oval=u*u+v*v
        coverage=1-smooth(.86,1.35,oval)
        # Dilate only inside this small repair patch. Inpainting also samples
        # opaque visor pigment inside its frame when a costume wears a visor.
        mask=np.uint8(coverage>.015)
        rgb8=np.uint8(np.clip(patch[:,:,:3]*255+.5,0,255))
        skin=cv2.inpaint(rgb8,mask,3,cv2.INPAINT_TELEA).astype(np.float32)/255
        cheek=patch[:,:,:3][(abs(u)<.75)&(v>.96)&(patch[:,:,3]>.98)]
        if len(cheek):
            # Skin below the eye shares its warm local light. Do not propagate
            # the dark bangs above the lash over a closing eyelid.
            cheek=cheek[cheek.sum(axis=1)>=np.median(cheek.sum(axis=1))]
            skin=.16*skin+.84*np.median(cheek,axis=0)
        factor=1-amount*.92
        source_y=lid+(y+t-lid)/factor
        source_v=(source_y-mid)/ry
        keep=(1-smooth(.77,1.12,u*u+source_v*source_v))[:,:,None]
        fold=cv2.remap(patch,x,source_y-t,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
        color=skin*(1-keep)+fold[:,:,:3]*keep
        if amount>=.93:
            # Retain a curved fine lash at full closure, sampling the darkest
            # painted lash color above this eye (never blacken skin or visor).
            pigment=patch[:,:,:3][(oval<.83)&(v<-.15)]
            if len(pigment):
                ink=pigment[np.argmin(pigment.sum(axis=1))]
                line=np.exp(-((y+t-lid)/.63)**2)*(1-smooth(.70,1,abs(u)))
                color=color*(1-line[:,:,None])+ink*line[:,:,None]
        result[t:b,l:r,:3]=patch[:,:,:3]*(1-coverage[:,:,None])+color*coverage[:,:,None]
    return result


def make_idle(key, source, eyes, hands, mouth, visible):
    profile=RHYTHMS[key]
    h,w=source.shape[:2]
    gy,gx=np.indices((h,w),dtype=np.float32)
    cx,cy=np.mean(eyes,axis=0)
    neck=cy+28
    span=math.dist(*eyes)
    # Continuous vertex weights keep overlapping hair, fingers, and cloth
    # attached instead of cutting transparent seams between body parts.
    floor=1-smooth(248,284,gy)
    head=(1-smooth(neck-8,neck+17,gy))
    shoulder=np.exp(-((gy-(neck+13))/29)**2)
    skirt=np.exp(-((gy-221)/29)**2)*smooth(14,63,abs(gx-cx))
    hair=smooth(span*.84,span*2.1,abs(gx-cx))*smooth(cy+4,cy+61,gy)*floor
    free_leg=smooth(-4,16,-profile.support*(gx-cx))*np.exp(-((gy-258)/17)**2)
    wrist=np.zeros_like(gx)
    for x,y in hands:
        wrist+=np.exp(-((gx-x)/15)**2-((gy-y)/16)**2)
    # Distinct silhouette accents follow the actual accessory on this costume.
    # Local weights decay before the shoe line, including for a full-length cape.
    accents={
        'bai-shuangming-base': (155,225,23,32),  # blue cape corner
        'bai-shuangming-v1': (237,235,24,31),    # tiered overskirt
        'claude-base': (238,220,26,29),          # copper curls
        'claude-v1': (250,207,33,26),            # curls gathered behind back
        'gemini-v1': (152,211,21,30),            # fine side ribbons; halo is rigid on the head
        'grok-v1': (250,160,23,31),              # spring of the right twin-tail
        'jingyuniang-base': (152,234,24,26),     # upturned tail
        'jingyuniang-v1': (259,225,25,26),       # extended fluke
        'longmama-base': (253,218,29,31),        # pale dragon tail
        'longmama-v1': (259,219,27,28),
        'lu-mi-base': (243,216,24,28),           # side ruffles
        'lu-mi-v1': (147,208,24,28),             # dark embroidered cape
        'shan-base': (155,188,30,32),            # exuberant left curls
        'shan-v1': (243,218,26,30),              # skirt held in her hand
    }
    ax,ay,aw,ah=accents[key]
    accent=np.exp(-((gx-ax)/aw)**2-((gy-ay)/ah)**2)*floor
    # Mouth corners and brows live in face-local coordinates. Their short
    # response peaks away from the blink so the expression reads before or
    # after the weight shift. Keep the irises outside the expression masks.
    mx,my=mouth
    slope=(eyes[1][1]-eyes[0][1])/(eyes[1][0]-eyes[0][0])
    mouth_y=gy-my-(gx-mx)*slope
    mouth_x=gx-mx
    mouth_weight=np.exp(-(mouth_x/7.8)**2-(mouth_y/4.5)**2)
    corners=mouth_weight*np.minimum(1,abs(mouth_x)/3.2)
    bx,by=eyes[0 if profile.support<0 else 1]
    brow=np.exp(-((gx-bx)/7)**2-((gy-by+11-(gx-bx)*slope)/2.8)**2)
    frames=[]; registration=[]; durations=[]
    for i in range(24):
        phase=2*math.pi*i/24
        wave=math.sin(phase)
        breath=(1-math.cos(phase))*0.5
        lag=math.sin(phase-.65)+math.sin(.65)*math.cos(2*phase)
        tilt=math.radians(profile.tilt)*wave
        sin,cos=math.sin(tilt),math.cos(tilt)
        # Approximate inverse skinning. A locally rigid head pivots on the
        # neck. At ankle height the entire deformation field is exactly zero.
        dx=floor*(profile.sway*wave+head*((cos-1)*(gx-cx)-sin*(gy-neck)))
        dy=floor*(-profile.nod*breath+head*(sin*(gx-cx)+(cos-1)*(gy-neck)))
        dx+=skirt*profile.cloth*.52*lag+hair*profile.cloth*.75*lag
        dx+=accent*lag*profile.cloth
        dy+=accent*math.sin(2*phase)*profile.cloth*.57
        dx+=free_leg*profile.sway*.55*wave
        dy+=free_leg*breath+shoulder*profile.support*(gx-cx)*.022*wave
        dx+=wrist*profile.hand*wave*(-profile.support)*.54
        dy+=wrist*profile.hand*breath
        peak=6 if profile.blink>=14 else 18
        expression=max(0,1-abs(i-peak)/5)
        expression=expression*expression*(3-2*expression)
        dx+=mouth_weight*np.clip(mouth_x/5,-1,1)*1.5*expression
        dy-=corners*1.9*expression
        if key!='gemini-v1':
            dy-=brow*1.35*expression
        dx*=1-smooth(276,286,gy)
        dy*=1-smooth(276,286,gy)
        blink=max(0,1-abs(i-profile.blink)*.55)
        if key=='gemini-v1':
            # Her irises are painted through a continuous tinted lens. Keep
            # that glass and its reflections intact and let the halo nod instead.
            blink=0
        exposed=close_lids(source,eyes,visible,blink)
        frame=exposed if i==0 else cv2.remap(exposed,(gx-dx).astype(np.float32),(gy-dy).astype(np.float32),cv2.INTER_LINEAR)
        frames.append(frame)
        marks=[]
        if blink==0:
            for j in visible:
                ex,ey=eyes[j]
                # Solve the same inverse warp that drew the eye, yielding the
                # calibrated desktop sample center for this specific exposure.
                ix,iy=ex,ey
                for _ in range(3):
                    ix,iy=round(ex+float(dx[iy,ix])),round(ey+float(dy[iy,ix]))
                marks.append([ix,iy,8,7])
        registration.append(marks)
        hold=210 if i==0 else 120 if i==(7 if profile.support<0 else 19) else 0
        durations.append(65 if blink else profile.interval+hold)
    return frames,registration,durations
