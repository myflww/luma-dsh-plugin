using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Coordinates refer to the first painted forward-facing cell, cropped to its
// alpha bounds and scaled to a 256 px long side. The original iris, highlights
// and eyelashes move together, with the displacement tapering at the eyelids.
internal sealed class PetFace : IDisposable {
    static readonly Dictionary<string,int[]> landmarks=new Dictionary<string,int[]> {
        {"bai-shuangming-base",new[]{60,59,85,59,7,6}}, {"bai-shuangming-v1",new[]{91,83,123,82,8,7}},
        {"claude-base",new[]{91,64,120,57,7,5}}, {"claude-v1",new[]{90,65,119,58,7,5}},
        {"shan-base",new[]{57,72,89,70,8,7}}, {"shan-v1",new[]{68,63,94,59,7,6}},
        {"grok-v1",new[]{76,67,101,59,7,6}}, {"gemini-v1",new[]{90,65,90,65,12,5}},
        {"jingyuniang-base",new[]{61,93,96,93,9,8}}, {"jingyuniang-v1",new[]{82,78,115,75,8,7}},
        {"longmama-base",new[]{80,84,112,82,8,7}}, {"longmama-v1",new[]{83,80,113,78,8,7}},
        {"lu-mi-base",new[]{59,69,88,69,7,6}}, {"lu-mi-v1",new[]{69,71,97,71,7,6}}
    };
    public readonly Bitmap Image;
    readonly int[] eyes;
    readonly Rectangle patch;
    readonly byte[] original, pixels;
    public int Expression { get; private set; }

    public PetFace(Bitmap image,string key) {
        Image=image;
        Expression=-1;
        if(!landmarks.TryGetValue(key,out eyes))return;
        int rx=eyes[4]+5,ry=eyes[5]+4;
        patch=Rectangle.Intersect(new Rectangle(Point.Empty,image.Size),Rectangle.FromLTRB(
            eyes[0]-rx,Math.Min(eyes[1],eyes[3])-ry,eyes[2]+rx+1,Math.Max(eyes[1],eyes[3])+ry+1));
        if(patch.IsEmpty)return;
        original=new byte[patch.Width*patch.Height*4];
        pixels=new byte[original.Length];
        var data=image.LockBits(patch,ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
        try {
            int row=patch.Width*4;
            for(int y=0;y<patch.Height;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),original,y*row,row);
        } finally {image.UnlockBits(data);}
    }

    public void Look(double dx,double dy,double blink) {
        if(original==null)return;
        int ix=(int)Math.Round(dx*6),iy=(int)Math.Round(dy*4);
        // Gemini wears a luminous visor. Track the glint without folding the visor.
        int lid=eyes[0]==eyes[2]?0:(int)Math.Round(blink*5);
        int key=(ix+6)*100+(iy+4)*10+lid;
        if(key==Expression)return;
        Expression=key;
        Buffer.BlockCopy(original,0,pixels,0,original.Length);
        PaintEye(eyes[0],eyes[1],ix/6.0,iy/4.0,lid/5.0);
        if(eyes[0]!=eyes[2])PaintEye(eyes[2],eyes[3],ix/6.0,iy/4.0,lid/5.0);
        var data=Image.LockBits(patch,ImageLockMode.WriteOnly,PixelFormat.Format32bppPArgb);
        try {
            int row=patch.Width*4;
            for(int y=0;y<patch.Height;y++)Marshal.Copy(pixels,y*row,IntPtr.Add(data.Scan0,y*data.Stride),row);
        } finally {Image.UnlockBits(data);}
    }
    void PaintEye(int cx,int cy,double dx,double dy,double blink) {
        int rx=eyes[4]+3,ry=eyes[5]+2;
        for(int y=Math.Max(patch.Top,cy-ry);y<Math.Min(patch.Bottom,cy+ry+1);y++) {
            for(int x=Math.Max(patch.Left,cx-rx);x<Math.Min(patch.Right,cx+rx+1);x++) {
                double u=(x-cx)/(double)rx,v=(y-cy)/(double)ry;
                double radius=u*u+v*v;
                if(radius>=1)continue;
                double weight=1-radius;
                double sx=x-dx*eyes[4]*.32*weight;
                double sy=y-dy*eyes[5]*.24*weight;
                if(blink>0) {
                    // Fold rows toward a shallow curved lash. The fixed outer
                    // boundary leaves hair, skin contour and brows untouched.
                    double half=Math.Sqrt(1-u*u);
                    double seam=.18-.14*u*u;
                    double t=v-seam,span=t<0?half+seam:half-seam;
                    if(span>.01) {
                        double relative=Math.Min(1,Math.Abs(t)/span);
                        double opened=1-.90*blink;
                        double unfolded=relative<opened?relative/opened:1;
                        sy+=(Math.Sign(t)*(unfolded-relative)*span*ry);
                    }
                }
                Sample(sx-patch.Left,sy-patch.Top,((y-patch.Top)*patch.Width+x-patch.Left)*4);
                if(blink>.48)CloseLid(x,y,cx,cy,u,v,weight,(blink-.48)/.52);
            }
        }
    }
    void CloseLid(int x,int y,int cx,int cy,double u,double v,double weight,double closure){
        // Reuse cheek color and each eye's own upper-lash ink. Compressing
        // bangs above an eye into the lid otherwise produces vertical streaks.
        double half=Math.Sqrt(1-u*u);
        double contour=Math.Min(1,weight*10)*closure;
        int rx=eyes[4],ry=eyes[5];
        double slope=(eyes[3]-eyes[1])/(double)Math.Max(1,eyes[2]-eyes[0]);
        double line=cy+ry*(.18-.34*u*u)+slope*(x-cx)*.7;
        double stroke=Math.Max(0,Math.Min(1,ry*.14+.4-Math.Abs(y-line)))*Math.Min(1,half*2);
        int cheek=Index(cx+(int)(u*rx*.45),cy+ry+3);
        int lash=Index(cx,cy-ry/2);
        for(int row=cy-ry;row<cy;row++){
            int sample=Index(cx,row);
            if(original[sample+1]<original[lash+1])lash=sample;
        }
        int index=Index(x,y);
        for(int c=0;c<3;c++){
            double lid=original[cheek+c]*(.98+.02*v);
            double color=lid+(original[lash+c]-lid)*stroke;
            pixels[index+c]=(byte)Math.Round(pixels[index+c]+contour*(color-pixels[index+c]));
        }
    }
    int Index(int x,int y){
        return ((Math.Max(0,Math.Min(patch.Height-1,y-patch.Top))*patch.Width)+Math.Max(0,Math.Min(patch.Width-1,x-patch.Left)))*4;
    }
    void Sample(double x,double y,int dest) {
        x=Math.Max(0,Math.Min(patch.Width-1.001,x));
        y=Math.Max(0,Math.Min(patch.Height-1.001,y));
        int col=(int)x,row=(int)y,i=(row*patch.Width+col)*4,stride=patch.Width*4;
        double fx=x-col,fy=y-row;
        for(int c=0;c<4;c++){
            double a=original[i+c]+fx*(original[i+c+4]-original[i+c]);
            double b=original[i+stride+c]+fx*(original[i+stride+c+4]-original[i+stride+c]);
            pixels[dest+c]=(byte)Math.Round(a+fy*(b-a));
        }
    }
    public void Dispose(){Image.Dispose();}
}
