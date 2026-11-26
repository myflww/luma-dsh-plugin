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
    public static int DragFrame(long elapsed,double lean,bool quiet){
        if(quiet)return 16;
        if(elapsed<LiftMs)return 8+(int)Math.Min(7,Math.Max(0,elapsed)*8/LiftMs);
        double force=Math.Abs(lean);
        if(force<.22)return 16;
        int strength=(int)Math.Round(Math.Min(1,(force-.22)/.78)*7);
        return (lean>0?24:32)+strength;
    }
    public static int LandingOffset(long heldMs){
        // Releasing before her feet have lifted only needs the light recovery
        // cels. A partial lift joins the landing at a matching height.
        if(heldMs<LiftMs/3)return LandMs*6/8;
        return (int)Math.Max(0,(LiftMs-heldMs)*(LandMs/4)/(LiftMs-LiftMs/3));
    }
    public void Dispose(){
        foreach(var cell in cells)if(cell!=null)cell.Dispose();
    }
}

// A lightly damped suspension follows horizontal hand velocity. A quick turn
// carries the last lean through the reversal; stopping lets it swing back.
internal sealed class PetSuspension {
    public double Lean {get;private set;}
    double angularSpeed, drive;
    int pointerX;
    long sampledAt, integratedAt;
    public void Grab(Point p,long now){
        pointerX=p.X;sampledAt=integratedAt=now;Lean=angularSpeed=drive=0;
    }
    public void Sample(Point p,long now,int width){
        int dx=p.X-pointerX;
        if(dx==0)return;
        double dt=Math.Max(8,Math.Min(110,now-sampledAt))/1000.0;
        double speed=Math.Max(-2.5,Math.Min(2.5,dx/(Math.Max(1,width)*dt)));
        drive=.35*drive+.65*speed;
        sampledAt=now;pointerX=p.X;
    }
    public void Advance(long now){
        double dt=Math.Max(0,Math.Min(90,now-integratedAt))/1000.0;
        double target=Math.Max(-1,Math.Min(1,drive*.68))*Math.Exp(-Math.Max(0,now-sampledAt-36)/82.0);
        while(dt>.00001){
            double step=Math.Min(.008,dt);
            angularSpeed+=(109*(target-Lean)-12*angularSpeed)*step;
            Lean=Math.Max(-1.05,Math.Min(1.05,Lean+angularSpeed*step));
            dt-=step;
        }
        integratedAt=now;
    }
}
