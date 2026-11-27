# 桌宠、办公室与卧室交接

目标是让已实装的八位伙伴、十四套造型自然地站、移动和回应用户。0.6.8 把桌宠、美术和此前已在本机运行的联系人及群聊改动合并为一份正式包。以下证据分别来自原画、游戏场景和原生桌宠，接手时请在相应入口复验。

## 用户要保留的体验

| 使用场景 | 已实装的行为 | 接手后的判断标准 |
| --- | --- | --- |
| 日常站立 | 每套有日常待机、短眨眼、发梢衣摆的小幅运动，以及两段间歇小动作，过渡回该衣装的站姿。 | 特殊姿势留给动作。安静站着要自然，适合礼服的收膝、移重心与水手服、带尾巴造型可不同。已有动作只修别扭的格，尤其留意突然下蹲、双腿外张、脚底漂移和衣摆跳变。 |
| 动作数量和角色区别 | 右键可以吃点心、原地转圈、优雅行礼、摸头或点播当前衣装的两项动作。轻点头顶与轻点身体的回应有区别。 | 做动作时手、头和表情要能看出意图。保留服装和性格差异，表情和手势不能改变脸型、瞳距或头身比例。逐项菜单见使用手册。 |
| 放下后看鼠标 | 落稳后眼睛先跟上，头轻转，约 2.45 秒后回正。办公室、卧室与原生桌宠均有相应入口。 | 检查光标四角，尤其斜上到斜下。嘴、面颊和下巴应一起转，颈部与领口留在原位。不要用拉伸整张图追鼠标。 |
| 桌边探头和睡眠 | 支持左右与底边探头。清醒时底边扶边或托腮，深夜延续困倦。陆弥的手动底边闭眼特写与自动卧睡有各自画面。 | 在桌面左右各放一次，核对屏幕内侧发梢、角尖和衣袖。把自动睡着与手动靠底边分别验收，确保手确实搭在画面边缘。 |
| 桌宠活动频率 | 放下后先在原处停留。自动移动只横向挪步，手动点播可立即回应。源码中，松手后的下次移动等待 150–270 秒，通常间隔 90–210 秒，普通小动作约间隔 25–55 秒。 | 观察完整等待期、刚放下、重复点击与「减少动态」状态。不能因换图又恢复为频繁上下游走。 |
| 交给桌宠文件 | 从资源管理器拖入文件或从右键选择，角色读取正文，再询问要做什么。同一话题可从「联系」继续。支持文本、有文字层的 PDF 和常见 Office 文档。 | 在有可用模型的新设备上，用一份含具体时间或数字的样本文档连续问两轮。分别验证拖入、选择文件、无可用模型的提示，以及读不到正文时的反馈。 |
| 身体与头发的动态 | 当前实现使用注册好的二维关键帧、分层变形与局部关节，走路、拾起、落地和待机各有独立帧。 | 全身每根发丝与每个关节的实时独立物理仍是更远的期望。下一步优先观察抓点、惯性和落地的重量感，再判断是否需要增加分层。 |

[站姿与每套衣装的动作](../standing-poses.md) · [桌宠点播与文件操作](../guide.md#拖动伙伴与桌面探头) · [同场景验收记录](../scene-verification.md) · [底边昼夜实拍](../images/desktop-pet-bottom-poses.jpg) · [左右边缘实拍](../images/desktop-pet-edge-peek.jpg)

## 陆弥唯一的人设和尺寸基准

- 原装用 `lu-mi-walk-down-v2.5cef2e4611ef.png` 第 0 帧确定身份。认长直黑发、窄角、金叶发饰、露肩无袖深蓝裙、半透明后摆和黑丝袜。用这一形象补新动作。历史稿里的大卷发和蓝蝴蝶结不作原装脸部、头饰或衣服参考。
- 换装用 `lu-mi-skin-v1-walk-down.70fe69338fae.png` 第 0 帧。袖口、裙边和装饰有独立设定。两套 384 × 336 站姿的 SHA-256 前十二位为 `96dc2e0be434`、`1073a5abfcf6`。[站姿母图、眼口与鞋底定位](../../developer/modules/luma-dsh-plugin/art/actor-poses-keys/standing/prompts.md)
- 显示尺寸以本机实装的伙伴作参照。经典办公室同一镜头、同一足底 (850, 665)，端木嫣 121 × 162、鲸鱼娘 104 × 162、陆弥原装 87 × 159、换装 101 × 159，单位为 CSS 像素。数字是当时固定镜头的实测，其他分辨率应在同一落点相对比较。[办公室定尺图](../images/office-standing-installed-scale.png)
- Windows 桌宠在 96 DPI、245 × 199 窗口里，陆弥两套站高 161 像素，三个实装参照均高 164 像素。弯腰应改变外轮廓高度，脸颊宽度和瞳距应连贯。两处基准图的 SHA-256 前十二位为 `104350e69e7d`、`ccd87d54dc02`。[桌宠六种动作对照](../images/desktop-pet-size-comparison.jpg)
- 卧室沿用每把椅子的尺度。经典北侧工位先看可见额头、键鼠和椅背，在卧室另看坐骨与椅面的关系。办公室站高不可直接套到卧室座位上。[办公室工位](../images/office-chair-installed-scale.png) · [卧室同椅](../images/bedroom-chair-installed-scale.png)

## 从哪个文件继续

| 环节 | 入口 |
| --- | --- |
| 日常、抓放与整理丝带等关键帧 | [站立与抓放生成](../../developer/modules/luma-dsh-plugin/scripts/prepare-actor-poses.py) · [衣装小动作生成](../../developer/modules/luma-dsh-plugin/scripts/prepare-idle-gestures.py) |
| 放下回望 | [眼、嘴、下巴和颈部的生成](../../developer/modules/luma-dsh-plugin/scripts/prepare-actor-look.py) · [网页场景时序](../../developer/overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/usePostDropLook.ts) · [原生图集和计时](../../developer/modules/luma-dsh-plugin/native-desktop/PetPoseAtlas.cs) |
| 原生桌宠 | [活动调度、输入与停靠](../../developer/modules/luma-dsh-plugin/native-desktop/DesktopPet.cs) · [点播表现](../../developer/modules/luma-dsh-plugin/native-desktop/PetPerformance.cs) · [探头](../../developer/modules/luma-dsh-plugin/native-desktop/PetEdgePortrait.cs) |
| 文件与模型 | [正文提取](../../developer/modules/luma-dsh-plugin/src/host/pet-file-reading.ts) · [文件对话窗口](../../developer/modules/luma-dsh-plugin/native-desktop/PetFileChat.cs) |
| 美术回归 | [头眼与抓放](../../developer/modules/luma-dsh-plugin/native-desktop/pet-motion.test.mjs) · [原生尺寸](../../developer/modules/luma-dsh-plugin/native-desktop/pet-scale.test.mjs) · [探头边缘](../../developer/modules/luma-dsh-plugin/native-desktop/pet-edge-art.test.mjs) · [活动频率](../../developer/modules/luma-dsh-plugin/native-desktop/pet-activity.test.mjs) |

## 本窗口还要交给下一台设备的工作

- [ ] 把已审核的未实装原图对上角色、衣装和动作，再进入拖拽窗口的编帧流程。优先走通截图中的鲸鱼娘换装。旧试用包与候选 PNG 均不能整目录覆盖正式包。[拖拽交接](drag.md)
- [ ] 在一个工位完成坐稳、对屏、触键、扶手遮挡的完整样例。待同一镜头检查通过后，再推广至其他工位与房间。[工位交接](workstations.md)
- [ ] 在新设备的真实 DSH 中复验三处共用动作、桌边与深夜两种状态、显示缩放，以及文件阅读。记录衣装、视角、动作帧号和前后截图。已有 Windows 和 Edge 实测可作回归基准。
- [ ] 若继续追求更细的关节物理，先在一套已确认造型上给发束、前臂、裙摆设置不同响应，再验证其余衣装与「减少动态」。当前没有覆盖所有角色的逐关节骨骼模型。
- [ ] 合并前将直立待机、两项衣装动作、抓起、新增变体、落地回望、工位与桌宠各播一遍，比较脸宽、脚底、领口、发饰与身形。曾经通过资源哈希或自动化测试的格子，仍须看动作是否自然。
