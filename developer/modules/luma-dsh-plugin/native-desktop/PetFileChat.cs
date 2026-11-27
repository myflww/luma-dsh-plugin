using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

internal sealed class PetFileChat : Form {
    static readonly Dictionary<string,string> Names=new Dictionary<string,string>{
        {"shan","端木嫣"},{"bai-shuangming","白霜命"},{"lu-mi","陆弥"},{"claude","克劳德"},
        {"jingyuniang","鲸鱼娘"},{"longmama","龙妈妈"},{"gemini","吉米"},{"grok","绯洛"}
    };
    readonly Label files=new Label();
    readonly TextBox history=new TextBox();
    readonly TextBox answer=new TextBox();
    readonly Button send=new Button();
    readonly string speaker;
    string topic;
    public bool Busy {get;private set;}
    public event Action<string,string> Submit;

    public PetFileChat(string role) {
        if(!Names.TryGetValue(role,out speaker))speaker="伙伴";
        Text=speaker+" · 一起看文件";
        FormBorderStyle=FormBorderStyle.SizableToolWindow;
        ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;
        AutoScaleMode=AutoScaleMode.Dpi;
        Font=new Font("Microsoft YaHei UI",9.5f);
        BackColor=Color.FromArgb(249,246,242);
        ClientSize=new Size(355,238);MinimumSize=new Size(278,204);
        var grid=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(12)};
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        files.AutoEllipsis=true;files.Dock=DockStyle.Fill;files.Height=27;files.TextAlign=ContentAlignment.MiddleLeft;
        history.Multiline=true;history.ReadOnly=true;history.ScrollBars=ScrollBars.Vertical;history.Dock=DockStyle.Fill;
        history.BackColor=BackColor;history.BorderStyle=BorderStyle.None;history.AccessibleName="文件对话";
        answer.Dock=DockStyle.Fill;answer.AccessibleName="回复"+speaker;answer.MaxLength=4000;
        send.Text="回复";send.AutoSize=true;send.Anchor=AnchorStyles.Right;
        send.Click+=delegate {SendReply();};
        AcceptButton=send;
        grid.Controls.Add(files,0,0);grid.SetColumnSpan(files,2);
        grid.Controls.Add(history,0,1);grid.SetColumnSpan(history,2);
        grid.Controls.Add(answer,0,2);grid.Controls.Add(send,1,2);Controls.Add(grid);
        answer.Enabled=false;send.Enabled=false;
    }
    public void PresentNear(Form pet) {
        if(Visible){BringToFront();return;}
        var area=Screen.FromRectangle(pet.Bounds).WorkingArea;
        Width=Math.Min(Width,area.Width);Height=Math.Min(Height,area.Height);
        int left=pet.Right+Width+8<=area.Right?pet.Right+8:pet.Left-Width-8;
        Location=new Point(Math.Max(area.Left,Math.Min(left,area.Right-Width)),
            Math.Max(area.Top,Math.Min(pet.Top,area.Bottom-Height)));
        Show(pet);
    }
    public void StartReading(string[] paths) {
        topic=null;answer.Clear();
        files.Text=String.Join("、",Array.ConvertAll(paths,Path.GetFileName));
        history.Text=speaker+"正在读文件……";
        SetBusy(true);
    }
    public void Warn(string message) {history.AppendText((history.TextLength>0?"\r\n\r\n":"")+message);}
    void SetBusy(bool value) {
        Busy=value;answer.Enabled=!value && topic!=null;send.Enabled=answer.Enabled;
    }
    string pendingReply;
    void SendReply() {
        if(Busy || topic==null || String.IsNullOrWhiteSpace(answer.Text) || Submit==null)return;
        pendingReply=answer.Text.Trim();
        SetBusy(true);Submit(topic,pendingReply);
    }
    public void Complete(string newTopic,string message,string error) {
        if(error!=null) {
            if(topic==null)history.Text=error;else Warn(error);
        }else{
            if(newTopic!=null)topic=newTopic;
            if(pendingReply==null)history.Text=speaker+"："+message;
            else {history.AppendText("\r\n\r\n你："+pendingReply+"\r\n\r\n"+speaker+"："+message);answer.Clear();}
        }
        pendingReply=null;SetBusy(false);
        history.SelectionStart=history.TextLength;history.ScrollToCaret();
    }
}
