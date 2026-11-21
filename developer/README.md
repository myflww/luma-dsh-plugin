# 从源码构建 Windows 桌面插件

进入本目录，使用 Node.js 24 和 PowerShell。首次安装 npm 依赖需要网络。

```powershell
npm ci
npm run build
npm test
```

编译好的前端和宿主会写入 `modules/luma-dsh-plugin/.runtime/native-desktop/`。宿主按本档已入职的伙伴向 DSH 注册原生会话预设。SDK 基线提交、桌面标准预设及其 SHA-256 见 `upstream/pins.json`。React 和 DSH 接口由运行中的桌面宿主提供。

`npm test` 包括本机宿主、兑换、办公室作息与多人导航、联系人和卡包开封测试。联系人用例使用同一固定版本的 DSH Session 和对话事件实现，可以在无需个人账号的情况下验证宿主回复、离线补记与旧对话迁移。

## 还原美术并组装插件

用发布安装器的 `-PrepareOnly` 生成已验证的插件目录，再以该目录作为美术来源重建。也可传入带有 `DesktopPlugin-0.5.1/` 前缀的完整同版 ZIP。

```powershell
npm run release -- "$env:USERPROFILE\Desktop\Luma-DSH\DesktopPlugin-0.5.1"
```

静态资源的相对路径、大小和 SHA-256 存在 `modules/luma-dsh-plugin/lib/asset-manifest.json`。程序校验每项并生成 `dist/DesktopPlugin-0.5.1/`。要另存一份，在美术来源后追加一个新输出目录。

如需比对独立重建目录和官方更新包中的全部文件，可运行以下命令。

```powershell
.\verify-release.ps1 -Package .\dist\DesktopPlugin-0.5.1 -Update "D:\Downloads\Luma-DSH-0.5.1-Update.zip"
```

## 生成差分发行包

使用 Python 3.10+。第一个参数必须是已发布、SHA-256 符合记录的 0.4.3 原始 ZIP，第二个参数是通过验证的新版本完整目录。

```powershell
py -3 .\build-update.py "D:\Downloads\Luma-DSH-0.4.3-Windows.zip" ".\dist\DesktopPlugin-0.5.1" ".\dist\v0.5.1"
```

产物包含可双击的安装包、单独的更新 ZIP、SHA-256 文件和已绑定该 ZIP 摘要的 PowerShell 安装器。更新清单列出全部目标文件，每项带有来源、长度和 SHA-256。只有新增或变更的文件进入更新载荷。用户可以复用完整的 0.5.0、0.4.3 插件目录或已发布的 0.4.3 Windows ZIP。安装器将所需文件复制到临时目录并逐项校验，校验成功后才建立最终的 `DesktopPlugin-0.5.1` 目录。

## 目录

| 位置 | 内容 |
| --- | --- |
| `modules/luma-dsh-plugin/src/client/` | 办公室、卧室、联系、记忆、收藏和开包 |
| `modules/luma-dsh-plugin/src/shared/` | 星币账本、开包凭据、角色与空间权益 |
| `modules/luma-dsh-plugin/src/host/` | 个人记忆、协作任务、爱之屋和云办公 |
| `modules/luma-dsh-plugin/native-desktop/` | 桌面入口、工作区桥接、清单与宿主测试 |
| `modules/luma-dsh-plugin/cloud-office/` | 可部署的远程工作服务 |
| `overlays/deepseek-harness/luma-full/` | 本插件依赖的完整 Luma 渲染、作息、卡池和原版兑换规则 |
| `upstream/` | 固定版本的最小 DSH 构建依赖、标准预设及许可文件 |
