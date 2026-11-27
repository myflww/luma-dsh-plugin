# 日常站姿原画

## 陆弥的原装、换装与显示大小

原装以角色目录的 `lu-mi-walk-down-v2.5cef2e4611ef.png` 第 0 帧为身份参考。保留窄角、金叶、长直黑发、无袖深蓝短裙、半透明后摆和黑丝袜。换装以 `lu-mi-skin-v1-walk-down.70fe69338fae.png` 第 0 帧为参考，保留换装的袖口、发饰和裙边。

各端共用 [陆弥原装](lu-mi-base.png) 和 [陆弥换装](lu-mi-v1.png)。两张图均为 384 × 336，鞋底投影到同一地面锚点 (192, 300)。按 alpha > 32 测得的可见身高分别为 253、252 像素，双眼中心间距均约 31 像素。文件 SHA-256 前 12 位分别为 `96dc2e0be434`、`1073a5abfcf6`。[五官与手部定位](landmarks.json)

尺寸以当前实装办公室的伙伴为参照。比较时固定地面落点、相机、窗口大小和缩放。按同一角色的瞳距、脸颊与鞋底检查动作的接续；裙摆、头发和伸出去的手可以自然改变外轮廓。工位按坐骨与椅面定位，再调整手与键盘的关系。

## 其余十二套实装站姿


其余 12 张透明立绘取自首次站姿合照使用的四组 ImageGen 原画。各组以项目中对应造型的正面图作为服装与比例参照。本目录按原画的透明间隔拆出每个角色，保留发饰、鞋、尾巴及面罩的轮廓。眼、嘴和手的位置记录在同目录的 landmarks.json。

原画提示要求角色正面自然站立，睁眼、肩膀放松，手垂在身侧，两只鞋在同一条地面线上，脚尖稍稍朝外。吉米保留面罩和光环，绯洛保留翅饰。每组衣装按以下次序排列。

| 组别 | 画面顺序 |
| --- | --- |
| 一 | 陆弥原装、陆弥换装、端木嫣原装、端木嫣换装 |
| 二 | 白霜命原装、白霜命换装、克劳德原装、克劳德换装 |
| 三 | 鲸鱼娘原装、鲸鱼娘换装、龙妈妈原装、龙妈妈换装 |
| 四 | 吉米、绯洛 |

## 生成时的英文提示

Edit this game sprite sheet. For each cell paint the exact same chibi character in the exact same clothing, hair, accessories and color, in a naturally relaxed front-view STANDING IDLE key pose, eyes open, gentle neutral closed mouth, shoulders down, hands hanging visibly and naturally beside her thighs. Never waving, saluting, imitating paws, or reaching. Both shoes flat on the same floor line a natural small distance apart, weight balanced, one foot angled slightly outward. Keep their original very large heads, tiny short limbs, carefully illustrated anime style and identities. Leave generous transparent gap between figures, one entire figure centered inside each original cell. TRUE transparent alpha, remove any floor shadows, rectangular halos or colored backing. No labels, text, objects or background.
