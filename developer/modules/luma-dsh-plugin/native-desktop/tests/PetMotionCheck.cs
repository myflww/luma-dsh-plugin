using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal static class PetMotionCheck {
    static void Check(bool passed,string message){
        if(!passed)throw new InvalidDataException(message);
    }
    static byte[] Pixels(Bitmap image,Rectangle box){
        var data=image.LockBits(box,ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
        try{
            var pixels=new byte[box.Width*box.Height*4];
            for(int y=0;y<box.Height;y++)
                Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),pixels,y*box.Width*4,box.Width*4);
            return pixels;
        }finally{image.UnlockBits(data);}
    }
    static void CheckAtlas(string key,PetPoseAtlas atlas){
        var meta=atlas.Metadata;
        var cell=new Rectangle(Point.Empty,atlas.Frame(0).Size);
        var rest=Pixels(atlas.Frame(0),cell);
        Check(rest.SequenceEqual(Pixels(atlas.Frame(8),cell)),key+" jumps at pickup");
        Check(rest.SequenceEqual(Pixels(atlas.Frame(47),cell)),key+" jumps when landing ends");
        Check(!rest.SequenceEqual(Pixels(atlas.Frame(4),cell)),key+" missing idle drawing");
        Check(!rest.SequenceEqual(Pixels(atlas.Frame(16),cell)),key+" missing suspended drawing");
        var held=Pixels(atlas.Frame(16),cell);
        var vertical=new HashSet<string>();
        using(var sha=SHA256.Create())for(int frame=16;frame<24;frame++)
            vertical.Add(Convert.ToBase64String(sha.ComputeHash(Pixels(atlas.Frame(frame),cell))));
        Check(vertical.Count==8,key+" missing vertical pull/dip drawings");
        Check(!Pixels(atlas.Frame(31),cell).SequenceEqual(Pixels(atlas.Frame(39),cell)),key+" missing directional catch");
        if(meta.eyes!=null && meta.eyes.Length>0){
            var a=meta.eyes[0];
            var faceArea=new Rectangle(a[0]-4,a[1]-2,9,10);
            if(meta.eyes.Length==2){
                var b=meta.eyes[1];
                double d=Math.Sqrt((b[0]-a[0])*(b[0]-a[0])+(b[1]-a[1])*(b[1]-a[1]));
                int cx=(b[0]+a[0])/2,cy=(b[1]+a[1])/2;
                faceArea=new Rectangle(cx-(int)(d*.60),cy-(int)(d*.24),(int)(d*1.20),(int)(d*.70));
            }
            var face=Pixels(atlas.Frame(16),faceArea);
            for(int frame=17;frame<40;frame++)
                Check(face.SequenceEqual(Pixels(atlas.Frame(frame),faceArea)),key+" swing repainted eyes or cheeks");
        }
        Check(!rest.SequenceEqual(Pixels(atlas.Frame(43),cell)),key+" missing knee compression");
        int elapsed=0;
        for(int i=0;i<8;i++){
            Check(atlas.IdleFrame(elapsed)==i,key+" idle timing");
            elapsed+=meta.idleDurationsMs[i];
        }
        Check(atlas.IdleFrame(elapsed)==0,key+" idle loop");
        using(var sha=SHA256.Create()){
            var actionHashes=new byte[40][];
            for(int frame=8;frame<48;frame++)actionHashes[frame-8]=sha.ComputeHash(Pixels(atlas.Frame(frame),cell));
            for(int frame=0;frame<8;frame++){
                var face=atlas.Face(frame);
                var neutral=Pixels(face.Image,cell);
                face.Look(-1,-1);
                var left=Pixels(face.Image,cell);
                face.Look(1,1);
                var right=Pixels(face.Image,cell);
                int changed=0;
                var offset=meta.faceOffsets!=null&&meta.faceOffsets.Length>frame?meta.faceOffsets[frame]:new[]{0,0};
                for(int i=0;i<neutral.Length;i+=4){
                    Check(left[i+3]==neutral[i+3]&&right[i+3]==neutral[i+3],key+" gaze changed opacity");
                    if(left[i]==right[i]&&left[i+1]==right[i+1]&&left[i+2]==right[i+2])continue;
                    changed++;
                    int x=i/4%cell.Width-offset[0],y=i/4/cell.Width-offset[1];
                    Check(neutral[i+3]>=235&&meta.eyes.Any(eye=>(x-eye[0])*(x-eye[0])+(y-eye[1])*(y-eye[1])<27),key+" gaze touched pixels outside a painted iris");
                }
                Check(changed<=150,key+" gaze repainted a large facial area");
                if(meta.eyes==null||meta.eyes.Length==0)Check(changed==0,key+" covered or closed eye was repainted");
                if(frame==0&&meta.eyes!=null&&meta.eyes.Length>0)Check(changed>0,key+" visible iris did not respond");
                face.Look(0,0);
                Check(neutral.SequenceEqual(Pixels(face.Image,cell)),key+" gaze drifted away from the original");
            }
            for(int frame=8;frame<48;frame++)
                Check(actionHashes[frame-8].SequenceEqual(sha.ComputeHash(Pixels(atlas.Frame(frame),cell))),key+" gaze changed action frame "+frame);
        }
    }
    static void CheckSuspension(){
        var catchMotion=new PetSuspension();
        catchMotion.Grab(new Point(100,100),2000);
        int x=100;
        for(int t=2020;t<=2260;t+=20){
            x+=12;catchMotion.Sample(new Point(x,100),t,184);catchMotion.Advance(t);
        }
        Check(PetPoseAtlas.DragFrame(260,catchMotion.Lean,catchMotion.Vertical,false)/8==3,"fast right drag must pull feet left");
        x-=24;catchMotion.Sample(new Point(x,100),2280,184);catchMotion.Advance(2280);
        Check(catchMotion.Lean>0,"feet snapped at abrupt reversal");
        for(int t=2300;t<=2580;t+=20){
            x-=12;catchMotion.Sample(new Point(x,100),t,184);catchMotion.Advance(t);
        }
        Check(PetPoseAtlas.DragFrame(580,catchMotion.Lean,catchMotion.Vertical,false)/8==4,"fast left drag must pull feet right");
        for(int t=2600;t<=4200;t+=20)catchMotion.Advance(t);
        Check(Math.Abs(catchMotion.Lean)<.015,"suspended pose did not settle");
        Check(PetPoseAtlas.DragFrame(2200,catchMotion.Lean,catchMotion.Vertical,false)==16,"wrong stationary held pose");
        Check(PetPoseAtlas.DragFrame(223,0,0,false)==PetPoseAtlas.DragFrame(9973,0,0,false),"stationary hand repeated an animation");
        Check(PetPoseAtlas.DragFrame(223,.8,0,false)==PetPoseAtlas.DragFrame(9973,.8,0,false),"swing depended on a timer");
        Check(PetPoseAtlas.DragFrame(0,0,0,false)==8 && PetPoseAtlas.DragFrame(219,0,0,false)==15,"pickup timeline");
        Check(PetPoseAtlas.LandingOffset(10)>=300 && PetPoseAtlas.LandingOffset(140)>0 && PetPoseAtlas.LandingOffset(320)==0,"partial lift should land from its actual height");
        Check(PetPoseAtlas.DragFrame(0,1,1,true)==16 && PetPoseAtlas.DragFrame(900,-1,-1,true)==16,"reduced motion");
        Check(PetPoseAtlas.DragFrame(600,0,-1,false)==19 && PetPoseAtlas.DragFrame(600,0,1,false)==23,"vertical reactions");
        Check(PetPoseAtlas.DragFrame(600,1,-1,false)==29 && PetPoseAtlas.DragFrame(600,-1,1,false)==39,"diagonal reactions");
        Check(PetPoseAtlas.LandFrame(20,39)==39 && PetPoseAtlas.LandFrame(85,39)==41,"lost release impulse");
    }
    public static void Main(string[] args){
        CheckSuspension();
        var all=new JavaScriptSerializer().Deserialize<Dictionary<string,PetPoseStrip>>(File.ReadAllText(args[0]));
        foreach(var pair in all)
            using(var atlas=new PetPoseAtlas(pair.Value))CheckAtlas(pair.Key,atlas);
    }
}
