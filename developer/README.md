# 从源码构建 Windows 桌面插件

进入本目录，使用 Node.js 24 和 PowerShell。首次安装 npm 依赖需要网络。

```powershell
npm ci
npm run build
npm test
```

编译好的前端和宿主会写入 `modules/luma-dsh-plugin/.runtime/native-desktop/`。宿主按本档已入职的伙伴向 DSH 注册原生会话预设。SDK 基线提交、桌面标准预设及其 SHA-256 见 `upstream/pins.json`。React 和 DSH 接口由运行中的桌面宿主提供。

`npm test` 包括本机宿主、兑换、办公室作息与多人导航、联系人和卡包开封测试。联系人用例使用同一固定版本的 DSH Session 和对话事件实现，可以在无需个人账号的情况下验证宿主回复、离线补记与旧对话迁移。

## 角色动作原画

14 套造型都以插件原有的 Q 版招呼画为身份参照。[抓起、悬空与落地原图](modules/luma-dsh-plugin/art/actor-poses-keys) 绘制肩部受力、腿部悬垂和屈膝落地。[打字原图](modules/luma-dsh-plugin/art/desk-q-keys) 包含后视、斜后视和大角度斜侧视，以及参照三把实椅绘制的人物与椅子联合稿。各套分别标定头、髋和手腕。坐垫、扶手与实景键盘决定角色在房间中的最终位置。[原椅参照与绘制说明](modules/luma-dsh-plugin/art/desk-q-keys/chair-painting.md)

在已还原美术资源的开发目录中，安装 Python、Pillow、NumPy 和 OpenCV。依次运行以下命令，生成桌宠动作、后排与侧面工位坐姿、两种卧室坐姿，以及正面前台坐姿。各脚本会更新各自的图集和登记数据。[卧室坐姿原画与标定](modules/luma-dsh-plugin/art/bedroom-seated-keys/README.md)

```powershell
py -3 modules/luma-dsh-plugin/scripts/prepare-actor-poses.py
py -3 modules/luma-dsh-plugin/scripts/prepare-desk-rear.py
py -3 modules/luma-dsh-plugin/scripts/prepare-bedroom-seated.py
py -3 modules/luma-dsh-plugin/scripts/prepare-office-reception.py
```

四向行走的重绘造型各有十六格原画。运行 `node modules/luma-dsh-plugin/scripts/prepare-walks.mjs` 会登记步态与鞋底位置。打包后的办公室、卧室和桌宠共用同一套画。[四向原画](modules/luma-dsh-plugin/art/walk-keydrawings) · [角色动作绘制提示](modules/luma-dsh-plugin/art/pose-prompts.md)

## 还原美术并组装插件

在 [0.4.3 发行页](https://github.com/myflww/luma-dsh-plugin/releases/tag/v0.4.3) 下载并运行该版 `Get-Luma-DSH.ps1`，脚本会下载分卷并合成 `Luma-DSH-0.4.3-Windows.zip`。已有完整的 0.4.3、0.5.0 至 0.5.4、0.6.0 至 0.6.4 插件目录时，也可以直接把目录交给构建命令。整版 ZIP 须含对应的 `DesktopPlugin-版本号/` 目录。后续新增或替换的静态美术存放在源码的 `modules/luma-dsh-plugin/art/release-assets/`，与 `public/` 共用相对路径。还原脚本优先读取这些文件，逐项校验后写入 `public/`。卧室手机动作的 WebP 图集由客户端直接导入，构建时随前端一起打包。

```powershell
npm run release -- "$env:USERPROFILE\Desktop\Luma-DSH\Luma-DSH-0.4.3-Windows.zip"
```

静态资源的相对路径、大小和 SHA-256 存在 `modules/luma-dsh-plugin/lib/asset-manifest.json`。程序校验每项并生成 `dist/DesktopPlugin-0.6.6/`。要另存一份，在美术来源后追加一个新输出目录。

如需比对独立重建目录和官方更新包中的全部文件，可运行以下命令。

```powershell
.\verify-release.ps1 -Package .\dist\DesktopPlugin-0.6.6 -Update "D:\Downloads\Luma-DSH-0.6.6-Update.zip"
```

## 生成差分发行包

使用 Python 3.10+。第一个参数必须是已发布、SHA-256 符合记录的 0.4.3 原始 ZIP，第二个参数是通过验证的新版本完整目录。

```powershell
py -3 .\build-update.py "D:\Downloads\Luma-DSH-0.4.3-Windows.zip" ".\dist\DesktopPlugin-0.6.6" ".\dist\v0.6.6"
```

产物包含可双击的小型引导安装包、单独的更新 ZIP、SHA-256 文件和已绑定该 ZIP 摘要的 PowerShell 安装器。更新清单列出全部目标文件，每项带有来源、长度和 SHA-256。只有新增或变更的文件进入更新载荷。用户可以复用完整的 0.6.5、0.6.4、0.6.3、0.6.2、0.6.1、0.6.0、0.5.4、0.5.3、0.5.2、0.5.1、0.5.0、0.4.3 插件目录或已发布的 0.4.3 Windows ZIP。安装器将所需文件复制到临时目录并逐项校验，校验成功后才建立最终的 `DesktopPlugin-0.6.6` 目录。

保留旧版完整目录即可回退。在安装器所在目录运行 `.\Get-Luma-DSH.ps1 -Rollback` 会重新注册上次升级前保留的版本，也可用 `-Base` 指定兼容版本的完整目录。重启 DSH 后生效。

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

### 校验美术资源

在 Python 3.11+ 中安装 Pillow，然后运行 `python check-art.py <完整插件目录>`。这会按 SHA-256 校验静态清单，解码独立及内嵌图片，并核对卡片页面、样式和 3D 模型对本地资源的引用。
