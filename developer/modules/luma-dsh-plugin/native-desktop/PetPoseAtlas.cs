using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public sealed class PetPoseStrip {
    public string path;
    public int[] cell,foot,grip,idleDurationsMs;
    public int columns,count,figureHeight;
    public int[][] eyes,faceOffsets;
    public int[][][] idleEyes;
    public PetGestureStrip gestures;
    public PetLookStrip look;
}
public sealed class PetLookStrip {
    public string path,eyesPath;
    public int[] cell,foot,eyesCell,eyesOrigin;
    public int figureHeight,columns,count,neutralIndex;
    public double[] eyeCenter;
}
public sealed class PetGestureStrip {
    public string path;
    public int[] cell,foot;
    public int columns,count,figureHeight;
    public PetGestureAction[] actions;
}
public sealed class PetGestureAction {
    public string id,label;
    public int[] frames,durationsMs;
}

// Rows 0..5 retain the original idle and drag/landing indices. Rows 6..7
// continue the new idle cycle, with per-exposure gaze registration.
// GDI+ can decode an entire PNG on every source-rectangle draw. Materialize
// the cropped cells once so short pickup and landing frames survive at 25 Hz.
internal sealed class PetPoseAtlas : IDisposable {
    public const int LiftMs=220, LandMs=400;
    public readonly PetPoseStrip Metadata;
    readonly Bitmap[] cells;
    readonly PetFace[] faces;
    readonly int[] gestureMs=new int[2];
    readonly int lookFirst;
    Bitmap eyeSheet,composite;
    int cachedHead=-1,cachedEyes=-1;

    public PetPoseAtlas(PetPoseStrip data) {
        if(data==null || data.cell==null || data.cell.Length!=2 || data.cell[0]<=0 || data.cell[1]<=0 ||
           data.foot==null || data.foot.Length!=2 || data.grip==null || data.grip.Length!=2 ||
           data.columns!=8 || (data.count!=48 && data.count!=64) || data.figureHeight<=0)
            throw new InvalidDataException("Incomplete desktop pose atlas");
        Metadata=data;
        if(data.idleDurationsMs==null || data.idleDurationsMs.Length!=data.count-40 || Array.Exists(data.idleDurationsMs,v=>v<=0))
            throw new InvalidDataException("Invalid desktop idle timing");
        if(data.idleEyes!=null && data.idleEyes.Length!=data.idleDurationsMs.Length)
            throw new InvalidDataException("Mismatched idle-eye registration");
        foreach(int hold in data.idleDurationsMs)IdleCycleMs+=hold;
        var extra=data.gestures;
        if(extra!=null){
            if(extra.cell==null || extra.cell.Length!=2 || extra.cell[0]!=data.cell[0] || extra.cell[1]!=data.cell[1] ||
                extra.foot==null || extra.foot.Length!=2 || extra.figureHeight<=0 ||
                extra.count!=16 || extra.columns!=8 || extra.actions==null || extra.actions.Length!=2)
                throw new InvalidDataException("Invalid desktop gesture atlas");
            for(int i=0;i<2;i++){
                var action=extra.actions[i];
                if(action==null || String.IsNullOrEmpty(action.id) || action.frames==null || action.frames.Length==0 ||
                    action.durationsMs==null || action.frames.Length!=action.durationsMs.Length ||
                    Array.Exists(action.frames,v=>v<0 || v>=extra.count) || Array.Exists(action.durationsMs,v=>v<=0))
                    throw new InvalidDataException("Invalid desktop gesture timeline");
                foreach(int ms in action.durationsMs)gestureMs[i]=checked(gestureMs[i]+ms);
            }
        }
        lookFirst=data.count+(extra==null?0:extra.count);
        var look=data.look;
        if(look!=null && (look.count!=25 || look.columns!=5 || look.neutralIndex!=12 ||
           look.figureHeight!=data.figureHeight || look.cell==null || look.cell.Length!=2 ||
           look.cell[0]!=data.cell[0] || look.cell[1]!=data.cell[1] || look.foot==null || look.foot.Length!=2 ||
           look.foot[0]!=data.foot[0] || look.foot[1]!=data.foot[1] || look.eyeCenter==null ||
           look.eyeCenter.Length!=2 || look.eyesOrigin==null || look.eyesOrigin.Length!=2 || look.eyesCell==null ||
           look.eyesCell.Length!=2 || look.eyesCell[0]<=0 || look.eyesCell[1]<=0))
            throw new InvalidDataException("Invalid desktop gaze registration");
        cells=new Bitmap[lookFirst+(look==null?0:look.count)];
        faces=new PetFace[cells.Length];
        try{
            ReadCells(data.path,0,data.count,data.columns,data.cell);
            if(extra!=null)ReadCells(extra.path,data.count,extra.count,extra.columns,extra.cell);
            if(look!=null){
                ReadCells(look.path,lookFirst,look.count,look.columns,look.cell);
                using(var source=new Bitmap(look.eyesPath)){
                    if(source.Width!=25*look.eyesCell[0] || source.Height!=25*look.eyesCell[1])
                        throw new InvalidDataException("Mismatched desktop gaze overlays");
                    eyeSheet=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb);
                    using(var g=Graphics.FromImage(eyeSheet))g.DrawImageUnscaled(source,Point.Empty);
                }
                composite=new Bitmap(look.cell[0],look.cell[1],PixelFormat.Format32bppPArgb);
            }
            for(int i=0;i<data.idleDurationsMs.Length;i++){
                int index=IdleIndex(i);
                var marks=data.idleEyes!=null?data.idleEyes[i]:data.eyes;
                var offset=data.idleEyes==null && data.faceOffsets!=null && i<data.faceOffsets.Length?data.faceOffsets[i]:null;
                faces[index]=new PetFace(cells[index],marks,offset);
            }
        }catch{Dispose();throw;}
    }
    void ReadCells(string path,int first,int count,int columns,int[] cell){
        using(var source=new Bitmap(path)){
            if(source.Width!=cell[0]*columns || source.Height!=cell[1]*(count/columns))
                throw new InvalidDataException("Mismatched desktop pose atlas");
            using(var sheet=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb)){
                using(var g=Graphics.FromImage(sheet))g.DrawImageUnscaled(source,Point.Empty);
                for(int i=0;i<count;i++){
                    var rect=new Rectangle(i%columns*cell[0],i/columns*cell[1],cell[0],cell[1]);
                    cells[first+i]=sheet.Clone(rect,PixelFormat.Format32bppPArgb);
                }
            }
        }
    }
    public static int IdleIndex(int ordinal){return ordinal<8?ordinal:ordinal+40;}
    public Bitmap Frame(int index){return cells[index];}
    public Bitmap LookFrame(int head,int eyes){
        var body=cells[lookFirst+head];
        if(head==eyes)return body;
        if(cachedHead==head && cachedEyes==eyes)return composite;
        var look=Metadata.look;
        int w=look.eyesCell[0],h=look.eyesCell[1];
        using(var g=Graphics.FromImage(composite)){
            g.CompositingMode=CompositingMode.SourceCopy;
            g.DrawImageUnscaled(body,Point.Empty);
            g.CompositingMode=CompositingMode.SourceOver;
            g.InterpolationMode=InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode=PixelOffsetMode.Half;
            var dest=new Rectangle(look.eyesOrigin[0],look.eyesOrigin[1],w,h);
            g.DrawImage(eyeSheet,dest,eyes*w,head*h,w,h,GraphicsUnit.Pixel);
        }
        cachedHead=head;cachedEyes=eyes;
        return composite;
    }
    public PetFace Face(int frame){return faces[frame];}
    public static int IdleDelay(string id){
        uint hash=0;
        foreach(char c in id)hash=unchecked(hash*31+c);
        return (int)(hash%811);
    }
    public readonly int IdleCycleMs;
    public int GestureDuration(int action){return gestureMs[action];}
    // One breathing cycle separates every gesture. Returning the next action
    // allows a pickup or costume change to interrupt without replaying it.
    public int StandingFrame(long elapsed,int first,out int next){
        next=first;
        if(Metadata.gestures==null || elapsed<IdleCycleMs)return IdleFrame(elapsed);
        long pair=2L*IdleCycleMs+gestureMs[0]+gestureMs[1];
        long ms=elapsed%pair;
        for(int i=0;i<2;i++){
            if(ms<IdleCycleMs)return IdleFrame(ms);
            ms-=IdleCycleMs;
            int index=(first+i)%2;
            next=1-index;
            if(ms<gestureMs[index]){
                return GestureFrame(index,ms);
            }else ms-=gestureMs[index];
        }
        return 0;
    }
    public int GestureFrame(int index,long elapsed){
        var action=Metadata.gestures.actions[index];
        for(int i=0;i<action.frames.Length;i++){
            if(elapsed<action.durationsMs[i])return Metadata.count+action.frames[i];
            elapsed-=action.durationsMs[i];
        }
        return 0;
    }
    public int IdleFrame(long elapsed){
        long ms=Math.Max(0,elapsed)%IdleCycleMs;
        for(int i=0;i<Metadata.idleDurationsMs.Length;i++){
            if(ms<Metadata.idleDurationsMs[i])return IdleIndex(i);
            ms-=Metadata.idleDurationsMs[i];
        }
        return 0;
    }
    public static int DragFrame(long elapsed,double x,double y,bool quiet){
        if(quiet)return 16;
        if(elapsed<LiftMs)return 8+(int)Math.Min(7,Math.Max(0,elapsed)*8/LiftMs);
        double ax=Math.Abs(x),ay=Math.Abs(y),strength=Math.Max(ax,ay);
        if(strength<.105)return 16;
        if(Math.Min(ax,ay)>.18&&Math.Min(ax,ay)>.48*strength)
            return (x>0?24:32)+(y<0?4:6)+(strength>=.62?1:0);
        if(ay>ax)return y<0?17+Math.Min(2,(int)(ay*3)):20+Math.Min(3,(int)(ay*4));
        return (x>0?24:32)+Math.Min(3,(int)(ax*4));
    }
    public static int LandingOffset(long heldMs){
        // Releasing before her feet have lifted only needs the light recovery
        // cels. A partial lift joins the landing at a matching height.
        if(heldMs<2*LiftMs/8)return LandMs*6/8;
        return heldMs<6*LiftMs/8?LandMs*2/8:0;
    }
    public static int LandFrame(long elapsed,int releasedPose){
        if(elapsed<LandMs/8&&releasedPose>=16&&releasedPose<40)return releasedPose;
        return 40+(int)Math.Min(7,Math.Max(0,elapsed)*8/LandMs);
    }
    public void Dispose(){
        foreach(var cell in cells)if(cell!=null)cell.Dispose();
        if(eyeSheet!=null)eyeSheet.Dispose();
        if(composite!=null)composite.Dispose();
    }
}

internal sealed class PetDropAttention {
    const int FollowMs=2450;
    public const int DurationMs=FollowMs+480;
    long start=-1,previous;
    public bool Active {get{return start>=0;}}
    double eyeX,eyeY,headX,headY;
    public int Head {get;private set;}
    public int Eyes {get;private set;}
    public void Start(long afterLanding){
        previous=start=afterLanding;
        eyeX=eyeY=headX=headY=0;
        Head=Eyes=12;
    }
    public void Stop(){start=-1;}
    static double Clamp(double x){return Math.Max(-1,Math.Min(1,x));}
    static int Axis(double value,int previous){
        double at=(Clamp(value)+1)*2;
        return (int)Math.Floor(at+(at>previous?-.1:.1)+.5);
    }
    static int Index(double x,double y,int previous){
        return Axis(y,previous/5)*5+Axis(x,previous%5);
    }
    public bool Sample(long now,double pointerX,double pointerY){
        if(start<0 || now<start)return false;
        long age=now-start;
        if(age>=DurationMs){Stop();return false;}
        double dt=Math.Max(0,now-previous);previous=now;
        bool returning=age>=FollowMs;
        double x=returning?0:Clamp(pointerX),y=returning?0:Clamp(pointerY);
        double eyeStep=1-Math.Exp(-dt/(returning?100:55));
        // The gaze finds its target first. The head starts 90 ms after touchdown.
        double headDt=Math.Min(dt,Math.Max(0,age-90));
        double headStep=1-Math.Exp(-headDt/(returning?145:165));
        eyeX+=(x-eyeX)*eyeStep;eyeY+=(y-eyeY)*eyeStep;
        headX+=(eyeX-headX)*headStep;headY+=(eyeY-headY)*headStep;
        Eyes=Index(eyeX,eyeY,Eyes);Head=Index(headX,headY,Head);
        return true;
    }
}

// The same two damped axes as the room renderer. Integration uses short
// substeps so a burst of pointer events and a slow paint tick can coexist.
internal sealed class PetSuspension {
    public double Lean {get;private set;}
    public double Vertical {get;private set;}
    double vx,vy,driveX,driveY;
    Point pointer;
    long sampledAt, integratedAt;
    public void Grab(Point p,long now){
        pointer=p;sampledAt=integratedAt=now;Lean=Vertical=vx=vy=driveX=driveY=0;
    }
    static double Clamp(double value,double limit){return Math.Max(-limit,Math.Min(limit,value));}
    public void Sample(Point p,long now,double bodyHeight){
        if(now<integratedAt||now-integratedAt>450){Grab(p,now);return;}
        if(p!=pointer){
            double dt=Math.Max(8,Math.Min(100,now-sampledAt)),scale=1000/(Math.Max(1,bodyHeight)*dt);
            double blend=1-Math.Exp(-dt/23);
            driveX+=(Clamp((p.X-pointer.X)*scale,2.6)-driveX)*blend;
            driveY+=(Clamp((p.Y-pointer.Y)*scale,2.6)-driveY)*blend;
            sampledAt=now;pointer=p;
        }
        Advance(now);
    }
    public void Advance(long now){
        if(now<integratedAt||now-integratedAt>450){Grab(pointer,now);return;}
        while(integratedAt<now){
            long next=Math.Min(now,integratedAt+8);double dt=(next-integratedAt)/1000d;
            double decay=Math.Exp(-Math.Max(0,next-sampledAt-24)/65d);
            vx+=(145*(Clamp(driveX*.75,1)*decay-Lean)-13*vx)*dt;
            vy+=(185*(Clamp(driveY*.66,1)*decay-Vertical)-16*vy)*dt;
            Lean=Clamp(Lean+vx*dt,1.05);Vertical=Clamp(Vertical+vy*dt,1.05);
            integratedAt=next;
        }
    }
}
