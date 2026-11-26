# 场景与角色验收

## 0.6.3 开发版

八位伙伴共有 14 套可选造型。站立、刚被提起、悬空和屈膝落地各有独立姿势。拖动换向时，悬空的膝盖与衣袖随手势改变方向。停手后会稳住。深色与浅色桌面均用 Windows 原生窗口检查脸颊和轮廓。[八位伙伴的动作](images/actor-poses-063.gif) · [原生桌宠实录](images/desktop-pet-motion.gif) · [卧室拖放](images/bedroom-drag.gif) · [14 套造型在黑白桌面的实录对照](images/desktop-pet-backgrounds-063.png)

卧室电脑前的角色使用等比缩放的完整 Q 版坐姿，各房分别对齐椅垫、原画桌沿与原键盘。头、髋和屈膝后的鞋保持同一比例。下表中每张图都有该房间的全部 14 套造型。[15 房间对照](images/bedroom-desks-15-rooms.jpg) · [走近与坐定时的比例](images/bedroom-q-scale.jpg) · [电脑前打字动图](images/bedroom-computer-motion.gif)

| 普通与专属卧室 | 专属卧室 | 商店卧室 |
| --- | --- | --- |
| [经典卧室](images/bedroom-desk-looks/classic.jpg) | [鲸鱼娘](images/bedroom-desk-looks/jingyuniang.jpg) | [蔷薇画房](images/bedroom-desk-looks/rose-sketchbook.jpg) |
| [端木嫣](images/bedroom-desk-looks/shan.jpg) | [龙妈妈](images/bedroom-desk-looks/longmama.jpg) | [宝蓝琴房](images/bedroom-desk-looks/sapphire-music.jpg) |
| [白霜命](images/bedroom-desk-looks/bai-shuangming.jpg) | [克劳德](images/bedroom-desk-looks/claude.jpg) | [雪原书斋](images/bedroom-desk-looks/alpine-library.jpg) |
| [陆弥](images/bedroom-desk-looks/lu-mi.jpg) | [吉米](images/bedroom-desk-looks/gemini.jpg) | [山茶花亭](images/bedroom-desk-looks/camellia-pavilion.jpg) |
| | [绯洛](images/bedroom-desk-looks/grok.jpg) | [蓝晶蔷薇廊](images/bedroom-desk-looks/blue-rose-gallery.jpg) |
| | | [霜羽玻璃花房](images/bedroom-desk-looks/frostwing-glasshouse.jpg) |

雪原书斋、克劳德的卧室、宝蓝琴房和龙妈妈的卧室都保留了同角度的修改前后实拍。近侧扶手挡住大腿根，膝盖伸到坐垫前缘，鞋从边缘垂下。核验覆盖 210 组房间与造型搭配，并在日夜画面分别检查双手与键盘的接触。[四间房的脚与椅子](images/bedroom-chair-feet.jpg)

八位伙伴共有 56 个方向图集。陆弥两套衣装、吉米以及另外八套造型重绘了四向步态。每套用十六格原画区分支撑脚和迈步脚。鲸鱼娘的两套外观与端木嫣原装沿用已校准的步态。在 Windows 原生桌宠、卧室和办公室中使用同一套图集。[四向修改前后动图](images/walk-proportions.gif) · [八位伙伴走路](images/walk-preview.gif)

床边的手机按钮位于床脚，角色的答复出现在另一侧。[床边实拍](images/bedroom-interaction-062.jpg)

## 0.6.1 验收记录

本次验收使用 Windows x64 的 DeepSeek Harness Desktop、独立测试档案和最终发行文件。八位伙伴共用 14 套实际可选衣装。办公室与卧室按角色、衣装、房间和姿态分别检查，原生桌宠另在 Windows 窗口中验证。

| 范围 | 验收方式与结果 |
| --- | --- |
| 办公室 | 9 间办公室、81 个工位。程序检查 1,134 种衣装与工位绑定，18 幅实机画面合计记录 144 次入座，所有工位都有人实际坐过。专属场景利用椅背遮挡处理坐姿素材自带椅轮的问题。 |
| 四向行走 | 逐项核查 504 种房间、衣装、方向组合。两个场景渲染器共 112 条移动向量与画面方向相符。 |
| 多人避让 | 8 位伙伴并发轮换目标的 54 组轨迹全部到达。经典与独立布局最近移动足点分别相距 16.23 和 17.32 个设计像素。交叉路段让行，同向保持间距；实机已测试自然离座、拖到空座、对换工位和重开保留。 |
| 卧室 | 核查 15 间卧室 × 14 套外观的 210 个组合，渲染核对睡觉、床上看手机、坐书桌三种画面，共 630 格。无法同时够到键盘和椅面的组合使用可拉近的键盘托盘，最大座位偏差从 68.7 降到 13.74 个原图像素。 |
| 桌宠 | 每套外观都有招呼、午休、夜间困倦、底边打盹和侧边探头美术。已逐套验证唤出、轻触、作息切换与召回，并在真实 Windows 桌面同时运行两位伙伴。实体测试使用一台显示器，多显示器负坐标及混合 DPI 排布另通过几何用例验证。 |

**办公与休息如何衔接。** 正在执行的工作可以让伙伴在工位加班。任务仍在等确认时，回到卧室的伙伴会守着书桌。任务完成或失败后，可以接受家具邀请，夜间可以正常睡觉。用户拖放时优先跟随鼠标，重新绑定工位不会改变任务和会话的主人。

**桌宠如何回应。** 白天召唤或轻触会打招呼，随后回到待机。午休依据办公室的工作日、调休和个人休息日期判断。轻触可以短暂打断小憩，午休结束会恢复白天活动。晚上八点后召唤，伙伴先带着困意回应，再靠到屏幕底边打盹。开启减少动态后保留轻触、拖动和召回，停止自主走动和突然换边。两位伙伴在同一屏幕出现时会为彼此留位置。

**第一次打开。** 空白档案从鲸鱼娘和空卡册开始。夜间可直接从办公室去她的卧室，高清场景加载期间先显示对应时段的房间预览。空卡册提供领取 300 星币新册礼的入口；购买第一包、拆出第一张卡后，重开宿主仍可回到卡册查看，余额与收支记录同步保留。

![八位伙伴在原生桌面窗口的招呼和午休动作](images/desktop-pets-061.png)

[办公室与工位实拍](images/offices-061.jpg) · [四方向行走图](images/walking-061.jpg) · [卧室书桌细节](images/bedroom-desks-061.jpg)
