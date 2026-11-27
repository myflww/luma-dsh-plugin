using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class PetScaleCheck {
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    static readonly Type Window=typeof(PetWindow);
    static T Get<T>(PetWindow pet,string name){return (T)Window.GetField(name,Private).GetValue(pet);}
    static void Set(PetWindow pet,string name,object value){Window.GetField(name,Private).SetValue(pet,value);}
    static void Check(bool ok,string message){if(!ok)throw new InvalidDataException(message);}
    static int HeightOf(PetWindow pet){
        pet.Draw(true,Point.Empty);
        var image=Get<Bitmap>(pet,"surface");
        int first=image.Height,last=-1;
        for(int y=0;y<image.Height;y++)for(int x=0;x<image.Width;x++)if(image.GetPixel(x,y).A>=96){
            first=Math.Min(first,y);last=y;break;
        }
        Check(last>=first,"empty native window");
        return last-first+1;
    }
    static int[] Sample(PetWindow pet) {
        var clock=Get<Stopwatch>(pet,"clock");
        Set(pet,"dayActivity","awake");Set(pet,"remarkEnd",0L);Set(pet,"idleOrigin",clock.ElapsedMilliseconds);
        Set(pet,"nextIdleGesture",long.MaxValue);
        var heights=new List<int>{HeightOf(pet)};
        foreach(var trick in new[]{PetTrick.Snack,PetTrick.Bow,PetTrick.Pat,PetTrick.SignatureA,PetTrick.SignatureB}){
            Window.GetMethod("StartPerformance",Private).Invoke(pet,new object[]{trick});
            Check(Get<PetTrick>(pet,"performance")==trick,"action failed to start");
            Set(pet,"performanceStarted",clock.ElapsedMilliseconds-650L);
            heights.Add(HeightOf(pet));
            pet.TickAt(clock.ElapsedMilliseconds+4000);
            Check(Get<PetTrick>(pet,"performance")==PetTrick.None,"action failed to finish");
        }
        return heights.ToArray();
    }
    [STAThread]
    static void Main(string[] args){
        Application.EnableVisualStyles();
        var config=new JavaScriptSerializer().Deserialize<Dictionary<string,PetCommand>>(File.ReadAllText(args[0]));
        var report=Console.Out;Console.SetOut(TextWriter.Null);
        var heights=new Dictionary<string,int[]>();Size size=Size.Empty;float dpi=0;
        foreach(var row in config)using(var pet=new PetWindow(row.Value)){
            Check(pet.Handle!=IntPtr.Zero&&!pet.Visible,"expected an actual hidden HWND");
            using(var g=Graphics.FromHwnd(pet.Handle)){
                if(size.IsEmpty){size=pet.ClientSize;dpi=g.DpiX;}
                Check(size==pet.ClientSize && dpi==g.DpiX,"different DPI or viewport");
            }
            heights[row.Key]=Sample(pet);
            report.WriteLine("{0}: {1}",row.Key,String.Join(",",heights[row.Key]));
        }
        var references=heights.Where(row=>!row.Key.StartsWith("lu-mi-")).Select(row=>row.Value).ToArray();
        int slack=(int)Math.Ceiling(5*dpi/96);
        foreach(var row in heights.Where(row=>row.Key.StartsWith("lu-mi-"))){
            int[] sample=row.Value;
            // Height changes legitimately during a bow. Compare against the
            // actual installed peers performing the same action in the same HWND scale.
            for(int i=0;i<sample.Length;i++){
                int low=references.Min(values=>values[i]),high=references.Max(values=>values[i]);
                Check(sample[i]>=low-slack && sample[i]<=high+slack,
                    String.Format("{0} action {1}: {2}px outside peer interval {3}..{4}px",row.Key,i,sample[i],low,high));
            }
        }
        report.WriteLine("Matched native client {0}x{1}, DPI {2}; columns idle/snack/bow/pat/first/second.",size.Width,size.Height,dpi);
    }
}
