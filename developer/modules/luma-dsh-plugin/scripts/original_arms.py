"""Articulated arms cut from the original Lu Mi costume, in its registered 384×336 cell."""
import cv2
import numpy as np

# Each outlined arm includes its fingers and, for the alternate outfit, its own
# white sleeve and cuff. Segments overlap at the elbow so a bent wrist never
# leaves an empty seam. Everything outside the two arm masks stays as painted.
RIGS = {
    "lu-mi-base": (
        ((178,145),(169,168),(151,190),[(176,139),(181,138),(183,143),(181,149),(178,150),(178,156),(174,166),(168,175),(158,186),(155,191),(150,196),(148,195),(149,192),(146,195),(145,193),(147,190),(146,191),(144,191),(147,188),(152,185),(157,179),(161,170),(165,161),(170,153),(173,145)]),
        ((213,145),(222,169),(237,189),[(211,140),(215,139),(218,142),(220,153),(223,160),(228,168),(231,175),(236,184),(240,188),(245,191),(246,194),(243,193),(245,196),(241,194),(238,191),(235,190),(231,186),(225,178),(219,172),(215,164),(211,151),(209,148)])),
    "lu-mi-v1": (
        ((171,157),(162,173),(161,185),[(170,153),(175,156),(178,163),(177,171),(174,176),(170,179),(169,184),(166,188),(159,190),(155,189),(156,185),(153,183),(154,178),(152,175),(153,169),(159,163),(165,158)]),
        ((211,157),(220,177),(231,194),[(207,154),(214,154),(215,162),(221,164),(224,169),(229,173),(231,178),(230,182),(226,185),(233,188),(234,192),(238,197),(239,201),(235,199),(235,202),(230,197),(227,196),(224,192),(224,187),(220,188),(216,184),(212,177),(209,167)])),
}


class Arms:
    def __init__(self, original, key, density=1):
        self.scale=density
        self.rig=RIGS[key]
        self.parts=[]
        shape=original.shape[:2]
        mask=np.zeros(shape,np.uint8)
        gy,gx=np.indices(shape,dtype=np.float32)
        rgb=original[:,:,:3]/np.maximum(original[:,:,3:],.004)
        red,green,blue=np.moveaxis(rgb,2,0)
        for shoulder,elbow,hand,outline in self.rig:
            pts=np.float32([shoulder,elbow,hand])*density
            outline=np.float32(outline)*density
            ink=np.zeros(shape,np.uint8)
            cv2.fillPoly(ink,[np.rint(outline*16).astype(np.int32)],255,lineType=cv2.LINE_AA,shift=4)
            # Use the actual painted skin and cuff outline, not the coarse
            # guide polygon. Otherwise rotating a bare forearm carries a black
            # strip of the long hair along with it and leaves pale skin behind.
            radius=6*density
            envelope=cv2.dilate(ink,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1)))
            within=(envelope>20)&(original[:,:,3]>.30)
            pigment=(red>.47)&(green>.35)&(blue>.22)&(red>blue*1.025)
            if key.endswith('v1'):pigment|=(red>.58)&(green>.57)&(blue>.58)
            strong=np.uint8(within & pigment)
            # The neck and collar are over the sleeve cap, outside this limb.
            strong[gy<pts[0,1]-4*density]=0
            count,lab,stats,_=cv2.connectedComponentsWithStats(strong)
            if count<2:raise ValueError(("cannot segment arm",key,shoulder))
            main=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
            dist=cv2.distanceTransform(np.uint8(lab!=main),cv2.DIST_L2,5)
            ink=np.uint8(255*np.clip((1.45*density-dist)/max(1,.75*density),0,1))
            for pi in range(3):
                y0=round(float(pts[pi,1]))
                row=np.flatnonzero((lab[y0]==main)&(abs(gx[y0]-pts[pi,0])<10*density))
                if len(row):pts[pi,0]=np.median(row)
            mask=cv2.bitwise_or(mask,ink)
            axis=pts[2]-pts[0];axis/=np.linalg.norm(axis)
            projection=(gx-pts[1,0])*axis[0]+(gy-pts[1,1])*axis[1]
            upper=ink*np.clip((3*density-projection)/(2*density),0,1)
            lower=ink*np.clip((projection+3*density)/(2*density),0,1)
            self.parts.append((pts,original*(upper/255)[:,:,None],original*(lower/255)[:,:,None]))
        ink=cv2.dilate(np.uint8(mask>20),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(6*density+1,6*density+1)))
        fixed=np.zeros(original.shape,np.float32)
        for i in range(4):
            fixed[:,:,i]=cv2.inpaint(np.uint8(np.clip(original[:,:,i]*255+.5,0,255)),ink,4*density,cv2.INPAINT_TELEA)/255.
        # Only the strips uncovered by changing the original arm positions
        # receive adjacent hair/dress pixels. Face and hair ornaments are outside.
        self.clean=np.where(ink[:,:,None]!=0,fixed,original)
        self.original=original

    @staticmethod
    def map_bone(part,start,end,dest,tip):
        a=end-start;b=tip-dest
        scale=np.linalg.norm(b)/np.linalg.norm(a)
        c=np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b))*scale
        s=float(a[0]*b[1]-a[1]*b[0])/(np.linalg.norm(a)*np.linalg.norm(b))*scale
        rot=np.float32([[c,-s],[s,c]])
        mat=np.column_stack((rot,dest-rot@start))
        return cv2.warpAffine(part,mat,(part.shape[1],part.shape[0]),flags=cv2.INTER_CUBIC)

    def pose(self, targets):
        image=self.clean.copy()
        for i,(pts,upper,lower) in enumerate(self.parts):
            s,e,h=pts
            if targets[i] is None:
                elbow=e;tip=h
            else:
                desired=np.float32(targets[i])*self.scale
                a=np.linalg.norm(e-s);b=np.linalg.norm(h-e)
                direction=desired-s
                length=np.linalg.norm(direction);direction/=max(.01,length)
                # A few original poses use strong foreshortening (especially
                # the white cuff). Let it unfold from the photographed length.
                stretch=max(1,min(1.30,length/(a+b)))
                a*=stretch;b*=stretch
                length=np.clip(length,abs(a-b)+.4,a+b-.4)
                tip=s+direction*length
                mid=(a*a-b*b+length*length)/(2*length)
                split=max(0,a*a-mid*mid)**.5
                normal=np.float32([-direction[1],direction[0]])
                e1=s+direction*mid+normal*split;e2=s+direction*mid-normal*split
                guide=e+np.float32([(-12 if i==0 else 12)*self.scale,9*self.scale])
                elbow=min((e1,e2),key=lambda p:np.linalg.norm(p-guide))
            for layer in (self.map_bone(upper,s,e,s,elbow),self.map_bone(lower,e,h,elbow,tip)):
                image=layer+image*(1-np.clip(layer[:,:,3:],0,1))
        return np.clip(image,0,1)
