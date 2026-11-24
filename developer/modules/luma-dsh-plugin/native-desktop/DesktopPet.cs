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
    public string action, roleId, peek, sleep;
    public Dictionary<string, PetStrip> strips;
    public bool atCursor, reduceMotion, asleep, sleepMirror;
    public double sleepAngle;
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
    public Bitmap Peek,Sleep;
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
            Sleep=Rest(command);
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
        if(Peek!=null)Peek.Dispose();if(Sleep!=null)Sleep.Dispose();
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
    int side, renderStamp = -1;
    Point lastPosition=new Point(int.MinValue,int.MinValue);
    long next, started, duration, dockStart;
    double x,y,fromX,toX;
    Point pressedAt, startPosition;
    string phase="field", lastState="";
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
        costume=new Costume(cmd);
        quiet=cmd.reduceMotion;asleep=cmd.asleep;
        PickStart(cmd.atCursor);
        var menu=new ContextMenuStrip();
        menu.Items.Add("从左侧探头",null,delegate { DockAt(-1); });
        menu.Items.Add("从右侧探头",null,delegate { DockAt(1); });
        menu.Items.Add("回到桌面",null,delegate { Retrieve(); });
        menu.Items.Add("回到房间",null,delegate { Close(); });
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
            if(side!=0)DockAt(side);
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
    void PickStart(bool atCursor) {
        var mouse=Cursor.Position;
        display=Screen.FromPoint(mouse); ResizeForScreen();
        var a=display.WorkingArea;
        x=atCursor?mouse.X-Width/2:a.Right-Width-rng.Next(45,155);
        y=atCursor?mouse.Y-Height/2:a.Bottom-Height-rng.Next(16,95);
        side=0; phase="field"; moving=false;
        next=clock.ElapsedMilliseconds+(quiet?11000:rng.Next(2200,5200));
        Clamp(); Location=new Point((int)x,(int)y);
    }
    void Clamp() {
        var a=display.WorkingArea;
        x=Bound((int)x,a.Left,a.Right-Width); y=Bound((int)y,a.Top,a.Bottom-Height);
    }
    void Announce() {
        string state=phase+"."+side;
        if(state==lastState)return;
        lastState=state;
        Console.WriteLine("{\"mode\":\""+phase+"\",\"side\":"+(side==0?"null":side<0?"\"left\"":"\"right\"")+"}");
        Console.Out.Flush();
    }
    internal void Dispatch(PetCommand cmd) {
        if(cmd==null)return;
        if(cmd.action=="quit") {Close();return;}
        if(cmd.action=="clock") {
            asleep=cmd.asleep;
            side=0;phase="field";moving=false;next=clock.ElapsedMilliseconds+3200;
            Clamp();Draw(true);Announce();return;
        }
        if(cmd.action=="outfit") {
            try {
                var replacement=new Costume(cmd);
                var old=costume;costume=replacement;old.Dispose();
            } catch { Close();return; }
        } else if(cmd.action=="show") {
            quiet=cmd.reduceMotion;
            if(cmd.atCursor)PickStart(true); else Retrieve();
        }
        Draw(true);Announce();
    }
    void Retrieve() {
        if(side!=0) {
            var a=display.WorkingArea;
            x=side<0?a.Left+Width*0.48:a.Right-Width*1.48;
        }
        side=0;phase="field";moving=false;next=clock.ElapsedMilliseconds+rng.Next(4300,7500);
        Clamp();Draw(true);Announce();
    }
    void DockAt(int dir) {
        if(asleep)return;
        side=dir;moving=false;phase="peeking";dockStart=clock.ElapsedMilliseconds;
        var a=display.WorkingArea;
        x=side<0?a.Left:a.Right-Width;Clamp();Draw(true);Announce();
    }
    void Tick() {
        long now=clock.ElapsedMilliseconds;
        if(pressed||ContextMenuStrip.Visible)return;
        if(asleep) {Draw(false);return;}
        if(side!=0) {
            long elapsed=now-dockStart;
            if(elapsed>=12500) {
                if(rng.NextDouble()<0.5) {Retrieve();return;}
                dockStart=now;elapsed=0;
            }
            phase=elapsed>=8100?"hidden-edge":"peeking";
        } else if(moving) {
            double t=(now-started)/(double)duration;
            x=fromX+(toX-fromX)*Ease(t);
            if(t>=1) {
                x=toX;moving=false;
                if(dockOnArrival) {DockAt(toX<fromX?-1:1);return;}
                next=now+rng.Next(2200,5500);
            }
        } else if(now>=next) {
            var a=display.WorkingArea;
            int nearest=x+Width/2<a.Left+a.Width/2?-1:1;
            dockOnArrival=rng.NextDouble()<0.48;
            toX=dockOnArrival?(nearest<0?a.Left:a.Right-Width):Bound((int)x + rng.Next(-Width,Width+1),a.Left,a.Right-Width);
            fromX=x; duration=(long)(1000*Math.Abs(toX-fromX)/(Width*0.46))+600;started=now;
            if(quiet) { if(dockOnArrival)DockAt(nearest);else next=now+12000;return; }
            moving=true;
        }
        Draw(false);Announce();
    }
    double Reveal(long ms) {
        if(quiet)return ms<8100?.74:.19;
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
        var bitmap=asleep?costume.Sleep:side==0?costume.Frames[direction][frame]:costume.Peek;
        double scale=Width*(side==0?.91:.80)/Math.Max(bitmap.Width,bitmap.Height);
        int w=(int)(bitmap.Width*scale),h=(int)(bitmap.Height*scale);
        int left=(Width-w)/2,top=Height-h-5;
        if(asleep&&!quiet) {
            int breathing=(int)Math.Round(h*.009*Math.Sin(now/880.0));
            top-=breathing; h+=breathing;
        }
        if(side!=0) {
            int show=(int)(w*Reveal(now-dockStart));
            left=side<0?show-w:Width-show;
        } else if(!moving&&!quiet&&!dragging&&!asleep) top-=(int)Math.Round(1+Math.Sin(now/760.0));
        int stamp=unchecked((((direction.GetHashCode()*31+frame)*31+left)*31+top)*3+side);
        var pos=new Point((int)Math.Round(x),(int)Math.Round(y));
        if(!force&&stamp==renderStamp&&pos==lastPosition)return;
        if(!force&&stamp==renderStamp) {Native.Move(Handle,pos);lastPosition=pos;return;}
        using(var g=Graphics.FromImage(surface)) {
            g.Clear(Color.Transparent);
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;
            if(side>0) {g.TranslateTransform(left+w,top);g.ScaleTransform(-1,1);left=0;top=0;}
            g.DrawImage(bitmap,new Rectangle(left,top,w,h));
        }
        Native.Draw(Handle,surface,pos);renderStamp=stamp;lastPosition=pos;
    }
    protected override void OnMouseDown(MouseEventArgs e) {
        base.OnMouseDown(e);if(e.Button!=MouseButtons.Left)return;
        pressed=true;dragging=false;pressedAt=Cursor.Position;startPosition=lastPosition;Capture=true;
    }
    protected override void OnMouseMove(MouseEventArgs e) {
        base.OnMouseMove(e);if(!pressed)return;
        var p=Cursor.Position;
        int dx=p.X-pressedAt.X,dy=p.Y-pressedAt.Y;
        if(!dragging && Math.Abs(dx)+Math.Abs(dy)<5)return;
        if(!dragging&&side!=0) {startPosition=new Point(pressedAt.X-Width/2,pressedAt.Y-Height/2);}
        dragging=true;side=0;phase="field";moving=false;
        Screen target=Screen.FromPoint(p);
        if(display.DeviceName!=target.DeviceName) {
            display=target;ResizeForScreen();startPosition=new Point(pressedAt.X-Width/2,pressedAt.Y-Height/2);
        }
        x=startPosition.X+dx;y=startPosition.Y+dy;
        Clamp();Draw(false);Announce();
    }
    protected override void OnMouseUp(MouseEventArgs e) {
        base.OnMouseUp(e);if(e.Button!=MouseButtons.Left||!pressed)return;
        pressed=false;Capture=false;
        if(!dragging&&side!=0){Retrieve();return;}
        if(dragging) {
            var a=display.WorkingArea;
            if(Cursor.Position.X<a.Left+16)DockAt(-1);
            else if(Cursor.Position.X>a.Right-16)DockAt(1);
        }
        dragging=false;next=clock.ElapsedMilliseconds+6800;
    }
    protected override void OnMouseCaptureChanged(EventArgs e) {
        base.OnMouseCaptureChanged(e);
        if(pressed && !Capture){pressed=false;dragging=false;next=clock.ElapsedMilliseconds+2800;}
    }
    protected override void WndProc(ref Message m) {
        if(m.Msg==0x21) {m.Result=new IntPtr(3);return;} // MA_NOACTIVATE
        base.WndProc(ref m);
    }
    protected override void Dispose(bool disposing) {
        if(disposing) {
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged-=ScreenChanged;
            timer.Dispose();if(ContextMenuStrip!=null)ContextMenuStrip.Dispose();
            if(surface!=null)surface.Dispose();if(costume!=null)costume.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal static class Native {
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
