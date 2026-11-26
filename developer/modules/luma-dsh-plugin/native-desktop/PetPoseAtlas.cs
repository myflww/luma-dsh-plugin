using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public sealed class PetPoseStrip {
    public string path;
    public int[] cell,foot,grip,idleDurationsMs;
    public int columns,count,figureHeight;
    public int[][] eyes,faceOffsets;
}

// Shared PNG rows: idle, lift, held, swing-left, swing-right, landing.
// GDI+ can decode an entire PNG on every source-rectangle draw. Materialize
// the cropped cells once so short pickup and landing frames survive at 25 Hz.
internal sealed class PetPoseAtlas : IDisposable {
    public const int LiftMs=220, LandMs=400;
    public readonly PetPoseStrip Metadata;
    readonly Bitmap[] cells=new Bitmap[48];
    readonly PetFace[] faces=new PetFace[8];

    public PetPoseAtlas(PetPoseStrip data) {
        if(data==null || data.cell==null || data.cell.Length!=2 || data.cell[0]<=0 || data.cell[1]<=0 ||
           data.foot==null || data.foot.Length!=2 || data.grip==null || data.grip.Length!=2 ||
           data.columns!=8 || data.count!=48 || data.figureHeight<=0)
            throw new InvalidDataException("Incomplete desktop pose atlas");
        Metadata=data;
        if(data.idleDurationsMs==null || data.idleDurationsMs.Length!=8 || Array.Exists(data.idleDurationsMs,v=>v<=0))
            throw new InvalidDataException("Invalid desktop idle timing");
        try{
            using(var source=new Bitmap(data.path)){
                if(source.Width!=data.cell[0]*data.columns || source.Height!=data.cell[1]*(data.count/data.columns))
                    throw new InvalidDataException("Mismatched desktop pose atlas");
                using(var sheet=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb)){
                    using(var g=Graphics.FromImage(sheet))g.DrawImageUnscaled(source,Point.Empty);
                    for(int i=0;i<cells.Length;i++){
                        var rect=new Rectangle(i%data.columns*data.cell[0],i/data.columns*data.cell[1],data.cell[0],data.cell[1]);
                        cells[i]=sheet.Clone(rect,PixelFormat.Format32bppPArgb);
                    }
                }
            }
            for(int i=0;i<faces.Length;i++)
                faces[i]=new PetFace(cells[i],data.eyes,data.faceOffsets!=null && i<data.faceOffsets.Length?data.faceOffsets[i]:null);
        }catch{Dispose();throw;}
    }
    public Bitmap Frame(int index){return cells[index];}
    public PetFace Face(int frame){return faces[frame];}
    public int IdleFrame(long elapsed){
        int total=0;
        foreach(int hold in Metadata.idleDurationsMs)total+=hold;
        long ms=Math.Max(0,elapsed)%total;
        for(int i=0;i<7;i++){
            if(ms<Metadata.idleDurationsMs[i])return i;
            ms-=Metadata.idleDurationsMs[i];
        }
        return 7;
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
