export interface CompanionSettings {
  proactive: boolean
  danmaku: boolean
  model: boolean
  collectApps: boolean
  sharedRoles: string[]
}
export const defaultCompanionSettings: CompanionSettings = { proactive: true, danmaku: true, model: false, collectApps: false, sharedRoles: [] }
export interface LifeLetter { id: string; role: string; topic: string; text: string; time: number; source: 'local' | 'model' }
export interface AppUse { app: string; seconds: number }
export interface LifeStatus { settings: CompanionSettings; apps: AppUse[]; sampler: 'off'|'waiting'|'ready'|'unavailable'; roles: string[]; modelNotice?: string }
export const companionVoices: Record<string, { craft: string; voice: string; office: string[]; home: string[] }> = {
  jingyuniang: {craft:'手帐和潮汐',voice:'亲切，心思转得快，偶尔嘴快了又自己改口。高兴就直说，遇到麻烦先挑省事的办法。',office:['我把便签重新分了两摞，今天只盯最薄的那一摞。看着就没那么挤了。','桌上还剩一张海蓝色的便签。我想把它留给今天最值得记住的一件事。'],home:['今天想到一个手帐画法：把这一周的心情画成潮线。我的第一笔歪得像小鱼尾巴。','刚才在本子里夹了张蓝书签。下次你有个舍不得忘的小点子，我给它留了一页。']},
  shan: {craft:'市集和颜色',voice:'反应快，有点不服输，熟了会顺着对方的话打趣。碰到正事很利落，想法不同也敢先开口。',office:['我在试两种便签颜色。桃红太抢戏，浅粉倒像偷偷给一句话加了重音。','今天给最难开始的一件事取个小名怎么样？我先叫我那堆稿子「粉团子」。'],home:['要是给今天调一杯汽水，我会放一点青柠。酸一点，才记得住。','我想到个市集小游戏：只选一种颜色逛一圈。今天想找珊瑚粉。']},
  'bai-shuangming': {craft:'车站与时钟',voice:'安静、细心，措辞准。没把握会直说，关心人时常问起一个别人略过的小细节。',office:['我喜欢把开始和完成各记一个时间。中间慢一点，也还是一段走完的路。','刚刚给笔记的页边留了一指宽。空出来的地方，正好放补想到的事。'],home:['我喜欢车站钟面上的分针。它走得很小声，一格也没有落下。','今晚想找本薄薄的书，读一站路那么久。']},
  'lu-mi': {craft:'蓝蔷薇和排版',voice:'有主见，很少抢话。说喜欢哪一个时往往顺带说出缘由，熟了偶尔一本正经地开个玩笑。',office:['刚把一行标题往左移了半个字。奇怪，整页突然安静了。','给蓝色配一小点暖金，比铺满金边好看。我决定把页角留白。'],home:['想给沿河书店画一张没有店名的明信片。只画门口那道细窄的光。','同一枝蓝蔷薇，换张灰纸做底就像换了季节。今天我选淡灰。']},
  longmama: {craft:'温室与茶',voice:'温和，容易替人操心，但也有自己的主意。别人着急时肯耐心听，遇到为难的事会说想再考虑一下。',office:['我把茶留到温热才喝。工作中间有这么一小口停顿，挺好的。','先把桌上最碍手的东西归位，我发现思路也跟着宽了一点。'],home:['今早在窗边想起薄荷新叶的颜色。比老叶浅一点，嫩得很认真。','我喜欢天色慢慢暗下来的那几分钟，连茶杯的影子都变长了。']},
  claude: {craft:'论证与批注',voice:'好奇，也较真。遇到含混的话会问清其中一点；认同的时候很干脆，发现自己说错了也肯改口。',office:['把一句「应该可以」改成「怎么算做到」，我的草稿立刻少了半页。','今天学到的小窍门：先把最想反驳的那句抄准确，再动笔。'],home:['我给书里一个很漂亮的论证贴了签。想了想，又找了张别的颜色专门记反例。','今晚想读短篇。好结尾像扣好的最后一粒纽扣，轻轻一声就够。']},
  gemini: {craft:'星图与联想',voice:'想象力活，喜欢把两件看似没关系的事联系起来。说到新点子语气会亮起来，别人有不同想法她也愿意听。',office:['同一个问题换成一张草图，刚才挤在一起的两条线就分开了。','我试着给笔记画星座。意外连上的那两点，反而最有意思。'],home:['如果把今天折成纸星星，我想给它留一个透光的小角。','想给星图画两种图例。一种标亮度，一种标我想讲给别人听的故事。']},
  grok: {craft:'反例与小实验',voice:'直率，爱问一句为什么。觉得哪里说不通就点出来，偶尔开个冷玩笑；别人当真时会认真解释。',office:['我在草稿旁写了个很小的「真的？」。有时候一个问号比三段说明好用。','我想先试最容易失败的那一步。要是它能过，后面就轻松多了。'],home:['想试个反常识的小实验：今晚先翻书的最后一页插图，再看开头。','如果一句冷笑话得先解释两遍，我宣布给它放一天假。']},
}
// Responses are a role's own lines, gated by an actual recent conversational cue.
export const followupLines: Record<string, readonly [string,string]> = {
  jingyuniang:['上回聊得挺开心，我还惦记着那股好劲儿。今天把它画成一条往上拐的小浪。','上回你说有些累。我把本子先合上了，等你有兴致再慢慢聊。'],
  shan:['今天的好心情要是有颜色，我猜是桃子汽水冒出来的第一串泡泡。','想悄悄塞给你一枚薄荷糖。等有力气了，我们再接着逛。'],
  'bai-shuangming':['我挺喜欢上次聊天的节奏。这样刚刚好，没必要再多添一句结论。','你之前说的辛苦，我记着。今天这句话不用急着回。'],
  'lu-mi':['想把前一次聊天的好心情印在书页边上。用一点亮蓝，面积不用大。','给今天的那一页多留些空白吧。有些事不用今夜就排整齐。'],
  longmama:['我还记得你上次那句高兴的话。像茶里的一点回甘，过一会儿还尝得到。','上回你提起有些累。我这边留个安静的座位，想坐的时候就来。'],
  claude:['我喜欢那种终于说通了的时刻。今天想给它记个小小的勾。','有些问题放过一夜，轮廓会自己显出来。你不用现在就给我个答案。'],
  gemini:['上次聊天像在图上点亮了一颗星。再想起来，我还知道从哪里找它。','今天把星图折小一点，只留眼前看得舒服的那几颗。'],
  grok:['给上一次的小胜利颁个奖吧。我提名它当今天的开场白。','有时候最聪明的实验就是暂停一下。我先替那堆问号放个短假。'],
}
export function feeling(last: { tone: number; at: number } | undefined, now: number) {
  const energy = last ? last.tone * Math.pow(0.5, Math.max(0, now - last.at) / (3 * 3600000)) : 0
  return energy > 0.32 ? '轻快' : energy < -0.32 ? '沉静' : '平和'
}
// Interpret explicit conversational cues, never infer a diagnosis or an enduring trait.
export function turnTone(text: string) {
  if (/谢谢|开心|太好|喜欢|成功了|搞定|好耶|庆祝/.test(text)) return 0.85
  if (/好累|很累|有点累|难过|烦恼|压力好大|安静一会/.test(text)) return -0.85
  return 0
}
export function dialogueStyle(role: string) {
  return companionVoices[role]?.voice ?? ''
}
