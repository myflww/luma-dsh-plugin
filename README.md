# Luma 星伴 · DSH 桌面插件

![Luma 主题插画。两张书桌把信封送到中央的校对台，旁边放着一枚鲸鱼镇纸。](docs/images/paper-studio.webp)

在 DeepSeek Harness Desktop 里，伙伴有自己的工位、房间和聊天窗口。新档案从鲸鱼娘开始。在「联系」里和她聊两句，交给她一项工作，再邀请其他伙伴加入。

[下载工作室预览版](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.6.0-studio.1) · [工作室使用指南](docs/studio.md) · [下载桌宠版 0.6.0](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.6.0) · [安装与使用手册](docs/guide.md) · [记忆与爱之屋](docs/memory.md) · [使用许可](LICENSE.md)

## 从工位走到桌面

![真实场景。鲸鱼娘坐在朝海的窗边，桌旁是她的书架和床。](docs/images/room.webp)

在办公室把伙伴拖到空椅子，她会换到那张桌子。把她拖到另一位伙伴的工位，两人会交换位置。想让她陪你处理别的事，可以把她拖出 DSH 窗口，或在员工列表点「桌宠」。贴近屏幕边缘松手，还能看到她从边缘探头。

打开「员工列表」，点击伙伴的头像、名字或角色栏即可进入她的卧室。点击名册里的「换装」进入她的衣橱，点击星币进度查看用量明细。

## 在「联系」里交办一件事

![工作室版测试档实机界面。左侧选人或工作室，中间是四位成员的分工与交付，右侧选择角色的模型来源。](docs/images/team.webp)

桌宠版支持角色私聊、单人派工和按顺序接力。工作室版进一步允许给成员分配具体窗口、选择复核人，并在一处读完交付。上图取自工作室版的示例档案。四人分工、授权范围和回执的读法见[工作室指南](docs/studio.md)。

| 你想做什么 | 从哪里开始 |
| --- | --- |
| 只和一位伙伴说话 | 从「联系」点她的头像 |
| 给不同角色选模型 | 打开角色的模型设置。工作室版也可绑定本机已登录的 Codex 客户端 |
| 让几个人协作 | 建立工作室，指定成员和分工，发送同一项任务 |
| 记住或更正一个习惯 | 在对应角色的私聊中说明偏好，或打开她的记忆管理 |

**需要下载爱之屋吗？** 平时聊天、工作和读取本地记忆只需插件。想把记忆同步到插件外的独立角色知识库，再下载爱之屋 Windows x64，在 Luma 内点「爱之屋 → 连接」。工作室版已验证，即使没有启动爱之屋，删除工作并重开后，角色也能在新私聊中读取自己已经记下的偏好。[爱之屋下载](https://github.com/myflww/love-house/releases/tag/v0.10.7rc1) · [两版对照与实测](docs/memory.md)

## 开包、邀请与收藏

<img src="docs/images/collection.webp" alt="开包实机画面。抽出的角色卡存入本地收藏，可继续查看完整卡面。" width="620" />

开出入职卡后，可以从开包结果邀请对应伙伴，也可以留到稍后在「卡牌收藏 → 伙伴与空间」兑换。集齐该角色的正版卡面可解锁她的专属空间。免费试拆适合先看开包效果，实际持有的卡会显示在「我的卡册」。

「卡包商店 → 卧室皮肤」提供六款可永久使用的通用卧室。蔷薇画房、宝蓝琴房、雪原书斋各需 120 星币，山茶花亭、蓝晶蔷薇廊、霜蝶玻璃馆各需 180 星币。商店和卧室的「换肤」都能免费预览日景与夜景。每款购买一次，即可在多位伙伴的卧室中同时使用。

## Windows 首次安装

1. 安装并打开一次 **DeepSeek Harness Desktop**，让宿主建立桌面档案。[DeepSeek Harness 项目](https://github.com/deepseek-ai/deepseek-harness)
2. 从 0.6.0 发行页下载 **Get-Luma-DSH-Public.ps1**，在下载目录打开 Windows PowerShell，运行下面的命令。下载器会逐项核对文件哈希，并将插件注册到桌面档案。首次获取基础资源约 1.87 GB，建议预留 6 GiB。[桌宠版下载](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.6.0)
3. 重新打开 DSH，在侧栏选择「Luma 办公室」。已有基础包的离线安装、手动添加和回退步骤见使用手册。[安装与回退](docs/guide.md)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Get-Luma-DSH-Public.ps1
```

## 开发与使用许可

本仓库公开源码，以便个人学习、测试和提交修复。项目自有内容采用个人非商业许可，**禁止商用、禁止换皮发布或运营**。项目内置的换装、房间主题和个人本地调试均可使用。第三方组件保留原许可。[完整许可](LICENSE.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [源码构建](developer/README.md)
