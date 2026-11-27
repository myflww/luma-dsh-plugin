using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class PetFileDropCheck {
    const BindingFlags Private=BindingFlags.NonPublic|BindingFlags.Instance;
    static void Check(bool value,string message){if(!value)throw new InvalidDataException(message);}
    static DragEventArgs Raise(PetWindow pet,string name,DataObject data) {
        var args=new DragEventArgs(data,0,pet.Left+10,pet.Top+10,DragDropEffects.Copy,DragDropEffects.None);
        typeof(Control).GetMethod(name,Private).Invoke(pet,new object[]{args});
        return args;
    }
    [STAThread]
    static int Main() {
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        var folder=AppDomain.CurrentDomain.BaseDirectory;
        string report=Path.Combine(folder,"ui-report.txt");
        try{
            var json=new JavaScriptSerializer();
            Application.EnableVisualStyles();
            using(var pet=new PetWindow(json.Deserialize<PetCommand>(Console.ReadLine()))) {
                pet.Show();Application.DoEvents();
                var data=new DataObject(DataFormats.FileDrop,new[]{Path.Combine(folder,"纸鸢试飞.md")});
                Check(pet.AllowDrop,"desktop form did not register for shell drops");
                Check(Raise(pet,"OnDragEnter",new DataObject(DataFormats.Text,"ordinary text")).Effect==DragDropEffects.None,"accepted non-file");
                Check(Raise(pet,"OnDragEnter",data).Effect==DragDropEffects.Copy,"did not advertise read-only copy");
                Raise(pet,"OnDragDrop",data);
                var dialog=pet.OwnedForms.OfType<PetFileChat>().Single();
                var fields=dialog.Controls.OfType<TableLayoutPanel>().Single().Controls;
                var history=fields.OfType<TextBox>().Single(f=>f.ReadOnly);
                var answer=fields.OfType<TextBox>().Single(f=>!f.ReadOnly);
                var submit=fields.OfType<Button>().Single();
                Check(dialog.Busy && !submit.Enabled && !answer.Enabled && fields.OfType<Label>().Single().Text=="纸鸢试飞.md","pending drop did not display filename");
                Check(Raise(pet,"OnDragOver",data).Effect==DragDropEffects.None,"busy reader accepted second drop");
                int turns=0;
                string line;
                while((line=Console.ReadLine())!=null) {
                    var cmd=json.Deserialize<PetCommand>(line);pet.Dispatch(cmd);Application.DoEvents();
                    if(cmd.action=="quit")break;
                    if(cmd.action!="fileResult")continue;
                    Check(cmd.error==null,cmd.error);
                    if(++turns==1){
                        Check(!dialog.Busy && submit.Enabled && history.Text.Contains("47%") && history.Text.Contains("？"),"document question did not reach native chat");
                        answer.Text="下一轮用蓝色标尺做对照。";submit.PerformClick();
                        Check(dialog.Busy && !answer.Enabled,"reply button did not lock");
                    }else{
                        Check(!dialog.Busy && answer.Text=="" && history.Text.Contains("你：下一轮用蓝色标尺做对照。") && history.Text.Contains("保留蓝色对照组"),"native dialogue lost the reply or answer");
                        File.WriteAllText(report,"PASS");
                        break;
                    }
                }
            }
            return 0;
        }catch(Exception error){File.WriteAllText(report,error.ToString());return 1;}
    }
}
