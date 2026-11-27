using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class PetActivityCheck {
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    const long Epoch=1000000;
    static TextWriter Report;
    static T Get<T>(PetWindow w,string name){return (T)typeof(PetWindow).GetField(name,Private).GetValue(w);}
    static void Set(PetWindow w,string name,object value){typeof(PetWindow).GetField(name,Private).SetValue(w,value);}
    static object Call(PetWindow w,string name,params object[] args){return typeof(PetWindow).GetMethod(name,Private).Invoke(w,args);}
    static void Check(bool ok,string what){if(!ok)throw new InvalidDataException(what);}
    static void Range(double value,double min,double max,string what){Check(value>=min&&value<=max,what+" = "+value);}
    static long Clock(PetWindow w){return Get<Stopwatch>(w,"clock").ElapsedMilliseconds;}
    static double X(PetWindow w){return Get<double>(w,"x");}
    static double Y(PetWindow w){return Get<double>(w,"y");}
    static void Center(PetWindow w) {
        var area=Get<Screen>(w,"display").WorkingArea;
        double x=area.Left+(area.Width-w.Width)/2,y=area.Top+(area.Height-w.Height)/2;
        Set(w,"x",x);Set(w,"strollAnchorX",x);Set(w,"y",y);
        Set(w,"dayActivity","awake");Set(w,"moving",false);
    }
    static long Walks(PetWindow w){
        Center(w);long now=Epoch;
        double x0=X(w),y0=Y(w);int n=Get<int>(w,"spriteSide");
        Call(w,"StandUntilNextWalk",now,false);
        long totalMoving=0,minRest=long.MaxValue,maxRest=0;
        double maxOffset=0;
        for(int i=0;i<200;i++){
            long due=Get<long>(w,"next"),rest=due-now;
            Range(rest,90000,210000,"ordinary rest");
            minRest=Math.Min(minRest,rest);maxRest=Math.Max(maxRest,rest);
            w.TickAt(due-1);Check(!Get<bool>(w,"moving"),"left early");
            w.TickAt(due);Check(Get<bool>(w,"moving"),"missed stroll");
            double before=X(w),target=Get<double>(w,"toX"),distance=Math.Abs(target-before);
            int dir=Math.Sign(target-before);
            Range(distance/n,.10-.00001,.40+.00001,"scaled step");
            Check(Get<string>(w,"walkDirection")==(dir<0?"left":"right"),"walk direction");
            long duration=Get<long>(w,"duration");
            w.TickAt(due+duration/2);
            Check(Math.Sign(X(w)-before)==dir&&Y(w)==y0,"walk changed height");
            w.TickAt(due+duration);
            Check(!Get<bool>(w,"moving")&&X(w)==target&&Y(w)==y0,"wrong stop");
            Check(Get<int>(w,"side")==0&&Get<string>(w,"dayActivity")=="awake","autonomous peek or greeting");
            maxOffset=Math.Max(maxOffset,Math.Abs(X(w)-x0));
            totalMoving+=duration;now=due+duration;
        }
        Range(maxOffset,0,.65*n+.00001,"maximum displacement");
        Report.WriteLine("200 strolls over {0:F2} simulated hours; rests {1:F1}-{2:F1} s; {3:F2}% walking; max horizontal offset {4:F1}px, vertical 0px.",
            (now-Epoch)/3600000.0,minRest/1000.0,maxRest/1000.0,100.0*totalMoving/(now-Epoch),maxOffset);
        return now;
    }
    static void Gestures(PetWindow w,long now) {
        var poses=Get<Costume>(w,"costume").Poses;
        int previous=-1;
        Call(w,"StandUntilNextWalk",now,false);
        for(int i=0;i<8;i++){
            long due=Get<long>(w,"nextIdleGesture");
            Range(due-now,25000,55000,"gesture gap");
            Check((int)Call(w,"RestingFrame",due-1)<poses.Metadata.count,"gesture too early");
            int active=Get<int>(w,"firstGesture");
            Check(active!=previous,"repeated gesture");previous=active;
            Check((int)Call(w,"RestingFrame",due+250)==poses.GestureFrame(active,250),"wrong gesture cel");
            Set(w,"next",due+500);
            w.TickAt(due+500);Check(!Get<bool>(w,"moving"),"walk interrupted gesture");
            now=due+poses.GestureDuration(active);
            Check((int)Call(w,"RestingFrame",now)==0,"gesture did not return to neutral");
        }
    }
    static void Drop(PetWindow w){
        Center(w);
        var grip=new Point((int)X(w)+w.Width/2,(int)Y(w)+w.Height/2);
        var place=new Point(grip.X+24,grip.Y+15);
        w.BeginGrab(grip);w.MoveGrab(place);w.ReleaseGrab(place);
        Check(!Get<bool>(w,"dragging") && Get<int>(w,"side")==0,"field drop failed");
        Check(Get<PetDropAttention>(w,"releaseLook").Active,"drop gaze disabled");
        long start=Get<long>(w,"landedAt")+PetPoseAtlas.LandMs+PetDropAttention.DurationMs;
        Range(Get<long>(w,"next")-start,150000,270010,"drop rest after gaze");
        Range(Get<long>(w,"nextIdleGesture")-start,35000,55010,"first post-drop gesture");
        Check(Get<double>(w,"strollAnchorX")==X(w),"wrong drop anchor");
        double x=X(w),y=Y(w);
        w.TickAt(start+149999);
        Check(!Get<bool>(w,"moving")&&X(w)==x&&Y(w)==y,"left dropped position too soon");
    }
    static void Collision(PetWindow w){
        Center(w);double x=X(w),y=Y(w);
        Call(w,"StartQuietStroll",Epoch);
        var destination=new Point((int)Get<double>(w,"toX"),(int)y);
        using(var peer=new Form()){
            peer.StartPosition=FormStartPosition.Manual;peer.Bounds=new Rectangle(destination,w.Size);
            w.Dispatch(new PetCommand{action="peers",peers=new[]{peer.Handle.ToInt64()}});
            w.TickAt(Epoch+Get<long>(w,"duration"));
            Check(!Get<bool>(w,"moving")&&X(w)==x&&Y(w)==y,"moved into another companion");
        }
        w.Dispatch(new PetCommand{action="peers"});
    }
    static void CloseChat(PetFileChat chat){
        // Raise the same FormClosed event as the close button without ever showing the test dialog.
        typeof(Form).GetMethod("OnFormClosed",Private).Invoke(chat,new object[]{new FormClosedEventArgs(CloseReason.UserClosing)});
        chat.Dispose();
    }
    static void Conversation(PetWindow w) {
        Center(w);
        Call(w,"StartQuietStroll",Epoch);
        Check(Get<bool>(w,"moving"),"expected moving pet");
        Call(w,"OpenFileChat");
        var chat=Get<PetFileChat>(w,"fileChat");chat.StartReading(new[]{"notes.txt"});
        double x=X(w),y=Y(w);
        w.TickAt(Epoch+3600000);
        Check(!Get<bool>(w,"moving")&&X(w)==x&&Y(w)==y,"wandered while reading");
        chat.Complete("topic","read",null);
        w.TickAt(Epoch+7200000);
        Check(!Get<bool>(w,"moving")&&X(w)==x&&Y(w)==y,"wandered while waiting for reply");
        Call(w,"StartPerformance",PetTrick.SignatureA);
        Check(Get<PetTrick>(w,"performance")==PetTrick.SignatureA,"manual performance blocked by file chat");
        w.TickAt(Epoch+8000000);
        Set(w,"next",0L);
        long before=Clock(w);
        CloseChat(chat);
        Check(Get<PetFileChat>(w,"fileChat")==null,"closed chat still active");
        Range(Get<long>(w,"next")-before,90000,210010,"fresh rest after conversation closed");
    }
    static void Modes(PetWindow w){
        Center(w);double x=X(w),y=Y(w);
        w.Dispatch(new PetCommand{action="motion",reduceMotion=true});Set(w,"next",0L);
        w.TickAt(Epoch);Check(X(w)==x&&Y(w)==y&&!Get<bool>(w,"moving"),"reduced motion wandered");
        w.Dispatch(new PetCommand{action="motion",reduceMotion=false});
        w.Dispatch(new PetCommand{action="clock",lunch=true});w.TickAt(Epoch);
        Check(X(w)==x&&Y(w)==y&&!Get<bool>(w,"moving")&&Get<string>(w,"dayActivity")=="lunch","left lunch");
        w.Dispatch(new PetCommand{action="clock"});
        foreach(ToolStripItem item in w.ContextMenuStrip.Items)if(item.Text=="从左侧探头"){item.PerformClick();break;}
        w.TickAt(Epoch+3600000);
        Check(Get<bool>(w,"pinnedPeek")&&Get<int>(w,"side")==-1&&Get<string>(w,"phase")=="peeking","manual dock expired");
        Call(w,"Retrieve");Center(w);
        Call(w,"OpenFileChat");
        w.Dispatch(new PetCommand{action="clock",asleep=true});
        w.TickAt(Epoch+3600000);
        Check(Get<string>(w,"nightActivity")=="sleepy"&&X(w)==x&&Y(w)==y,"left open conversation at night");
        CloseChat(Get<PetFileChat>(w,"fileChat"));
        w.TickAt(Epoch+7200000);
        Check(Get<string>(w,"nightActivity")=="dozing","nighttime ledge unavailable");
        long initialEnd=Get<long>(w,"remarkEnd");int initialLine=Get<int>(w,"nextLine");
        for(long t=0;t<3*3600000;t+=60000)w.TickAt(Epoch+7200000+t);
        Check(Get<int>(w,"nextLine")==initialLine&&Get<long>(w,"remarkEnd")==initialEnd,"unprompted sleep chatter");
        var tap=new Point((int)X(w)+w.Width/2,(int)Y(w)+w.Height/2);
        w.BeginGrab(tap);w.ReleaseGrab(tap);
        Check(Get<string>(w,"nightActivity")=="sleepy"&&Get<int>(w,"nextLine")==initialLine+1,"sleeping pet did not respond to touch");
    }
    static void WallClock(PetWindow w){
        Center(w);Set(w,"rng",new Random(117));
        double x=X(w),y=Y(w);
        long start=Clock(w);
        Call(w,"StandUntilNextWalk",start,false);
        long due=Get<long>(w,"next");long walkingAt=0;
        var timer=Get<System.Windows.Forms.Timer>(w,"timer");
        timer.Start();
        try{
            while(Clock(w)<due+5000){
                Application.DoEvents();
                long now=Clock(w);
                Check(Y(w)==y && Get<int>(w,"side")==0,"vertical or edge travel using the live timer");
                bool moving=Get<bool>(w,"moving");
                if(now<due)Check(!moving&&X(w)==x,"actual timer started a walk early");
                if(moving&&walkingAt==0)walkingAt=now;
                if(walkingAt!=0&&!moving){
                    Check(X(w)!=x,"actual timer never changed the position");
                    Report.WriteLine("Live WinForms timer: stationary {0:F2}s, walked {1:F1}px horizontally in {2:F2}s.",
                        (walkingAt-start)/1000.0,Math.Abs(X(w)-x),(now-walkingAt)/1000.0);return;
                }
                System.Threading.Thread.Sleep(10);
            }
            throw new InvalidDataException("live timer never completed the scheduled walk");
        }finally{timer.Stop();}
    }
    [STAThread]
    static void Main(string[] args){
        Application.EnableVisualStyles();
        var cmd=new JavaScriptSerializer().Deserialize<PetCommand>(File.ReadAllText(args[0]));
        Report=Console.Out;Console.SetOut(TextWriter.Null);
        using(var pet=new PetWindow(cmd)){
            Check(pet.Handle!=IntPtr.Zero&&!pet.Visible,"real hidden WinForms pet unavailable");
            Set(pet,"rng",new Random(1701));
            Gestures(pet,Walks(pet));Drop(pet);Collision(pet);Conversation(pet);Modes(pet);
        }
        if(args.Length>1&&args[1]=="--wall-clock")using(var pet=new PetWindow(cmd)){
            Check(pet.Handle!=IntPtr.Zero&&!pet.Visible,"live test would show a window");
            WallClock(pet);
        }
    }
}
