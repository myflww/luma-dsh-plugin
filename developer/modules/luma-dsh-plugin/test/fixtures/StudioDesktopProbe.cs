using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

// Owned by the opt-in native desktop regression. Leave keyboard focus with the user.
class StudioDesktopProbe : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { var p=base.CreateParams; p.ExStyle |= 0x08000000; return p; }
  }
  readonly TextBox field = new TextBox { AccessibleName = "Draft", Dock = DockStyle.Top };
  StudioDesktopProbe(string title, int x) {
    Text = title; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
    Location = new Point(x, 60); Size = new Size(265, 125);
    BackColor = title.EndsWith("-A") ? Color.FromArgb(201,43,68) : Color.FromArgb(27,130,150);
    var result = new Label { AccessibleName = "Pending", Text = "Pending", Dock = DockStyle.Bottom };
    var check = new Button { AccessibleName = "Apply", Text = "Apply", Dock = DockStyle.Top };
    check.Click += delegate {
      result.Text = "Verified " + field.Text;
      result.AccessibleName = result.Text;
    };
    Controls.Add(check); Controls.Add(field); Controls.Add(result);
  }
  [STAThread] static void Main(string[] args) {
    Application.EnableVisualStyles();
    var a = new StudioDesktopProbe(args[0] + "-A", 80);
    var b = new StudioDesktopProbe(args[0] + "-B", args.Length>1 && args[1]=="overlap" ? 80 : 390);
    a.Show(); b.Show();
    var control = new Thread(delegate() {
      string command;
      while((command=Console.ReadLine())!=null) {
        if(command=="change-a" && args.Length>2) a.Invoke(new Action(delegate {
          a.field.Text="Edited by another participant";
          File.WriteAllText(Path.Combine(args[2],"change-observed"),"ok");
        }));
        if(command=="minimize-a") a.BeginInvoke(new Action(delegate { a.WindowState=FormWindowState.Minimized; }));
      }
    });
    control.IsBackground = true;
    control.Start();
    Application.Run();
  }
}
