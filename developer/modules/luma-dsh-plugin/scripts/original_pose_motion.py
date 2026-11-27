"""Animate Lu Mi's original registered costume. The face and skull remain one drawing."""
from hashlib import sha256
import math

import cv2
import numpy as np
from PIL import Image

from original_arms import Arms
from standing_motion import make_idle


ORIGINAL_COSTUMES = frozenset(('lu-mi-base','lu-mi-v1'))


def registered_cel(public, marks, master):
    """Rebuild the calibrated image from a restored office strip, or use its verified master."""
    strip_file=public/marks["source"].lstrip("/")
    if strip_file.exists():
        if sha256(strip_file.read_bytes()).hexdigest()!=marks["sha256"]:
            raise ValueError(f"Unexpected original strip: {strip_file}")
        w,h=marks["sourceFrameSize"]
        index=marks["frame"]
        with Image.open(strip_file) as raw:
            source=raw.crop((w*index,0,w*(index+1),h)).convert("RGBA")
        source=source.crop(source.getchannel("A").getbbox())
        scale=min(256/source.height,360/source.width)
        sw,sh=round(source.width*scale),round(source.height*scale)
        image=Image.new("RGBA",(384,336))
        image.paste(source.resize((sw,sh),Image.Resampling.LANCZOS),(192-sw//2,300-sh))
    else:
        with Image.open(master) as raw:
            image=raw.convert("RGBA")
    if sha256(image.tobytes()).hexdigest()!=marks["celPixelSha256"]:
        raise ValueError(f"Registered costume no longer matches its source: {master.name}")
    return image


def ramp(a, b, value):
    t = np.clip((value-a)/(b-a), 0, 1)
    return t*t*(3-2*t)


class CostumeMotion:
    def __init__(self, key, neutral, marks):
        self.key = key
        self.neutral = neutral
        self.marks = marks
        self.arms = Arms(neutral, key)
        self.y, self.x = np.indices(neutral.shape[:2], dtype=np.float32)
        self.cx = np.mean(marks["eyes"], axis=0)[0]
        self.wrists = np.float32([part[0][2] for part in self.arms.parts])

    def hands(self, targets):
        if targets is None:
            return self.neutral
        return self.arms.pose(targets)

    def cloth_and_legs(self, cel, *, swing=0, lift=0, flex=0, stream=0, ground=False):
        # The waist pivots over the hips. The supporting shoe remains on the
        # floor through landing and greetings; the free shoe follows its knee.
        y, x = self.y, self.x
        lower = ramp(169, 277, y)
        ankle = ramp(224, 282, y)
        shoe = ramp(270, 293, y)
        left = ramp(1, 15, self.cx-x)
        right = ramp(-9, 9, x-self.cx)
        hem = ramp(161, 201, y) * (1-ramp(243, 282, y)) * ramp(21, 65, abs(x-self.cx))
        lock = ramp(133, 186, y) * (1-ramp(209, 243, y)) * ramp(28, 63, abs(x-self.cx))
        dx = swing * lower + stream * (hem*.78+lock*.58)
        dx += ankle * ((left*.72-right*.20)*flex+lift*(right*.13-left*.40))
        dy = -shoe * (left*flex*.8+right*lift)
        if ground:
            # Plant the foreground boot; the other shoe may follow the pelvis.
            anchor = np.exp(-((x-192)/13)**2) * ramp(263, 291, y)
            dx *= 1-anchor
            dy *= 1-anchor
        return cv2.remap(cel, np.float32(x-dx), np.float32(y-dy), cv2.INTER_LINEAR)

    def dip(self, cel, amount):
        if not amount:
            return cel
        # Bend below the skirt, keeping the head and torso completely rigid.
        weight = 1-ramp(233, 289, self.y)
        return cv2.remap(cel, self.x, np.float32(self.y-amount*weight), cv2.INTER_LINEAR)

    def reactions(self, side, vertical, amount=1):
        # Relaxed suspended wrists drop close to the sides. Horizontal inertia
        # displaces the sleeves, hair and feet by different amounts.
        offsets = np.float32([[6+side*9, 4-vertical*7], [-5+side*8, 4-vertical*8]])
        pose = self.hands(self.wrists+offsets*amount)
        return self.cloth_and_legs(pose, swing=(3+side*17)*amount,
            lift=(4+vertical*8)*amount, flex=(5+vertical*7-side*2)*amount,
            stream=(side*10+vertical*3)*amount)

    def poses(self):
        marks=self.marks
        idle, eyes, durations=make_idle(self.key, self.neutral, marks["eyes"],
            marks["hands"], marks["mouth"], [0,1])
        vertical=[0,-.30,-.64,-1,.25,.52,.78,1]
        hang=[self.reactions(0,v) for v in vertical]
        take=[self.neutral, self.dip(self.neutral,2), self.reactions(0,-.25,.25),
              self.reactions(0,-.5,.52), self.reactions(0,-.85,.84), hang[3],hang[1],hang[0]]
        side=[(.25,0),(.52,0),(.82,0),(1.12,0),(.54,-.63),(1,-.85),(.54,.63),(1,.85)]
        rows=[idle[:8],take,hang]
        for direction in (-1,1):
            rows.append([self.reactions(direction*x,v) for x,v in side])
        land=[hang[0],hang[3]]
        for bend,t in [(2,.88),(9,.93),(6,.72),(2,.45),(-1,.19)]:
            elbows=np.float32([[-7,-12],[9,-14]])*t
            braced=self.cloth_and_legs(self.hands(self.wrists+elbows),swing=2*t,
                lift=2*t,flex=4*t,stream=-5*t,ground=True)
            land.append(self.dip(braced,bend))
        land.append(self.neutral)
        return rows+[land,idle[8:16],idle[16:]],eyes,durations,marks["foot"][0]

    def gesture(self, row, amount):
        if not amount:
            return self.neutral
        # The embroidered cape is gathered at its clasp with both hands. The
        # invitation opens her outside palm; the other forearm stays at the waist.
        if self.key=="lu-mi-v1":
            palms=([[181,155],[200,159]], [[146,173],[211,182]])[row]
        else:
            palms=([[183,170],[244,194]], [[134,153],[220,177]])[row]
        wrists=self.wrists+(np.float32(palms)-self.wrists)*amount
        cel=self.hands(wrists)
        sign=-1 if row else 1
        cel=self.cloth_and_legs(cel,swing=sign*3*amount,lift=2*amount,
            flex=(3 if row else 1)*amount,stream=sign*2.8*amount,ground=True)
        # Neck inclination is small and the head remains a rigid unit. The
        # collar dissipates the rotation and the supporting leg stays grounded.
        y,x=self.y,self.x
        neck=143
        a=math.radians((-.85 if row else 1.3)*amount)
        w=1-ramp(neck-7,neck+22,y)
        dx=w*((math.cos(a)-1)*(x-self.cx)-math.sin(a)*(y-neck))
        dy=w*(math.sin(a)*(x-self.cx)+(math.cos(a)-1)*(y-neck)+(1 if row else 2)*amount)
        return cv2.remap(cel,np.float32(x-dx),np.float32(y-dy),cv2.INTER_LINEAR)
