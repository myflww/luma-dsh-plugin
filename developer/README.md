# 从源码构建 Windows 桌面插件

在 Windows 安装 Node.js 24，打开 PowerShell，把当前目录切到本页所在的 `developer`。首次安装依赖需要访问 npm。发布版适用于 DeepSeek Harness Desktop 0.2.2-rc.1。

```powershell
npm ci
npm run build
npm test
```

`modules/luma-dsh-plugin/.runtime/native-desktop/` 会出现浏览器侧 `client.mjs`、宿主侧 `server.mjs` 和八位员工的预设补丁。以上命令可以独立执行，不需要登录 DSH、下载模型或配置 API 密钥。

## 还原美术并生成可安装目录

从本仓库 Releases 下载与本次检出版本相同的 Windows 插件 ZIP。将下面的路径替换为实际下载位置，然后执行。命令会重新编译，从 ZIP 的 `public` 恢复静态资源，再与刚编译的模块一起装配成插件。

```powershell
npm run release -- "D:\Downloads\Luma-DSH-0.4.3-Windows.zip"
```

每个文件都会与 `modules/luma-dsh-plugin/lib/asset-manifest.json` 的相对路径、字节数及 SHA-256 逐项核对。程序在所有检查通过后发布到 `dist/DesktopPlugin-0.4.3/`。需要多次保留结果时，在 ZIP 路径后另加一个新目录的路径。在 DSH 的「插件 → 添加插件」中选择产物目录并启用。

如需检查重建产物与同一版发布包是否逐文件一致，可以在 PowerShell 中执行以下命令。它会输出实际比对的文件数及三个生成文件的 SHA-256。

```powershell
.\verify-release.ps1 -Archive "D:\Downloads\Luma-DSH-0.4.3-Windows.zip" -Package ".\dist\DesktopPlugin-0.4.3"
```

## 代码位置

| 目录 | 内容 |
| --- | --- |
| `modules/luma-dsh-plugin/src/client/` | 办公室、卧室、员工群聊、记忆、收藏和开包页面 |
| `modules/luma-dsh-plugin/src/host/` | 群聊存储、角色任务、爱之屋连接、云端工作接口 |
| `modules/luma-dsh-plugin/native-desktop/` | DSH 桌面入口、工作区桥接、清单、契约测试及宿主编译入口 |
| `modules/luma-dsh-plugin/presets/` | 随插件提供的八种角色预设 |
| `modules/luma-dsh-plugin/cloud-office/` | 可部署的远程工作服务与启动说明 |
| `overlays/deepseek-harness/luma-full/` | 本插件实际依赖的办公室渲染、工位布局、作息、卡册等原始模块 |
| `upstream/` | 固定 DSH 基线中实际被打包的 SDK 源码及许可证、相应桌面标准预设的原始模板和校验值 |

来源版本保存在 `upstream/pins.json`。构建时将最小 SDK 文件复制到本目录内的临时缓存，使 esbuild 生成的源码注释也能和发布版本一致。浏览器端的 React 和原生 DSH 接口由桌面宿主提供。

`npm test` 覆盖原生面板注册、员工话题和原生工作区关联、宿主访问边界、设置与记忆迁移等桌面适配行为。完整原版 Luma 的便携 Web、macOS 工程、端到端场景录像工具和它们的测试环境不在此开发包中。
