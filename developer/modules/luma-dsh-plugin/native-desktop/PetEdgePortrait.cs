using System;
using System.Drawing;

internal static class PetEdgePortrait {
    // The cut line is the monitor border. All three other sides of the
    // silhouette remain inside the native layered window, including at high DPI.
    internal static Rectangle Bounds(Size viewport,Size picture,int side,double visible) {
        int inset=Math.Max(2,viewport.Height/42);
        double fit=Math.Min(1,Math.Min((viewport.Width-2*inset)/(double)picture.Width,
                                      (viewport.Height-2*inset)/(double)picture.Height));
        int w=Math.Max(1,(int)Math.Round(picture.Width*fit));
        int h=Math.Max(1,(int)Math.Round(picture.Height*fit));
        visible=Math.Max(0,Math.Min(1,visible));
        if(side==2)
            return new Rectangle((viewport.Width-w)/2,viewport.Height-(int)Math.Round(h*visible),w,h);
        int shown=(int)Math.Round(w*visible);
        return new Rectangle(side<0?shown-w:viewport.Width-shown,viewport.Height-inset-h,w,h);
    }
}
