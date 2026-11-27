# 三种鼠标拖拽动作交接

**截至 2026 年 11 月 27 日，三变体仍是实验功能。** 正式 0.6.7 保留原有提起动作。换机发行附件另存了 12 套造型的 24 张已核验新动作，以及等待移植的技术资料。鲸鱼娘蓝色水手服、向侧面伸手且一膝略弯的图，就是已留存的换装平衡姿。

## 用户指示与停工点

原聊天为「所有角色被用户鼠标拖拽的动作都是右边腿提起来」，ID 为 `01a21bcb-cffd-7ae2-92ab-88c712f7c92c`。用户先要求“可以再做两个被提起的来的动作，多个动作随机触发”，并确认“可以，那你开始做吧”。已议定的范围包括 8 位角色、14 套造型、办公室、卧室及 Windows 桌宠。每个角色独立轮换三种动作。

试完第一版后，用户要求“头发的摆动和裙摆，还有腿的摆动幅度应该是三个图层的”，认为把两膝一起收往身侧的悬空动作“不太现实，感觉不自然”，并要求查阅人体自然动作和 Live2D。旧聊天已经查阅小腿自由摆动的实验和 Cubism 物理分组。后续制作可参考不同材质的响应与阻尼，数值仍需在产品里观察。[小腿自由摆动实验](https://pubmed.ncbi.nlm.nih.gov/7848075/) · [Cubism 物理设置](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/)

陆弥原装出现了与图二不符的卷发、发饰和裙型。用户先提出“图二才是原本的形象”，随后明确“不要回退原来的陆弥的美术资源，而是按照它原本的形象，按照现在我们聊好的内容，重新补做缺失的内容”。最终指示为“先停一下和这个窗口统一好形象制作”。两窗同步了造型与尺寸基准，拖拽实验暂停了制作、安装和发包。此次迁移交付资料，完成情况仍按原窗口最后一次验收记录。

## 已有结果与剩余工作

| 阶段 | 已有结果 | 后续处理 |
| --- | --- | --- |
| 首轮三变体 | 原单膝、双脚自然下垂、双膝向一侧收拢。办公室、卧室、Windows 曾在 0.6.5 本地试用包走通；历史报告核过 14 套 × 2 新姿 × 40 格，即 1,120 格。旧试验的全套日志记录 51 个测试文件、344 项通过。 | 此轮成绩仅适用于该试用版本。双膝并拢的空中坐姿已被用户退回。 |
| 二轮平衡姿 | 松一条腿、另一条略弯或落后；重心落在抓点下方，伸手找平衡。除陆弥外的 12 套均完成单图，另一张“双脚悬垂”沿用各自初版左格。 | 24 张均逐张核查造型、鞋、配饰、尾鳍、透明通道及边缘；未在新版三个端点做上线验收。 |
| 分层物理 | 有 14 套历史标定、两支编译器、6 个绘制层和静态补底；TS 与 C# 有各自的时间积分和限幅。旧实验现场留存 14 张变体图和 14 张分层图。 | 散装候选、旧分层输出和正式基础姿态属于不同时点。应从已核验原画重新生成、重新标定，检查遮挡、缝隙与侧向极值。 |
| 陆弥两套 | 后修的原装、换装已分别尝试了直发和正确衣装。正式站姿、双眼、鞋底、同比例同伴参照均已确定。 | 后修原画头身仍与正式参照有差别；现存四张 dangle/tuck 的眼锚可落到肩颈或轮廓外。此组只保存在旧机草稿，仍须按各自正式第 0 格补制并重新标眼。 |

## 可移交的美术

`Luma-DSH-0.6.8-Reviewed-Art.zip` 内含 `drag-art-reviewed.zip`。其中有端木嫣、白霜命、克劳德、鲸鱼娘、龙妈妈各两套，以及吉米和绯洛各一套。每套分别提供 `dangle.png` 和 `balance.png`。原始单画保留整张文件，两格板只取合格的左格，以原分辨率无损裁取。动作判定、尺寸和取格区域见内包 `inventory.json`。两张对照图见 `preview/01.jpg` 和 `preview/02.jpg`。

**截图对应 `art/jingyuniang/v1/balance.png`。** 旧机来源是仓库下 `developer/.luma-cache/pickup-natural/jingyuniang-v1.png`，本身就是 1 格独立画。1017 × 1546 RGBA，SHA-256 为 `2d35350c439217f17cbbbfc9e7be7f3e0c23879469cea349e852f1c87916fd3e`。以截图主体区域配准，637 个局部特征点与该图变换一致。历史缩略工作图名为 `jingyuniang-v1-tuck.png`，460 × 740；代码沿用 `tuck` 表示第三动作。

所有入选 PNG 的 alpha 都覆盖 0 至 255，alpha > 128 的主体均未触及画布边。白霜命礼服悬垂图的珠冠尖距上沿 1 像素，已放大核对。12 套 24 图的历史标定点均与眼位吻合。本次分别对照正式 0.6.7 安装包的公开 PNG 哈希，并复原 24 张 740 像素以内的标定工作图，逐张核对 RGBA 像素哈希。旧单膝姿已在正式产品中；旧双膝收起、走样的陆弥和比例仍待校准的四张图仅在旧机留档。

## 新机代码与旧机位置

`Luma-DSH-0.6.8-Handoff.zip` 内的 `drag-technical.zip` 包含 2 支编译器、2 份标定、2 个 TS 模块、2 份旧索引、历史集成差异、测试、正式尺寸基准和离线复原脚本。内包 `file-map.json` 将短路径映射回实际仓库文件。仓库中以下路径均以项目根为起点。

| 位置 | 用途 |
| --- | --- |
| `developer/modules/luma-dsh-plugin/art/actor-poses-keys/pickup-variants/{registration.json,layer-landmarks.json}` | 原图左右眼与膝、腿、裙、发、手的固定区。正式陆弥请重新补制并登记。 |
| `developer/modules/luma-dsh-plugin/scripts/prepare-pickup-variants.py` | 将新增两姿各编为 40 格，映射普通动作 8–47；每段两端使用相同站姿画。 |
| 同目录 `prepare-pickup-layers.py` | 对单膝、悬垂、平衡分别分左右发束、左右小腿、裙与固定躯干，补底另存一行。每套 6 列 × 4 行，单格 384 × 336。 |
| `developer/overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/` | `pickupVariants.ts` 负责按角色抽取；`pickupDynamics.ts` 负责材质响应及逐层绘制；`actorPoseAtlas.ts` 和 `actorPickup{Atlas,Layers}.generated.json` 负责注册。 |
| 上述 `src/client/` | `useOfficeSceneInteractions.ts` 创建抓取状态；`IndependentOfficeSceneSurface.tsx` 绘制独立办公室；`OfficeSceneSurface.tsx`、`OfficeSceneSurface.types.ts` 与 `ActorMotionLayer.tsx` 负责常规房间渲染与图片加载/回退。工位交接也涉及场景文件，合并时分别核对工位与拖拽改动。 |
| `developer/modules/luma-dsh-plugin/src/client/OfficeBedroom.tsx` | 卧室真实提起后抽取一次，释放后把同一变体交给落地。 |
| `developer/modules/luma-dsh-plugin/native-desktop/` | `build-server.mjs`、`desktop-pet.ts` 传递资源；`DesktopPet.cs` 负责抓取、停止、靠边和动画优先级；`PetPoseAtlas.cs` 含 `PetPickupBag`、`PetSuspension`、部件弹簧及绘图。 |
| `developer/modules/luma-dsh-plugin/test/` 和 `native-desktop/tests/` | `actor-motion.test.ts`、`office-rest-fallback.test.tsx`、`PetMotionCheck.cs` 和 `native-desktop/pet-motion.test.mjs` 覆盖抽取、连贯性、回退、惯性和原生极限边界。 |

旧机 `E:/codex/luam-dsh` 为实验工作区，实验基线 `faa57899c9839e02b5c810ff3a80eaf35177b257`。当时用于美术复核的 0.6.7 公共源码基线为 `6cca205e2f729381b78c64621f05caea4ab24b06`（原开发提交 `ddf749e8f972dee442b7f8b0d526a543c5114161`）；旧实装核对目录为 `E:/Luma-DSH/0.6.7-contacts/DesktopPlugin-0.6.7`。换设备继续工作从本次发布的 `v0.6.8` 开始。历史补丁可在公开提交 `122e10ab757cc62bf5073a3e641473c58c62d555` 的独立工作树复原，该提交与旧机试验基线的 Git tree 完全相同。旧试用包曾在实验树的 `developer/dist/拖拽动作版/DesktopPlugin-0.6.5`。旧机完整草稿 `.runtime/device-handoff/drag-drafts.zip` 另行本地保留，包含多轮完整原图、28 张当时的注册图与冻结图集。

## 复原与验收

1. 在独立目录解压两个内包，逐项核对 `SHA256SUMS`。运行技术包中的 `python restore-reviewed.py <美术解压目录> <空输出目录>`，可复原并验证 24 张注册工作图。旧实验补丁共 15 个文件、64 段差异，已对其历史基线实际通过 `git apply --check --recount`。向正式版本移植时依照文件映射逐段整合，保留正式版的工位、菜单、注视与夜间行为。
2. 按角色分别洗 3 个动作。每轮全出现且不重复，新轮首项避开上一轮末项；跨房间、换装后仍以该角色为键。短点不消耗抽取，真正提起时才抽一次；拖动、急停、反向、落地直到完成都保持同一变体。
3. 先用鲸鱼娘换装校对抓点、稳定脸区和重心。拖动试左右、上下、快速反向、停止和快速松手。发梢、裙边、腿沿各自的锚、振幅、相位和衰减运动；面部稳定，裙摆遮住腿根，无重脚、黑缝、飘离抓点。核对慢速和快速输入下各部位回稳时间、左右腿错位和尾鳍的跟随方向。
4. 新旧图加载慢、缺失或解码失败时应沿用可用基础帧。开启减少动态时应保留可识别的静态持姿和稳定落地。分别验证短提即放、指针取消/丢捕获、房间切换、快速二次抓取、夜间/午休及桌宠不同缩放；靠近各屏边释放应进入正式版的手动停靠，离边释放应完整落地。最大摆角下，鞋、尾、发、手均应留在可见区域。
5. 陆弥原装按图二的长直黑发、金叶发饰、无袖深蓝裙与深色长袜补画；换装按各自原画。基准为正式 `art/actor-poses-keys/standing/lu-mi-{base,v1}.png`，SHA-256 前缀 `96dc2e0be434`、`1073a5abfcf6`。对应向下行走图为 `lu-mi-walk-down-v2.5cef2e4611ef.png` 与 `lu-mi-skin-v1-walk-down.70fe69338fae.png`，均取第 0 格。原实验测得办公室同脚点两套陆弥高 159 CSS px，同伴端木嫣/鲸鱼娘为 162；96 DPI 的 245 × 199 桌宠窗口，陆弥高 161、同伴高 164。新机应在同站位/同 DPI 对照眼线、双眼间距、脸宽、脚底和全身可见高，再测试待机→提起→落地。尺寸参照在技术包 `references/scale.json`，原图可查仓库 `docs/images/office-standing-installed-scale.png` 与 `docs/images/desktop-pet-size-comparison.jpg`。
6. 在办公室两种绘制路径、卧室和实际 Windows 桌宠逐套实拍，至少含三次独立抓取、同角色跨轮、左/右/上/下拖动和落地；再验全部 14 套动作图与注册、安装包资源哈希、缺图回退和原有功能。此项完成后才能把“未实装”状态改为已交付的功能。
