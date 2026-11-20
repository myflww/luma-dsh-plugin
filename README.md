# luma-dsh插件

Luma 在 DeepSeek Harness Desktop 内提供办公室、伙伴卧室和联系人。新档从鲸鱼娘开始。选中她可以聊天或交办工作，抽到对应的卡片后可以邀请更多伙伴。

## 安装 0.5.0

适配 Windows 上的 DeepSeek Harness Desktop 0.2.2-rc.1。在 [0.5.0 发布页](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.5.0) 下载 `Luma-DSH-0.5.0-Installer.zip`，解压后双击 `Install-Luma-DSH.cmd`。已有桌面 0.4.3 目录时，整个升级可以离线完成。

使用命令行安装时，先用有权限的账号登录 GitHub CLI，再运行以下命令。

```powershell
gh release download v0.5.0 --repo myflww/luma-dsh-plugin --pattern Get-Luma-DSH.ps1 --dir .\LumaInstaller --clobber
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\LumaInstaller\Get-Luma-DSH.ps1
```

安装器在桌面 `Luma-DSH` 中创建新版本的独立目录，核对每个文件的 SHA-256，再通过 DSH 自身的 CLI 安装。重新打开 DSH，点侧栏的「Luma 办公室」。DSH 会引用该目录，请长期保留。

- **已有 0.4.3**　桌面 `Luma-DSH` 下有 `DesktopPlugin-0.4.3` 或旧 ZIP 时，安装器会自动复用。存放在别处可用 `-Base "D:\Luma\DesktopPlugin-0.4.3"` 或 `-Base "D:\Downloads\Luma-DSH-0.4.3-Windows.zip"`。
- **首次安装**　安装器从本仓库的 0.4.3 发布取得基础美术，再应用 0.5.0 更新。首次下载约 1.87 GB，包含分卷、合并 ZIP 与完整插件时，建议预留 6 GiB。
- **离线安装**　将 0.5.0 发布中的 `Get-Luma-DSH.ps1` 和 `Luma-DSH-0.5.0-Update.zip` 放在一起，再使用上面的 `-Base` 指定本地基础包。
- **手动添加**　运行安装器时追加 `-PrepareOnly`，然后从 DSH 的插件页添加生成的 `DesktopPlugin-0.5.0` 目录。使用 `-Directory "D:\Luma"` 可以更改输出位置。

## 从第一位伙伴开始

1. 在办公室查看鲸鱼娘的作息。进入伙伴卧室可以查看她是否在家，已解锁的空间外观可在场景中切换。
2. 在「联系」中点头像发消息。点右上角「•••」可以设置人格、选择模型服务、查看记忆或切换对话。个人聊天默认使用 DSH 会话。已有两位入职伙伴后，可以选人建群协作。
3. 去卡包商店领取本地星币，购买并打开卡包。开出入职卡后，在开包结果中选择邀请，或到「卡牌收藏 → 伙伴与空间」选择想消耗的一张卡并确认。入职后即可在联系列表和 DSH「新会话」的预设中找到她。
4. 「伙伴与空间」也列出了各人的正版卡面和所属卡包。持有该角色的全部正版卡面，自动获得专属办公室与卧室。此后即使消耗卡片，已经取得的空间依然保留。历史开包可在商店的收支记录中回看。
5. 打开桌面上的爱之屋后，插件会通过本机连接为每位伙伴绑定各自的记忆库。爱之屋关闭时，新增的记忆先保存在本机，恢复连接后再同步。「聊天设置 → 记忆库」可查看状态与记录。要连接自建的云办公服务器，请查看发布包的 `cloud-office/README.md`。

想先邀请第二位伙伴，可以用 300 星币的新册礼挑选单角色卡包。晨光序章对应端木嫣，蓝蔷薇回响对应陆弥，月相典藏对应白霜命。龙妈妈、克劳德、吉米和绯洛的入职卡出自初见与远行。各卡包当前概率和具体可兑换版本都能在插件内查看。免费试拆可体验动画，持有卡来自实际购入并开启的卡包。

开发源码、重建和差分发行方法见 [开发说明](developer/README.md)。美术与第三方组件的来源列于 [第三方声明](THIRD_PARTY_NOTICES.md)。
