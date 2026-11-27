using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

internal enum PetTrick { None, Snack, Turn, Bow }

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
    readonly PetPaintedFrame[] frames=new PetPaintedFrame[12];
    public PetPerformanceAtlas(string path){
        const int w=384,h=336;
        try {
            using(var sheet=new Bitmap(path)){
                if(sheet.Width!=w*4 || sheet.Height!=h*3)throw new InvalidDataException("Invalid desktop performance atlas");
                for(int i=0;i<frames.Length;i++){
                    var cell=sheet.Clone(new Rectangle(i%4*w,i/4*h,w,h),PixelFormat.Format32bppPArgb);
                    frames[i]=new PetPaintedFrame(cell,256,192,300,100+i);
                }
            }
        }catch{Dispose();throw;}
    }
    public PetPaintedFrame this[int index]{get{return frames[index];}}
    public void Dispose(){foreach(var frame in frames)if(frame!=null)frame.Image.Dispose();}
}

internal partial class PetWindow {
    PetTrick performance;
    long performanceStarted;
    int performanceEdge;
    bool performancePinned;
    static readonly int[] SnackKeys={4,5,6,7,5,4};
    static readonly int[] SnackHolds={440,115,375,420,115,250};
    static readonly int[] BowKeys={8,9,10,11,8};
    static readonly int[] BowHolds={310,135,570,155,300};
    static readonly string[] TurnDirections={"down","left","up","right","down"};
    static readonly int[] TurnHolds={200,255,300,255,265};

    void AddPerformanceMenu(ContextMenuStrip menu){
        var snack=new ToolStripMenuItem("吃点心",null,delegate{StartPerformance(PetTrick.Snack);});
        var turn=new ToolStripMenuItem("原地转圈",null,delegate{StartPerformance(PetTrick.Turn);});
        var bow=new ToolStripMenuItem("优雅行礼",null,delegate{StartPerformance(PetTrick.Bow);});
        menu.Items.Insert(0,snack);menu.Items.Insert(1,turn);menu.Items.Insert(2,bow);
        menu.Items.Insert(3,new ToolStripSeparator());
        menu.Opening+=delegate{
            snack.Enabled=bow.Enabled=costume.Performance!=null;
            turn.Enabled=costume.Frames.Count==4;
        };
    }
    void StartPerformance(PetTrick choice){
        if(pressed || dragging || choice==PetTrick.None)return;
        if(choice!=PetTrick.Turn && costume.Performance==null)return;
        if(performance==PetTrick.None){
            int previousSide=side;bool previousPinned=pinnedPeek;
            if(side!=0)Retrieve();
            performanceEdge=previousSide;performancePinned=previousPinned;
        }
        releaseLook.Stop();
        moving=false;dockOnArrival=false;remarkEnd=0;landedAt=-1000;
        performance=choice;performanceStarted=clock.ElapsedMilliseconds;
        Draw(true);Announce();
    }
    void StopPerformance(){performance=PetTrick.None;performanceEdge=0;performancePinned=false;}
    bool TickPerformance(long now){
        if(performance==PetTrick.None)return false;
        int duration=quiet?900:performance==PetTrick.Snack?1715:performance==PetTrick.Bow?1470:1275;
        if(now-performanceStarted<duration){Draw(false);return true;}
        int edge=performanceEdge;bool pinned=performancePinned;
        StopPerformance();
        if(edge!=0)DockAt(edge,pinned);
        else if(!asleep)StartDayRest();
        else if(nightActivity=="settling")StartSettling();
        else if(nightActivity=="sleepy")nightDeadline=now+2700;
        Draw(true);Announce();return true;
    }
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
