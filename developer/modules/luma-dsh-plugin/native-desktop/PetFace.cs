using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

// Each alpha mask covers only painted, high-opacity pixels inside a visible iris.
// Cheeks, eyelids, sclera and transparent hair are never written.
internal sealed class PetFace {
    public readonly Bitmap Image;
    public readonly PointF Center;
    readonly Iris[] irises;
    public int Expression { get; private set; }

    public PetFace(Bitmap image,int[][] landmarks,int[] offset){
        Image=image;
        landmarks=landmarks??new int[0][];
        irises=new Iris[landmarks.Length];
        int ox=offset==null?0:offset[0],oy=offset==null?0:offset[1];
        int sumX=0,sumY=0;
        for(int i=0;i<irises.Length;i++){
            var eye=landmarks[i];
            if(eye==null||eye.Length!=4||eye[2]<=0||eye[3]<=0)throw new InvalidDataException("Invalid desktop eye landmarks");
            int cx=eye[0]+ox,cy=eye[1]+oy;
            irises[i]=new Iris(image,cx,cy,eye[2],eye[3]);
            sumX+=cx;sumY+=cy;
        }
        Center=irises.Length==0?PointF.Empty:new PointF((float)sumX/irises.Length,(float)sumY/irises.Length);
        Expression=44;
    }

    public void Look(double x,double y){
        if(irises.Length==0)return;
        int dx=(int)Math.Round(Math.Max(-1,Math.Min(1,x))*4),dy=(int)Math.Round(Math.Max(-1,Math.Min(1,y))*4);
        int key=(dx+4)*10+dy+4;
        if(Expression==key)return;
        Expression=key;
        var data=Image.LockBits(new Rectangle(Point.Empty,Image.Size),ImageLockMode.ReadWrite,PixelFormat.Format32bppPArgb);
        try{foreach(var iris in irises)iris.Draw(data,dx/4.0,dy/4.0);}
        finally{Image.UnlockBits(data);}
    }

    sealed class Iris {
        readonly int left,top,width,height;
        readonly Color[] original;
        readonly double[] alpha;
        public Iris(Bitmap image,int cx,int cy,int outerX,int outerY){
            int rx=Math.Max(2,Math.Min(5,(int)Math.Round(outerX*.56)));
            int ry=Math.Max(2,Math.Min(5,(int)Math.Round(outerY*.62)));
            left=cx-rx;top=cy-ry;width=rx*2+1;height=ry*2+1;
            if(left<0||top<0||left+width>image.Width||top+height>image.Height)throw new InvalidDataException("Desktop iris outside its cel");
            original=new Color[width*height];alpha=new double[original.Length];
            var data=image.LockBits(new Rectangle(left,top,width,height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
            try{
                for(int y=0;y<height;y++)for(int x=0;x<width;x++){
                    int i=y*width+x;
                    var color=Color.FromArgb(Marshal.ReadInt32(data.Scan0,y*data.Stride+x*4));
                    original[i]=color;
                    double u=(x-rx)/(double)rx,v=(y-ry)/(double)ry,w=1-u*u-v*v;
                    if(w<=0||color.A<235)continue;
                    // Preserve pale sclera and warm skin around blue, purple,
                    // and amber eyes. The mask tapers at the inner iris edge.
                    bool pigment=Math.Max(color.R,Math.Max(color.G,color.B))<158 ||
                        color.B-color.R>15 || color.B-color.G>22 ||
                        color.R-color.G>28&&color.G-color.B>18&&color.B<120;
                    if(pigment)alpha[i]=Math.Min(1,w*3);
                }
            }finally{image.UnlockBits(data);}
        }

        public void Draw(BitmapData data,double dx,double dy){
            for(int y=0;y<height;y++)for(int x=0;x<width;x++){
                int i=y*width+x;
                if(alpha[i]==0)continue;
                double sx=x-1.65*dx*alpha[i],sy=y-1.15*dy*alpha[i];
                int x0=(int)Math.Floor(sx),y0=(int)Math.Floor(sy);
                double fx=sx-x0,fy=sy-y0;
                Color a=Sample(x0,y0,i),b=Sample(x0+1,y0,i),c=Sample(x0,y0+1,i),d=Sample(x0+1,y0+1,i);
                int opacity=original[i].A;
                int value=Color.FromArgb(opacity,Math.Min(opacity,Blend(a.R,b.R,c.R,d.R,fx,fy)),
                    Math.Min(opacity,Blend(a.G,b.G,c.G,d.G,fx,fy)),Math.Min(opacity,Blend(a.B,b.B,c.B,d.B,fx,fy))).ToArgb();
                Marshal.WriteInt32(data.Scan0,(top+y)*data.Stride+(left+x)*4,value);
            }
        }
        Color Sample(int x,int y,int destination){
            if(x<0||y<0||x>=width||y>=height)return original[destination];
            int i=y*width+x;
            return alpha[i]>0?original[i]:original[destination];
        }
        static int Blend(byte a,byte b,byte c,byte d,double fx,double fy){
            double top=a+fx*(b-a),bottom=c+fx*(d-c);
            return (int)Math.Round(top+fy*(bottom-top));
        }
    }
}
