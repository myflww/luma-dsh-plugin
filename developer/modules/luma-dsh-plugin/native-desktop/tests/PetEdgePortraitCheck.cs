using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class PetEdgePortraitCheck {
    static void Check(bool ok,string message) {
        if(!ok)throw new InvalidDataException(message);
    }
    static readonly Type Window=typeof(PetWindow);
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    static Bitmap Snapshot(PetWindow pet,int side,bool pin) {
        Window.GetMethod("DockAt",Private).Invoke(pet,new object[]{side,pin});
        return new Bitmap((Bitmap)Window.GetField("surface",Private).GetValue(pet));
    }
    static Rectangle Painted(Bitmap b) {
        int l=b.Width,t=b.Height,r=0,bot=0;
        for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++)if(b.GetPixel(x,y).A>=80) {
            l=Math.Min(l,x);t=Math.Min(t,y);r=Math.Max(r,x);bot=Math.Max(bot,y);
        }
        return Rectangle.FromLTRB(l,t,r+1,bot+1);
    }
    static void CheckLayout() {
        foreach(int dpi in new[]{96,120,144,192,240}) {
            int n=184*dpi/96;
            var window=new Size(n*4/3,n+n/12);
            foreach(var size in new[]{new Size(n/2,n),new Size(n,n/2),new Size(n*2,n*2)})
            foreach(double reveal in new[]{.14,.29,.48,.74,.87,1.0}) {
                var left=PetEdgePortrait.Bounds(window,size,-1,reveal);
                var right=PetEdgePortrait.Bounds(window,size,1,reveal);
                var bottom=PetEdgePortrait.Bounds(window,size,2,reveal);
                Check(left.Y>0 && left.Bottom<window.Height && left.Right<=window.Width,"side clipped inside window");
                Check(right.Y==left.Y && right.Left==window.Width-left.Right,"incorrect right-side mirror");
                Check(bottom.X>0 && bottom.Right<window.Width && bottom.Y>=0,"bottom clipped inside window");
                if(reveal==1)Check(bottom.Bottom==window.Height,"hands miss the screen edge");
            }
        }
    }
    [STAThread]
    static void Main(string[] args) {
        CheckLayout();
        Application.EnableVisualStyles();
        var records=new JavaScriptSerializer().Deserialize<Dictionary<string,PetCommand>>(File.ReadAllText(args[0]));
        Check(records.Count==14,"incomplete wardrobe");
        foreach(var row in records) using(var pet=new PetWindow(row.Value)) {
            Check(pet.Handle!=IntPtr.Zero,row.Key+" native window");
            using(var left=Snapshot(pet,-1,true))
            using(var right=Snapshot(pet,1,true))
            using(var bottom=Snapshot(pet,2,true)) {
                var l=Painted(left);var r=Painted(right);var b=Painted(bottom);
                Check(l.Top>0 && l.Bottom<left.Height && l.Left<=1 && l.Width>22,row.Key+" left silhouette "+l);
                Check(r.Right>=right.Width-1 && Math.Abs(l.Width-r.Width)<=2,row.Key+" right silhouette");
                Check(b.X>0 && b.Right<bottom.Width && b.Top>0 && b.Bottom==bottom.Height,row.Key+" bottom contact");
                // Long flat runs in the last painted side row are the original
                // clipped-hair regression. A few antialiased hair tips are fine.
                int solid=0;
                for(int x=l.Left;x<l.Right;x++)if(left.GetPixel(x,l.Bottom-1).A>=80)solid++;
                Check(solid<=Math.Max(7,l.Width*.21),row.Key+" flat cut at the hanging hair tips");
                if(args.Length>1) {
                    left.Save(Path.Combine(args[1],row.Key+"-left.png"),ImageFormat.Png);
                    right.Save(Path.Combine(args[1],row.Key+"-right.png"),ImageFormat.Png);
                    bottom.Save(Path.Combine(args[1],row.Key+"-bottom.png"),ImageFormat.Png);
                }
                pet.Dispatch(new PetCommand{action="clock",asleep=true});
                using(var sleepy=Snapshot(pet,2,true)) {
                    var s=Painted(sleepy);
                    Check(s.Bottom==sleepy.Height && s!=b,row.Key+" missing pinned night portrait");
                    if(args.Length>1)sleepy.Save(Path.Combine(args[1],row.Key+"-night.png"),ImageFormat.Png);
                }
                using(var doze=Snapshot(pet,-1,false)) {
                    Check((string)Window.GetField("nightActivity",Private).GetValue(pet)=="dozing",row.Key+" nighttime settling");
                    Check((int)Window.GetField("side",Private).GetValue(pet)==0,row.Key+" still showing the docked portrait after settling");
                    if(args.Length>1)doze.Save(Path.Combine(args[1],row.Key+"-sleeping.png"),ImageFormat.Png);
                }
            }
        }
    }
}
