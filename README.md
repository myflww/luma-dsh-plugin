# luma-dsh插件

Luma 是 DeepSeek Harness 桌面端的虚拟员工插件。进入侧栏的「Luma 办公室」，可以看员工上下班和在工位办公，去她的卧室，或直接打开工作台派活。

## 安装桌面版

使用有本仓库访问权限的 GitHub 账号登录 GitHub CLI。在 Windows PowerShell 中运行：

```powershell
gh release download v0.4.3 --repo myflww/luma-dsh-plugin --pattern "Get-Luma-DSH.ps1" --dir ".\Luma-0.4.3" --skip-existing
& ".\Luma-0.4.3\Get-Luma-DSH.ps1"
```

脚本从私有 [v0.4.3 发布页](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.4.3) 自动补齐全部 56 个分卷、合并并校验，生成 `Luma-0.4.3/Luma-DSH-0.4.3-Windows.zip`。没有 GitHub CLI 时，可以用有权限的账号在发布页下载 `.001` 至 `.056` 以及 `Get-Luma-DSH.ps1`，把它们放在同一文件夹，再运行该脚本。合并时需要约 3.5 GiB 可用空间。

将生成的 ZIP 解压到长期保留的目录。在 DeepSeek Harness 的「插件 → 添加插件 → 安装第三方插件」中选中包含 `package.json` 的目录并启用，随后点击左侧「Luma 办公室」。DSH 会直接引用这个目录。

本版本适配 Windows 上的 DeepSeek Harness Desktop 0.2.2-rc.1。发布包内有插件、运行美术和可选云办公工作器，DSH 桌面客户端需单独安装。

## 使用

- 在办公室点选员工，进入她的工作台。宽屏右侧控制台可调整办公室主题、在场成员与房间；窄屏窗口的对应控件位于场景下方。进入伙伴卧室可切换房间或直接给房主派工。
- 在工作台建立协作群，选出需要的员工。可以让全员接力，也可以点名一人接手。每位员工都可填写独立的模型服务，设置人格，并连接自己的爱之屋记忆库。
- 如果需要在自己的服务器上工作，按发布包内 `cloud-office/README.md` 启动云办公工作器。在「插件设置 → 云办公服务器」连接后，员工可排版文档、制作任务表，或调用服务器配置的模型起草文本。
- 卡牌收藏、卡册皮肤和卡包商店在插件顶部导航。卡包使用本地星币购买。

## 源码与美术

开发源码和重建工具在 [developer](developer/)；该目录的说明列有宿主依赖、构建命令和验证方法。构建素材使用同版本 Release 中的美术，下载时可按发布的 SHA-256 核对。

修改或再分发前，请查看 [第三方声明](THIRD_PARTY_NOTICES.md)。美术资源的权利依各自来源而定。
