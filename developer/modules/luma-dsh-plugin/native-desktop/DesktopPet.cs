using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class PetStrip {
    public string path, gaitPath;
    public int[] cell, durations;
    public int columns;
    public int frameWidth, frameHeight, frameCount;
    public int[] frameDurationsMs;
}

public class PetCommand {
    public string action, roleId, skinId, peek, sleep, ledge, sleepyPose, greet, lunchPose;
    public Dictionary<string, PetStrip> strips;
    public bool atCursor, reduceMotion, asleep, sleepMirror, lunch;
    public long[] peers;
    public double sleepAngle;
    public int nightSlot;
}

internal static class DesktopPet {
    [STAThread]
    static int Main() {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch (EntryPointNotFoundException) { Native.SetProcessDPIAware(); }
            var json = new JavaScriptSerializer();
            var first = json.Deserialize<PetCommand>(Console.ReadLine());
            if (first == null || first.action != "open") return 1;
            Application.EnableVisualStyles();
            using (var pet = new PetWindow(first)) {
                pet.Shown += delegate {
                    var reader = new Thread(delegate() {
                        try {
                            string line;
                            while ((line = Console.ReadLine()) != null) {
                                var command = json.Deserialize<PetCommand>(line);
                                pet.BeginInvoke(new Action(delegate { pet.Dispatch(command); }));
                            }
                        } catch (Exception) { }
                        try { pet.BeginInvoke(new Action(pet.Close)); } catch (InvalidOperationException) { }
                    });
                    reader.IsBackground = true;
                    reader.Start();
                };
                Application.Run(pet);
            }
            return 0;
        } catch(Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}

internal class Costume : IDisposable {
    public Dictionary<string,List<Bitmap>> Frames = new Dictionary<string,List<Bitmap>>();
    public Dictionary<string,int[]> Durations = new Dictionary<string,int[]>();
    public Bitmap Peek,Sleep,Sleepy,Greeting,Lunch;
    static Bitmap ReadPose(string path) {
        if(String.IsNullOrEmpty(path))return null;
        using(var pose=new Bitmap(path))return Sample(pose,Visible(pose),256);
    }
    static Bitmap ReadGait(string path) {
        using(var stream=File.OpenRead(path)) {
            var decoder=System.Windows.Media.Imaging.BitmapDecoder.Create(stream,System.Windows.Media.Imaging.BitmapCreateOptions.None,System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
            var pixels=new System.Windows.Media.Imaging.FormatConvertedBitmap(decoder.Frames[0],System.Windows.Media.PixelFormats.Pbgra32,null,0);
            var bmp=new Bitmap(pixels.PixelWidth,pixels.PixelHeight,PixelFormat.Format32bppPArgb);
            var dest=bmp.LockBits(new Rectangle(Point.Empty,bmp.Size),ImageLockMode.WriteOnly,bmp.PixelFormat);
            try { pixels.CopyPixels(System.Windows.Int32Rect.Empty,dest.Scan0,dest.Stride*bmp.Height,dest.Stride); }
            finally { bmp.UnlockBits(dest); }
            return bmp;
        }
    }
    static Bitmap Rest(PetCommand command) {
        using(var source=new Bitmap(command.sleep))
        using(var sprite=Sample(source,Visible(source),320))
        using(var canvas=new Bitmap(520,520,PixelFormat.Format32bppPArgb)) {
            using(var g=Graphics.FromImage(canvas)) {
                g.InterpolationMode=InterpolationMode.HighQualityBicubic;
                g.TranslateTransform(260,260);
                g.RotateTransform((float)command.sleepAngle);
                g.ScaleTransform(command.sleepMirror?-1:1,1);
                g.DrawImage(sprite,-sprite.Width/2,-sprite.Height/2,sprite.Width,sprite.Height);
            }
            return Sample(canvas,Visible(canvas),256);
        }
    }
    public Costume(PetCommand command) {
        try {
            foreach (var pair in command.strips) {
                var meta=pair.Value;
                Frames[pair.Key]=new List<Bitmap>();
                Durations[pair.Key]=meta.frameDurationsMs ?? new int[0];
                if(!String.IsNullOrEmpty(meta.gaitPath)) {
                    Bitmap gait=null;
                    try { gait=ReadGait(meta.gaitPath); }
                    catch(NotSupportedException) { } // Some older Windows installs have no WebP codec.
                    catch(System.Runtime.InteropServices.COMException) { }
                    catch(System.IO.FileFormatException) { }
                    if(gait!=null) using(gait) {
                        Durations[pair.Key]=meta.durations;
                        int count=pair.Key=="down"?1:meta.durations.Length;
                        for(int i=0;i<count;i++) {
                            var cell=new Rectangle(i%meta.columns*meta.cell[0],i/meta.columns*meta.cell[1],meta.cell[0],meta.cell[1]);
                            Frames[pair.Key].Add(gait.Clone(cell,PixelFormat.Format32bppPArgb));
                        }
                        continue;
                    }
                }
                using (var sheet=new Bitmap(meta.path)) {
                    var boxes=new List<Rectangle>();
                    Rectangle union=Rectangle.Empty;
                    int columns=sheet.Width/meta.frameWidth;
                    for(int i=0;i<meta.frameCount;i++) {
                        var cell=new Rectangle((i%columns)*meta.frameWidth,(i/columns)*meta.frameHeight,meta.frameWidth,meta.frameHeight);
                        boxes.Add(cell);
                        using (var original=sheet.Clone(cell,PixelFormat.Format32bppArgb)) {
                            var bounds=Visible(original);
                            union=union.IsEmpty?bounds:Rectangle.Union(union,bounds);
                        }
                    }
                    if (union.IsEmpty) throw new InvalidDataException("Missing sprite pixels.");
                    foreach(var cell in boxes) {
                        var source=union; source.Offset(cell.Location);
                        Frames[pair.Key].Add(Sample(sheet,source,256));
                    }
                }
            }
            using(var peek=new Bitmap(command.peek)) { Peek=Sample(peek,Visible(peek),224); }
            if(String.IsNullOrEmpty(command.ledge)) Sleep=Rest(command);
            else using(var pose=new Bitmap(command.ledge)) Sleep=Sample(pose,Visible(pose),256);
            Sleepy=ReadPose(command.sleepyPose);Greeting=ReadPose(command.greet);Lunch=ReadPose(command.lunchPose);
        } catch { Dispose(); throw; }
    }
    static Rectangle Visible(Bitmap image) {
        // Scan the original alpha once. Each frame uses the union for its animation to keep feet anchored.
        var rect=new Rectangle(0,0,image.Width,image.Height);
        var data=image.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        try {
            int left=image.Width,right=-1,top=image.Height,bottom=-1;
            var row=new byte[image.Width*4];
            for(int y=0;y<image.Height;y++) {
                Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),row,0,row.Length);
                for(int x=0;x<image.Width;x++) if(row[4*x+3]>=20) {
                    if(x<left)left=x; if(x>right)right=x;
                    if(y<top)top=y; if(y>bottom)bottom=y;
                }
            }
            return right<0?Rectangle.Empty:Rectangle.FromLTRB(left,top,right+1,bottom+1);
        } finally { image.UnlockBits(data); }
    }
    static Bitmap Sample(Bitmap sheet,Rectangle src,int size) {
        if(src.IsEmpty)throw new InvalidDataException("Empty pet picture.");
        double scale=(double)size/Math.Max(src.Width,src.Height);
        var bmp=new Bitmap(Math.Max(1,(int)Math.Round(src.Width*scale)),Math.Max(1,(int)Math.Round(src.Height*scale)),PixelFormat.Format32bppPArgb);
        using(var g=Graphics.FromImage(bmp)) {
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode=PixelOffsetMode.HighQuality;
            g.DrawImage(sheet,new Rectangle(0,0,bmp.Width,bmp.Height),src,GraphicsUnit.Pixel);
        }
        return bmp;
    }
    public void Dispose() {
        foreach(var list in Frames.Values)foreach(var sprite in list)sprite.Dispose();
        foreach(var pose in new[]{Peek,Sleep,Sleepy,Greeting,Lunch})if(pose!=null)pose.Dispose();
    }
}

internal class PetWindow : Form {
    const int SideLength=184;
    readonly Random rng=new Random(Guid.NewGuid().GetHashCode());
    readonly Stopwatch clock=Stopwatch.StartNew();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    Costume costume;
    Bitmap surface;
    Screen display;
    bool quiet, dragging, pressed, dockOnArrival, moving, asleep;
    bool lunch;
    long[] peers;
    string dayActivity="awake";
    string activeSkin;
    readonly string dayLine;
    long nextHello;
    double gripX,gripY;
    int side, renderStamp = -1;
    Point lastPosition=new Point(int.MinValue,int.MinValue);
    long next, started, duration, dockStart;
    double x,y,fromX,toX;
    Point pressedAt;
    string phase="field", lastState="";
    string nightActivity="awake", remark="";
    readonly string[] nightLines;
    readonly int cadence;
    readonly int nightSlot;
    static readonly int[] LedgeSeats={5,2,7,0,4,1,6,3};
    static readonly Dictionary<string,string> Greetings=new Dictionary<string,string>{
        {"jingyuniang","小鲸鱼报到。找我呀？"},{"shan","喵，给你碰个爪。"},{"lu-mi","收到，我在这儿。"},
        {"bai-shuangming","轻一点，蝶儿歇着呢。"},{"claude","今天也见到你啦！"},{"longmama","尾巴也跟你打个招呼。"},
        {"gemini","信号清楚，我在。"},{"grok","哟，被你捉到啦！"}
    };
    int nextLine;
    long nightDeadline, gestureStart, remarkEnd;
    double settleFrom,settleFromX,settleToX;
    readonly Font petFont=new Font("Microsoft YaHei UI",12f,FontStyle.Regular,GraphicsUnit.Pixel);
    // These quiet gestures and phrases belong to the individual, regardless of outfit.
    static readonly Dictionary<string,string[]> NightLines=new Dictionary<string,string[]> {
        {"jingyuniang",new[]{"唔……浪花都睡了呀。","我趴一小会儿哦。","你也早点休息呀。"}},
        {"shan",new[]{"喵……再眯五分钟。","爪爪都困软了。","陪你，就一小会儿。"}},
        {"lu-mi",new[]{"灯还亮着？都几点啦。","借个角落，眯一会。","困了就一起收工吧。"}},
        {"bai-shuangming",new[]{"嘘……蝴蝶也歇翅了。","等我缓过这个哈欠。","手臂借我枕一下。"}},
        {"claude",new[]{"哈啊……花也要睡觉。","明早再讲给我听嘛。","我在听，眼皮有点重。"}},
        {"longmama",new[]{"小声点，龙也要睡的。","尾巴都快睡着啦。","让我打个小盹吧。"}},
        {"gemini",new[]{"还在线……声音小点。","星星也该轮班了。","我先合一下眼。"}},
        {"grok",new[]{"谁把小蝙蝠叫醒啦？","翅膀借我当被子。","就再陪你三分钟。"}}
    };
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
        get {
            var cp=base.CreateParams;
            cp.ExStyle |= 0x80000 | 0x80 | 0x08000000; // layered, tool window, no activate
            return cp;
        }
    }
    internal PetWindow(PetCommand cmd) {
        Text="Luma Desktop Pet - "+cmd.roleId;
        AutoScaleMode=AutoScaleMode.None; FormBorderStyle=FormBorderStyle.None; ShowInTaskbar=false; TopMost=true;
        StartPosition=FormStartPosition.Manual;
        var summonAt=Cursor.Position;
        costume=new Costume(cmd);
        quiet=cmd.reduceMotion;asleep=cmd.asleep;lunch=cmd.lunch;activeSkin=cmd.skinId;peers=cmd.peers??new long[0];
        if(!Greetings.TryGetValue(cmd.roleId,out dayLine))dayLine=Greetings["jingyuniang"];
        nightSlot=Bound(cmd.nightSlot,0,LedgeSeats.Length-1);
        if(!NightLines.TryGetValue(cmd.roleId,out nightLines)) nightLines=NightLines["jingyuniang"];
        cadence=700+Array.IndexOf(new[]{"jingyuniang","shan","lu-mi","bai-shuangming","claude","longmama","gemini","grok"},cmd.roleId)*41;
        PickStart(cmd.atCursor,summonAt);
        if(asleep)StartSleepy();
        else if(lunch)StartDayRest();
        else Greet(true);
        var menu=new ContextMenuStrip();
        menu.Items.Add("从左侧探头",null,delegate { DockAt(-1); });
        menu.Items.Add("从右侧探头",null,delegate { DockAt(1); });
        menu.Items.Add("回到桌面",null,delegate { Retrieve(); });
        menu.Items.Add("回到房间",null,delegate { Close(); });
        menu.Opening+=delegate {
            menu.Items[0].Text=asleep?"到左下角打盹":"从左侧探头";
            menu.Items[1].Text=asleep?"到右下角打盹":"从右侧探头";
            menu.Items[2].Text=asleep?"轻声叫她":"回到桌面";
        };
        ContextMenuStrip=menu;
        timer.Interval=40;
        timer.Tick+=delegate { Tick(); };
        Shown+=delegate { Tick(); Announce(); timer.Start(); };
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged+=ScreenChanged;
    }
    void ScreenChanged(object sender,EventArgs args) {
        try { BeginInvoke(new Action(delegate {
            display=Screen.FromPoint(new Point((int)x+Width/2,(int)y+Height/2));
            ResizeForScreen();
            Clamp();
            if(asleep&&nightActivity=="dozing") {y=display.WorkingArea.Bottom-Height;FindSpace(false,true);}
            else if(asleep&&nightActivity=="settling")StartSettling();
            else if(side!=0)DockAt(side);
            else { moving=false; next=clock.ElapsedMilliseconds+1800; }
            Draw(true);
        })); } catch(InvalidOperationException) { }
    }
    static int Bound(int v,int a,int b) { return Math.Max(a,Math.Min(v,b)); }
    static double Ease(double t) { t=Math.Max(0,Math.Min(t,1));return t*t*(3-2*t); }
    void ResizeForScreen() {
        int dpi=96;
        try {
            uint dx,dy;
            var at=display.WorkingArea.Location; at.Offset(1,1);
            if(Native.GetDpiForMonitor(Native.MonitorFromPoint(at,2),0,out dx,out dy)==0) dpi=(int)dx;
        } catch(EntryPointNotFoundException) {} catch(DllNotFoundException) {}
        int n=Bound(SideLength*dpi/96,128,440);
        if(surface!=null&&n==Width)return;
        Size=new Size(n,n);
        if(surface!=null)surface.Dispose();
        surface=new Bitmap(n,n,PixelFormat.Format32bppPArgb);
        renderStamp=-1;
    }
    void PickStart(bool atCursor,Point mouse) {
        display=Screen.FromPoint(mouse); ResizeForScreen();
        var a=display.WorkingArea;
        x=atCursor?mouse.X-Width/2:a.Left+(a.Width-Width)*(LedgeSeats[nightSlot]/7.0);
        y=atCursor?mouse.Y-Height/2:a.Bottom-Height-rng.Next(16,95);
        side=0; phase="field"; moving=false;
        next=clock.ElapsedMilliseconds+(quiet?11000:rng.Next(2200,5200));
        Clamp();FindSpace(false,false); Location=new Point((int)x,(int)y);
    }
    void Clamp() {
        var a=display.WorkingArea;
        x=Bound((int)x,a.Left,a.Right-Width); y=Bound((int)y,a.Top,a.Bottom-Height);
    }
    List<Rectangle> Others() {
        var list=new List<Rectangle>();
        foreach(long hwnd in peers){
            Rectangle r=Native.BoundsOf(new IntPtr(hwnd));
            if(!r.IsEmpty && r.IntersectsWith(display.WorkingArea))list.Add(r);
        }
        return list;
    }
    // Candidate positions touch an obstacle boundary or the user's chosen point.
    // Prefer zero overlap, then the nearest location. Side peeks retain their edge.
    internal static Point FreeSpot(Rectangle area,Size size,Point desired,List<Rectangle> others,bool lockX,bool lockY) {
        int maxX=Math.Max(area.Left,area.Right-size.Width),maxY=Math.Max(area.Top,area.Bottom-size.Height);
        desired=new Point(Bound(desired.X,area.Left,maxX),Bound(desired.Y,area.Top,maxY));
        if(others.Count==0)return desired;
        var xs=new List<int>{desired.X};var ys=new List<int>{desired.Y};
        int gap=Math.Max(2,size.Width/60);
        if(!lockX){xs.Add(area.Left);xs.Add(maxX);}
        if(!lockY){ys.Add(area.Top);ys.Add(maxY);}
        foreach(var r in others){
            if(!lockX){xs.Add(Bound(r.Left-size.Width-gap,area.Left,maxX));xs.Add(Bound(r.Right+gap,area.Left,maxX));}
            if(!lockY){ys.Add(Bound(r.Top-size.Height-gap,area.Top,maxY));ys.Add(Bound(r.Bottom+gap,area.Top,maxY));}
        }
        long bestCover=long.MaxValue,bestDistance=long.MaxValue;Point best=desired;
        foreach(int cx in xs)foreach(int cy in ys){
            var at=new Point(cx,cy);var rect=new Rectangle(at,size);long cover=0;
            foreach(var r in others){var overlap=Rectangle.Intersect(rect,r);cover+=(long)overlap.Width*overlap.Height;}
            long dx=cx-(long)desired.X,dy=cy-(long)desired.Y,dist=dx*dx+dy*dy;
            if(cover<bestCover || cover==bestCover && dist<bestDistance){bestCover=cover;bestDistance=dist;best=at;}
        }
        return best;
    }
    void FindSpace(bool lockX,bool lockY) {
        var nextPoint=FreeSpot(display.WorkingArea,Size,new Point((int)x,(int)y),Others(),lockX,lockY);
        x=nextPoint.X;y=nextPoint.Y;
    }
    void Announce() {
        string activity=asleep?nightActivity:dayActivity;
        string state=phase+"."+side+"."+activity+"."+activeSkin;
        if(state==lastState)return;
        lastState=state;
        Console.WriteLine(new JavaScriptSerializer().Serialize(new {mode=phase,side=side==0?null:side<0?"left":"right",activity=activity,windowId=Handle.ToInt64(),skinId=activeSkin}));
        Console.Out.Flush();
    }
    internal void Dispatch(PetCommand cmd) {
        if(cmd==null)return;
        if(cmd.action=="quit") {Close();return;}
        if(cmd.action=="peers") {peers=cmd.peers??new long[0];return;}
        if(cmd.action=="motion") {
            quiet=cmd.reduceMotion;
            if(quiet){moving=false;if(asleep&&nightActivity=="settling")StartSettling();}
            Draw(true);return;
        }
        if(cmd.action=="clock") {
            if(asleep==cmd.asleep&&lunch==cmd.lunch)return;
            asleep=cmd.asleep;lunch=cmd.lunch;
            if(asleep) StartSleepy();
            else {nightActivity="awake";side=0;phase="field";StartDayRest();}
            Clamp();Draw(true);Announce();return;
        }
        if(cmd.action=="outfit") {
            try {
                var replacement=new Costume(cmd);
                var old=costume;costume=replacement;activeSkin=cmd.skinId;old.Dispose();
            } catch(Exception ex) {
                Console.Error.WriteLine("Cannot change desktop costume: "+ex.Message);
                lastState="";Announce();return;
            }
        } else if(cmd.action=="show") {
            quiet=cmd.reduceMotion;
            if(cmd.atCursor) {PickStart(true,Cursor.Position);if(asleep)StartSleepy();else Greet(true);}
            else Retrieve();
        }
        Draw(true);Announce();
    }
    void Retrieve() {
        if(side!=0) {
            var a=display.WorkingArea;
            x=side<0?a.Left+Width*0.48:a.Right-Width*1.48;
        }
        side=0;phase="field";moving=false;next=clock.ElapsedMilliseconds+rng.Next(4300,7500);
        if(asleep)StartSleepy();else Greet(true);
        Clamp();FindSpace(false,false);Draw(true);Announce();
    }
    void StartDayRest(){
        dayActivity=lunch?"lunch":"awake";moving=false;remarkEnd=0;
        long now=clock.ElapsedMilliseconds;
        next=now+rng.Next(2400,5100);nextHello=now+rng.Next(70000,115000)+nightSlot*2000;
    }
    void Greet(bool speak){
        dayActivity="greeting";moving=false;gestureStart=clock.ElapsedMilliseconds;
        next=gestureStart+(speak?2600:1550);remark=dayLine;remarkEnd=speak?next:0;
    }
    void Murmur() {
        gestureStart=clock.ElapsedMilliseconds;
        remark=nightLines[nextLine++%nightLines.Length];
        remarkEnd=gestureStart+3400;
    }
    void StartSleepy() {
        side=0;phase="field";moving=false;nightActivity="sleepy";
        Murmur();nightDeadline=gestureStart+4500;
    }
    void StartSettling() {
        nightActivity="settling";settleFrom=y;settleFromX=x;started=clock.ElapsedMilliseconds;
        var desired=new Point((int)x,display.WorkingArea.Bottom-Height);
        settleToX=FreeSpot(display.WorkingArea,Size,desired,Others(),false,true).X;
        double gap=Math.Abs(display.WorkingArea.Bottom-Height-y);
        duration=quiet?0:(long)Math.Min(2700,Math.Max(650,gap*5));
    }
    void NightTick(long now) {
        if(nightActivity=="sleepy" && now>=nightDeadline)StartSettling();
        if(nightActivity=="settling") {
            double t=duration==0?1:Math.Min(1,(now-started)/(double)duration);
            int edge=display.WorkingArea.Bottom-Height;
            x=settleFromX+(settleToX-settleFromX)*Ease(t);
            y=settleFrom+(edge-settleFrom)*Ease(t);
            if(t>=1){y=edge;FindSpace(false,true);nightActivity="dozing";nightDeadline=now+rng.Next(49000,78000);}
        } else if(nightActivity=="dozing" && now>=nightDeadline) {
            Murmur();nightDeadline=now+rng.Next(65000,92000);
        }
        Draw(false);Announce();
    }
    void DockAt(int dir) {
        if(asleep) {
            var work=display.WorkingArea;
            x=dir<0?work.Left:work.Right-Width;
            StartSettling();NightTick(clock.ElapsedMilliseconds);return;
        }
        side=dir;moving=false;phase="peeking";dockStart=clock.ElapsedMilliseconds;
        dayActivity="awake";remarkEnd=0;
        var a=display.WorkingArea;
        x=side<0?a.Left:a.Right-Width;Clamp();FindSpace(true,false);Draw(true);Announce();
    }
    void Tick() {
        long now=clock.ElapsedMilliseconds;
        if(pressed||ContextMenuStrip.Visible)return;
        if(asleep) {NightTick(now);return;}
        if(side==0 && !dragging && dayActivity=="greeting") {
            if(now>=next)StartDayRest();
            Draw(false);Announce();return;
        }
        if(side==0 && !dragging && dayActivity=="lunch"){Draw(false);Announce();return;}
        if(side!=0) {
            if(quiet){phase="peeking";Draw(false);Announce();return;}
            long elapsed=now-dockStart;
            if(elapsed>=12500) {
                if(rng.NextDouble()<0.5) {Retrieve();return;}
                dockStart=now;elapsed=0;
            }
            phase=elapsed>=8100?"hidden-edge":"peeking";
        } else if(moving) {
            double t=(now-started)/(double)duration;
            double proposed=fromX+(toX-fromX)*Ease(t);
            var projected=new Rectangle((int)proposed,(int)y,Width,Height);
            if(proposed!=x && Others().Exists(r=>r.IntersectsWith(projected))) {
                moving=false;next=now+rng.Next(2700,4800);Draw(false);return;
            }
            x=proposed;
            if(t>=1) {
                x=toX;moving=false;
                if(dockOnArrival) {DockAt(toX<fromX?-1:1);return;}
                next=now+rng.Next(2200,5500);
            }
        } else if(!quiet && now>=nextHello) {
            Greet(false);
        } else if(!quiet && now>=next) {
            var a=display.WorkingArea;
            int nearest=x+Width/2<a.Left+a.Width/2?-1:1;
            dockOnArrival=rng.NextDouble()<0.48;
            toX=dockOnArrival?(nearest<0?a.Left:a.Right-Width):Bound((int)x + rng.Next(-Width,Width+1),a.Left,a.Right-Width);
            fromX=x; duration=(long)(1000*Math.Abs(toX-fromX)/(Width*0.46))+600;started=now;
            moving=true;
        }
        Draw(false);Announce();
    }
    double Reveal(long ms) {
        if(quiet)return .74;
        if(ms<800)return .14+.15*Ease(ms/800.0);
        if(ms<1600)return .29;
        if(ms<2600)return .29+.58*Ease((ms-1600)/1000.0);
        if(ms<3200)return .87-.07*Ease((ms-2600)/600.0);
        if(ms<6150)return .80+.014*Math.Sin((ms-3200)/650.0);
        if(ms<7300)return .80-.47*Ease((ms-6150)/1150.0);
        if(ms<7700)return .33;
        if(ms<8100)return .33-.16*Ease((ms-7700)/400.0);
        return .17;
    }
    void Draw(bool force) {
        if(surface==null || !IsHandleCreated)return;
        long now=clock.ElapsedMilliseconds;
        string direction=moving?(toX<fromX?"left":"right"):"down";
        int frame=0;
        if(moving&&!quiet) {
            var durations=costume.Durations[direction];
            if(durations.Length==costume.Frames[direction].Count) {
                int total=0;foreach(int n in durations)total+=Math.Max(1,n);
                long withinFrame=(now-started)%total;
                while(frame<durations.Length-1&&withinFrame>=durations[frame]) withinFrame-=Math.Max(1,durations[frame++]);
            } else frame=(int)(((now-started)/125)%costume.Frames[direction].Count);
        }
        bool onLedge=asleep&&nightActivity=="dozing";
        bool greeting=!asleep&&side==0&&dayActivity=="greeting"&&!dragging;
        bool seated=!asleep&&side==0&&dayActivity=="lunch"&&!dragging;
        bool speaking=now<remarkEnd;
        var bitmap=onLedge?costume.Sleep:asleep&&costume.Sleepy!=null?costume.Sleepy
            :greeting&&costume.Greeting!=null?costume.Greeting:seated&&costume.Lunch!=null?costume.Lunch
            :side==0?costume.Frames[direction][frame]:costume.Peek;
        double scale=Width*(onLedge?.76:asleep||greeting?.79:seated?.73:side==0?.91:.80)/Math.Max(bitmap.Width,bitmap.Height);
        int w=(int)(bitmap.Width*scale),h=(int)(bitmap.Height*scale);
        int left=(Width-w)/2,top=Height-h-(onLedge?0:5),tilt=0;
        if(asleep&&!quiet&&!dragging) {
            int breathing=(int)Math.Round(h*.012*Math.Sin(now/(double)cadence));
            top-=breathing; h+=breathing;
            if(speaking) {
                double progress=Math.Min(1,(now-gestureStart)/1600.0);
                tilt=(int)Math.Round(Math.Sin(progress*Math.PI*2)*(1-progress)*7);
            } else if(onLedge) {
                double nod=(now%(cadence*15))/(double)cadence;
                if(nod<2)tilt=(int)Math.Round(3*Math.Sin(nod*Math.PI/2));
            }
        }
        if(side!=0) {
            int show=(int)(w*Reveal(now-dockStart));
            left=side<0?show-w:Width-show;
        } else if(!moving&&!quiet&&!dragging&&!asleep) top-=(int)Math.Round(1+Math.Sin(now/760.0));
        if(greeting&&!quiet) {
            double t=Math.Min(1,(now-gestureStart)/900.0);
            tilt=(int)Math.Round(4*Math.Sin(2*Math.PI*t)*(1-t));
        }
        int stamp=unchecked((((direction.GetHashCode()*31+frame)*31+left)*31+top)*3+side);
        stamp=unchecked(stamp*31+tilt);
        stamp=unchecked(stamp*31+nightActivity.GetHashCode()+(speaking?remark.GetHashCode():0));
        stamp=unchecked(stamp*31+dayActivity.GetHashCode());
        var pos=new Point((int)Math.Round(x),(int)Math.Round(y));
        if(!force&&stamp==renderStamp&&pos==lastPosition)return;
        if(!force&&stamp==renderStamp) {Native.Move(Handle,pos);lastPosition=pos;return;}
        using(var g=Graphics.FromImage(surface)) {
            g.Clear(Color.Transparent);
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;
            var before=g.Save();
            if(side>0) {g.TranslateTransform(left+w,top);g.ScaleTransform(-1,1);left=0;top=0;}
            if(tilt!=0) {
                float px=Width*.5f,py=top+h*(onLedge?.91f:.85f);
                g.TranslateTransform(px,py);g.RotateTransform(tilt);g.TranslateTransform(-px,-py);
            }
            g.DrawImage(bitmap,new Rectangle(left,top,w,h));
            g.Restore(before);
            if(speaking)DrawRemark(g,top);
        }
        Native.Draw(Handle,surface,pos);renderStamp=stamp;lastPosition=pos;
    }
    void DrawRemark(Graphics g,int headY) {
        float dpi=Width/(float)SideLength;
        g.ScaleTransform(dpi,dpi);
        g.SmoothingMode=SmoothingMode.AntiAlias;
        g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        using(var format=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center})
        using(var fill=new SolidBrush(Color.FromArgb(245,248,251,255)))
        using(var ink=new SolidBrush(Color.FromArgb(255,43,61,87)))
        using(var stroke=new Pen(Color.FromArgb(210,141,171,196)))
        using(var path=new GraphicsPath()) {
            float width=Math.Min(SideLength-4,g.MeasureString(remark,petFont).Width+16);
            float x=(SideLength-width)/2,y=Math.Max(1,headY/dpi-30),height=24,round=12;
            path.AddArc(x,y,round,round,180,90);path.AddArc(x+width-round,y,round,round,270,90);
            path.AddArc(x+width-round,y+height-round,round,round,0,90);
            path.AddLine(x+width*.57f,y+height,x+width*.54f,y+height+4);
            path.AddLine(x+width*.54f,y+height+4,x+width*.51f,y+height);
            path.AddArc(x,y+height-round,round,round,90,90);path.CloseFigure();
            g.FillPath(fill,path);g.DrawPath(stroke,path);
            g.DrawString(remark,petFont,ink,new RectangleF(x,y,width,height),format);
        }
    }
    protected override void OnMouseDown(MouseEventArgs e) {
        base.OnMouseDown(e);if(e.Button!=MouseButtons.Left)return;
        pressed=true;dragging=false;pressedAt=Cursor.Position;
        gripX=side==0?Math.Max(0,Math.Min(1,(pressedAt.X-x)/Width)):.5;
        gripY=Math.Max(0,Math.Min(1,(pressedAt.Y-y)/Height));Capture=true;
    }
    protected override void OnMouseMove(MouseEventArgs e) {
        base.OnMouseMove(e);if(!pressed)return;
        var p=Cursor.Position;
        int dx=p.X-pressedAt.X,dy=p.Y-pressedAt.Y;
        if(!dragging && Math.Abs(dx)+Math.Abs(dy)<5)return;
        dragging=true;side=0;phase="field";moving=false;
        remarkEnd=0;if(asleep)nightActivity="sleepy";else dayActivity="awake";
        Screen target=Screen.FromPoint(p);
        if(display.DeviceName!=target.DeviceName) {
            display=target;ResizeForScreen();
        }
        x=p.X-gripX*Width;y=p.Y-gripY*Height;
        Clamp();Draw(false);Announce();
    }
    protected override void OnMouseUp(MouseEventArgs e) {
        base.OnMouseUp(e);if(e.Button!=MouseButtons.Left||!pressed)return;
        pressed=false;Capture=false;
        if(asleep) {
            bool wasDragged=dragging;
            dragging=false;
            if(wasDragged && Math.Abs(y-(display.WorkingArea.Bottom-Height))<Height*.14)StartSettling();
            else StartSleepy();
            NightTick(clock.ElapsedMilliseconds);return;
        }
        if(!dragging&&side!=0){Retrieve();return;}
        if(dragging) {
            var a=display.WorkingArea;
            dragging=false;StartDayRest();
            if(Cursor.Position.X<a.Left+16)DockAt(-1);
            else if(Cursor.Position.X>a.Right-16)DockAt(1);
            else FindSpace(false,false);
        } else Greet(true);
        Draw(true);Announce();
    }
    protected override void OnMouseCaptureChanged(EventArgs e) {
        base.OnMouseCaptureChanged(e);
        if(pressed && !Capture){pressed=false;dragging=false;if(asleep)StartSleepy();else StartDayRest();FindSpace(false,false);}
    }
    protected override void WndProc(ref Message m) {
        if(m.Msg==0x21) {m.Result=new IntPtr(3);return;} // MA_NOACTIVATE
        base.WndProc(ref m);
    }
    protected override void Dispose(bool disposing) {
        if(disposing) {
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged-=ScreenChanged;
            timer.Dispose();petFont.Dispose();if(ContextMenuStrip!=null)ContextMenuStrip.Dispose();
            if(surface!=null)surface.Dispose();if(costume!=null)costume.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal static class Native {
    [StructLayout(LayoutKind.Sequential)] struct WindowRect {public int Left,Top,Right,Bottom;}
    [DllImport("user32")] static extern bool GetWindowRect(IntPtr hwnd,out WindowRect bounds);
    internal static Rectangle BoundsOf(IntPtr hwnd) {
        WindowRect rect;
        return GetWindowRect(hwnd,out rect)?Rectangle.FromLTRB(rect.Left,rect.Top,rect.Right,rect.Bottom):Rectangle.Empty;
    }
    [DllImport("user32")] static extern bool SetWindowPos(IntPtr window,IntPtr above,int x,int y,int w,int h,uint flags);
    internal static void Move(IntPtr window,Point pos) { SetWindowPos(window,IntPtr.Zero,pos.X,pos.Y,0,0,0x15); }
    [StructLayout(LayoutKind.Sequential,Pack=1)] struct Blend {public byte Op,Flags,Alpha,AlphaFormat;}
    [DllImport("user32")] internal static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32")] internal static extern bool SetProcessDPIAware();
    [DllImport("user32")] internal static extern IntPtr MonitorFromPoint(Point point,uint flags);
    [DllImport("shcore")] internal static extern int GetDpiForMonitor(IntPtr monitor,int type,out uint x,out uint y);
    [DllImport("user32")] static extern IntPtr GetDC(IntPtr handle);
    [DllImport("user32")] static extern int ReleaseDC(IntPtr handle,IntPtr context);
    [DllImport("gdi32")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
    [DllImport("gdi32")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("user32",SetLastError=true)] static extern bool UpdateLayeredWindow(IntPtr window,IntPtr screen,ref Point position,ref Size size,IntPtr src,ref Point source,uint color,ref Blend blend,uint flags);
    internal static void Draw(IntPtr win,Bitmap bitmap,Point pos) {
        IntPtr screen=GetDC(IntPtr.Zero),dc=CreateCompatibleDC(screen),picture=IntPtr.Zero,old=IntPtr.Zero;
        try {
            picture=bitmap.GetHbitmap(Color.FromArgb(0));old=SelectObject(dc,picture);
            var origin=Point.Empty;var size=bitmap.Size;var blend=new Blend{Alpha=255,AlphaFormat=1};
            if(!UpdateLayeredWindow(win,screen,ref pos,ref size,dc,ref origin,0,ref blend,2))throw new System.ComponentModel.Win32Exception();
        } finally {
            if(old!=IntPtr.Zero)SelectObject(dc,old);
            if(picture!=IntPtr.Zero)DeleteObject(picture);
            DeleteDC(dc);ReleaseDC(IntPtr.Zero,screen);
        }
    }
}
