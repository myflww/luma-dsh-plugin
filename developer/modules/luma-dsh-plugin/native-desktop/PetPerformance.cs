using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

internal enum PetTrick { None, Snack, Turn, Bow, Pat, SignatureA, SignatureB }

internal sealed class PetPaintedFrame {
    public readonly Bitmap Image;
    public readonly int FigureHeight,OriginX,Sole,Key;
    public PetPaintedFrame(Bitmap image,int height,int origin,int sole,int key){
        Image=image;FigureHeight=height;OriginX=origin;Sole=sole;Key=key;
    }
}

// Slots 0–3 are the existing greeting, sleepy, lunch and ledge drawings,
// registered to the same cheek width as standing. Each performance row has
// its own hand, mouth and weight-bearing keys on that same sole coordinate.
internal sealed class PetPerformanceAtlas : IDisposable {
    readonly PetPaintedFrame[] frames;
    public bool HasPat {get{return frames.Length>=16;}}
    public PetPerformanceAtlas(string path){
        const int w=384,h=336;
        try {
            using(var sheet=new Bitmap(path)){
                if(sheet.Width!=w*4 || (sheet.Height!=h*3 && sheet.Height!=h*4))throw new InvalidDataException("Invalid desktop performance atlas");
                frames=new PetPaintedFrame[sheet.Height/h*4];
                for(int i=0;i<frames.Length;i++){
                    var cell=sheet.Clone(new Rectangle(i%4*w,i/4*h,w,h),PixelFormat.Format32bppPArgb);
                    frames[i]=new PetPaintedFrame(cell,256,192,300,100+i);
                }
            }
        }catch{Dispose();throw;}
    }
    public PetPaintedFrame this[int index]{get{return frames[index];}}
    public void Dispose(){if(frames==null)return;foreach(var frame in frames)if(frame!=null)frame.Image.Dispose();}
}

internal partial class PetWindow {
    PetTrick performance;
    long performanceStarted;
    int performanceEdge;
    bool performancePinned,pressedHead;
    static readonly int[] SnackKeys={4,5,6,7,5,4};
    static readonly int[] SnackHolds={440,115,375,420,115,250};
    static readonly int[] BowKeys={8,9,10,11,8};
    static readonly int[] BowHolds={310,135,570,155,300};
    static readonly int[] PatKeys={12,13,14,15,12};
    static readonly int[] PatHolds={260,110,680,180,240};
    static readonly string[] TurnDirections={"down","left","up","right","down"};
    static readonly int[] TurnHolds={200,255,300,255,265};

    void AddPerformanceMenu(ContextMenuStrip menu){
        var snack=new ToolStripMenuItem("吃点心",null,delegate{StartPerformance(PetTrick.Snack);});
        var turn=new ToolStripMenuItem("原地转圈",null,delegate{StartPerformance(PetTrick.Turn);});
        var bow=new ToolStripMenuItem("优雅行礼",null,delegate{StartPerformance(PetTrick.Bow);});
        var pat=new ToolStripMenuItem("摸摸头",null,delegate{StartPerformance(PetTrick.Pat);});
        var special=new ToolStripMenuItem("角色小动作");
        var first=special.DropDownItems.Add("",null,delegate{StartPerformance(PetTrick.SignatureA);});
        var second=special.DropDownItems.Add("",null,delegate{StartPerformance(PetTrick.SignatureB);});
        menu.Items.Insert(0,snack);menu.Items.Insert(1,turn);menu.Items.Insert(2,bow);
        menu.Items.Insert(3,pat);menu.Items.Insert(4,special);menu.Items.Insert(5,new ToolStripSeparator());
        menu.Opening+=delegate{
            snack.Enabled=bow.Enabled=costume.Performance!=null;
            turn.Enabled=costume.Frames.Count==4;
            pat.Enabled=costume.Performance!=null&&costume.Performance.HasPat;
            var gestures=costume.Poses.Metadata.gestures;
            special.Enabled=gestures!=null;
            if(gestures!=null){first.Text=gestures.actions[0].label??"第一个动作";second.Text=gestures.actions[1].label??"第二个动作";}
        };
    }
    bool IsHeadTouch(Point pointer){
        if(costume.Performance==null||!costume.Performance.HasPat||surface==null||
           side!=0||asleep||moving||dayActivity!="awake"||performance!=PetTrick.None)return false;
        var pose=costume.Poses.Metadata;
        var eyes=pose.eyes;
        if(eyes==null||eyes.Length!=2)return false;
        double unit=spriteSide*.89/pose.figureHeight;
        double eyeX=x+Width*.5+((eyes[0][0]+eyes[1][0])*.5-pose.foot[0])*unit;
        double eyeY=y+Height-Math.Ceiling(spriteSide*.075)+((eyes[0][1]+eyes[1][1])*.5-pose.foot[1])*unit;
        double span=Math.Max(1,Math.Abs(eyes[1][0]-eyes[0][0])*unit);
        double top=y+Height-Math.Ceiling(spriteSide*.075)-pose.figureHeight*unit;
        int px=(int)Math.Round(pointer.X-x),py=(int)Math.Round(pointer.Y-y);
        return px>=0&&py>=0&&px<surface.Width&&py<surface.Height&&
            Math.Abs(pointer.X-eyeX)<=span*2.1&&pointer.Y>=top-2*unit&&pointer.Y<=eyeY+.59*span&&
            surface.GetPixel(px,py).A>=60;
    }
    void StartPerformance(PetTrick choice){
        if(pressed || dragging || choice==PetTrick.None)return;
        if(choice==PetTrick.Pat && (costume.Performance==null||!costume.Performance.HasPat))return;
        if((choice==PetTrick.Snack||choice==PetTrick.Bow)&&costume.Performance==null)return;
        if((choice==PetTrick.SignatureA||choice==PetTrick.SignatureB)&&costume.Poses.Metadata.gestures==null)return;
        if(performance==PetTrick.None){
            int previousSide=side;bool previousPinned=pinnedPeek;
            if(side!=0)Retrieve();
            performanceEdge=previousSide;performancePinned=previousPinned;
        }
        releaseLook.Stop();
        moving=false;remarkEnd=0;landedAt=-1000;
        performance=choice;performanceStarted=clock.ElapsedMilliseconds;
        Draw(true);Announce();
    }
    void StopPerformance(){performance=PetTrick.None;performanceEdge=0;performancePinned=false;}
    bool TickPerformance(long now){
        if(performance==PetTrick.None)return false;
        int duration=PerformanceDuration();
        if(now-performanceStarted<duration){Draw(false);return true;}
        int edge=performanceEdge;bool pinned=performancePinned;
        StopPerformance();
        if(edge!=0)DockAt(edge,pinned);
        else if(!asleep)StartDayRest();
        else if(nightActivity=="settling")StartSettling();
        else if(nightActivity=="sleepy")nightDeadline=now+2700;
        Draw(true);Announce();return true;
    }
    int PerformanceDuration(){
        if(quiet)return 900;
        switch(performance){
            case PetTrick.SignatureA:return costume.Poses.GestureDuration(0);
            case PetTrick.SignatureB:return costume.Poses.GestureDuration(1);
            case PetTrick.Snack:return Total(SnackHolds);
            case PetTrick.Turn:return Total(TurnHolds);
            case PetTrick.Bow:return Total(BowHolds);
            default:return Total(PatHolds);
        }
    }
    static int Total(int[] holds){int sum=0;foreach(int hold in holds)sum+=hold;return sum;}
    static int Exposure(int[] holds,ref int within){
        int i=0;
        while(i<holds.Length-1 && within>=holds[i])within-=holds[i++];
        return i;
    }
    PetPaintedFrame PerformanceFrame(long now,bool ledge,bool greeting,bool seated){
        if(dragging||side!=0)return null;
        var art=costume.Performance;
        if(performance==PetTrick.None) {
            if(art==null)return null;
            if(ledge)return art[3];
            if(asleep)return art[1];
            if(greeting)return art[0];
            if(seated)return art[2];
            return null;
        }
        int time=(int)Math.Max(0,now-performanceStarted);
        if(performance==PetTrick.SignatureA||performance==PetTrick.SignatureB){
            var pose=costume.Poses;
            var strip=pose.Metadata.gestures;
            var action=strip.actions[performance==PetTrick.SignatureA?0:1];
            int index=action.frames[quiet?3:Exposure(action.durationsMs,ref time)];
            return new PetPaintedFrame(pose.Frame(pose.Metadata.count+index),strip.figureHeight,strip.foot[0],strip.foot[1],400+index);
        }
        if(performance==PetTrick.Pat)return art[quiet?14:PatKeys[Exposure(PatHolds,ref time)]];
        if(performance==PetTrick.Turn){
            int i=quiet?1:Exposure(TurnHolds,ref time);
            string direction=TurnDirections[i];
            var sequence=costume.Frames[direction];
            // Pick separate contact and passing keys in each painted view.
            // Pivot on one spot, allowing only the gait's own shoe lift.
            int step=quiet?0:Math.Min(2,time*3/TurnHolds[i]);
            int frame=(i*2+step)*sequence.Count/9%sequence.Count;
            var image=sequence[frame];
            PetStrip gait;
            if(costume.Gaits.TryGetValue(direction,out gait))
                return new PetPaintedFrame(image,gait.figureHeight,image.Width/2,gait.sole,200+i*32+frame);
            return new PetPaintedFrame(image,image.Height,image.Width/2,image.Height,200+i*32+frame);
        }
        bool snack=performance==PetTrick.Snack;
        var keys=snack?SnackKeys:BowKeys;
        return art[quiet?(snack?6:10):keys[Exposure(snack?SnackHolds:BowHolds,ref time)]];
    }
}
