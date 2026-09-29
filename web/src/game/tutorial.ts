import type { Resource } from './objects'

/**
 * 单步教程奖励：可叠加资源与舰船（发放到母星）。
 * 教程只在 15 步里用到，保持「扁平 + 可选字段」，不抽离 strategy / factory / builder。
 * 若以后真要加「科研点 / 时长缩短 / 探测次数 +1」之类，再扩字段即可，不必预先抽象。
 */
export interface TutorialReward {
  resources?: Partial<Resource>
  ships?: Record<number, number>
}

// 必须覆盖 GameScreen 的全部主导航 tab：引导条的「前往」按钮按 tab 跳转，
// 缺项会导致该步的按钮静默失效（Overview.tsx: `nextStep.tab && onJumpTo(...)`）。
// 2026-09-28 补 campaign / officers——第 13、14 步此前缺 tab，玩家点了没反应。
export type TutorialTab = 'buildings' | 'research' | 'shipyard' | 'galaxy' | 'fleet' | 'campaign' | 'officers'

export interface TutorialStep {
  id: number
  /** 章节名，用于分组展示进度 */
  chapter: string
  title: string
  /** 英文标题/提示：必填，漏译在编译期暴露 */
  titleEn: string
  hintEn: string
  /** 怎么做 */
  hint: string
  /** 为什么做——新手引导的价值不在「点哪里」，在于让玩家理解系统之间的因果 */
  why: string
  reward: TutorialReward
  /** 该步应跳转到的页面（横幅上展示「去 XX 页」一键跳转） */
  tab?: TutorialTab
  /**
   * 该步聚焦的建筑 id（仅 buildings 类步骤）。
   *
   * Overview 页的「选中建筑」卡默认选中此 id，新手看到的详情卡与引导条指向同一栋建筑——
   * 此前默认是 14（机器人工厂），而第 1 步教的是金属矿，详情卡把新手引向一个教程没提的建筑。
   */
  focus?: number
}

export const TUTORIAL_CHAPTERS = ['立足', '发展', '征伐', '精进'] as const

// 舰船 ID 速查（来自 objects.ts）：
//   202 运输船 / 204 轻战 / 205 重战 / 210 间谍探测器 / 212 太阳能卫星
// 派发的舰船必须不破坏平衡。设计原则：
//   · 不给任何高于「这一步解锁能力之后能造出来」的船——奖励是奖励，不是跳关
//   · 太阳能卫星是「发电量补给」，配合「先矿后电」的教学顺序很自然
//   · 运输船在玩家解锁引擎之后给，对应「下一步就要去侦察了」
//   · 轻战 / 重战 / 探测器 紧跟对应建造步骤，巩固「造完就送你一队」
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    chapter: '立足',
    title: '开采金属',
    hint: '在建筑页把「金属矿」升到 Lv.1',
    titleEn: 'Mine metal',
    hintEn: 'Upgrade Metal Mine to Lv.1 on the Construction page',
    why: '开局母星没有任何建筑，产量恒为 0。矿井是一切的前提，没有矿就没有后面所有事。',
    reward: { resources: { metal: 500 } },
    tab: 'buildings',
    focus: 1,
  },  {
    id: 2,
    chapter: '立足',
    title: '保障供能',
    // P1-②（2026-09-27 体验修复）：hint 不再写死"Lv.1"——玩家顺手多点几级矿后，
    // 静态数字会与电力横幅算出的"需 Lv.N"打架。UI 侧用 nextHint() 注入动态等级。
    hint: '建造「太阳能电站」，让发电跟上矿井（跟着红色电力提示走即可）',
    titleEn: 'Secure power',
    hintEn: 'Build the Solar Plant so your mines keep running',
    why: '三座矿井都要耗电。发电跟不上时产量会按比例打折，电站等级要跟着矿井走——升几级矿就要配几级电。完成这一步送你一颗太阳能卫星，加快第一晚的产能爬坡。',
    reward: { resources: { crystal: 200 }, ships: { 212: 1 } },
    tab: 'buildings',
    focus: 4,
  },
  {
    id: 3,
    chapter: '立足',
    title: '开采晶体',
    hint: '建造「晶体矿」Lv.1',
    titleEn: 'Mine crystal',
    hintEn: 'Build Crystal Mine Lv.1',
    why: '晶体是科技和舰船的主要消耗品，只靠金属走不远。',
    reward: { resources: { crystal: 300 } },
    tab: 'buildings',
    focus: 2,
  },
  {
    id: 4,
    chapter: '立足',
    title: '扩容仓储',
    hint: '把「金属仓库」升到 Lv.1',
    titleEn: 'Expand storage',
    hintEn: 'Upgrade Metal Storage to Lv.1',
    why: '仓库满了之后产出会被直接丢弃，界面不会有任何提示。这是新手最容易踩的坑——明明在建矿，资源却不再增长。',
    reward: { resources: { metal: 800 } },
    tab: 'buildings',
    focus: 22,
  },
  {
    id: 5,
    chapter: '发展',
    title: '自动化建造',
    hint: '建造「机器人工厂」（建议三矿 Lv.2 之后，产能更从容）',
    titleEn: 'Automate builds',
    hintEn: 'Build the Robotics Factory (ideally after all three mines reach Lv.2)',
    why: '每级缩短建造时间。中期建筑动辄几十小时，没有它进度会非常拖。月面上也能建造，是月球工业线的起点。',
    reward: { resources: { crystal: 500 } },
    tab: 'buildings',
    focus: 14,
  },
  {
    id: 6,
    chapter: '发展',
    title: '建立实验室',
    hint: '建造「研究实验室」',
    titleEn: 'Found the lab',
    hintEn: 'Build the Research Lab',
    why: '研究室是科技树的前置。没有实验室，下一步的引擎科技根本无法开始。',
    reward: { resources: { crystal: 800 } },
    tab: 'buildings',
    focus: 31,
  },
  {
    id: 7,
    chapter: '发展',
    title: '研究引擎',
    hint: '研究「燃烧引擎」Lv.1',
    titleEn: 'Research engines',
    hintEn: 'Research Combustion Drive Lv.1',
    why: '引擎决定舰船速度，速度直接决定往返耗时，也就决定了你能打多远的目标。这一步起航，给你三艘运输船作底子。',
    reward: { resources: { deuterium: 500 }, ships: { 202: 3 } },
    tab: 'research',
  },
  {
    id: 8,
    chapter: '发展',
    title: '建造船坞',
    hint: '建造「船坞」Lv.1',
    titleEn: 'Build the shipyard',
    hintEn: 'Build the Shipyard Lv.1',
    why: '解锁舰船制造。船坞等级同时还决定造舰速度。提示：船坞升到 Lv.4 并研究「脉冲引擎」Lv.1 后就能造殖民船，去空位开辟第二颗星球。',
    reward: { resources: { metal: 2000 } },
    tab: 'buildings',
    focus: 21,
  },
  {
    id: 9,
    chapter: '征伐',
    title: '首艘战舰',
    hint: '在船坞造出第一艘「轻型战斗机」',
    titleEn: 'First warship',
    hintEn: 'Build your first Light Fighter at the shipyard',
    why: '轻型战斗机是最便宜的作战单位，用它来熟悉舰队与派遣流程。再送你两艘轻战，凑成小队好打第一仗。',
    reward: { resources: { metal: 3000 }, ships: { 204: 2 } },
    tab: 'shipyard',
  },
  {
    id: 10,
    chapter: '征伐',
    title: '造间谍探测器',
    hint: '在船坞造出「间谍探测器」',
    titleEn: 'Build a probe',
    hintEn: 'Build an Espionage Probe at the shipyard',
    why: '星系页不会告诉你敌人有多少兵。想知道对方兵力，只能派探测器去侦察。完成这一步直接发你三枚，免得造舰队列被新手拖慢节奏。',
    reward: { resources: { crystal: 1500 }, ships: { 210: 3 } },
    tab: 'shipyard',
  },
  {
    id: 11,
    chapter: '征伐',
    title: '查明敌情',
    hint: '在星系页对 NPC 发起一次间谍任务',
    titleEn: 'Scout the enemy',
    hintEn: 'Launch an espionage mission against an NPC from the Galaxy page',
    why: '侦察报告按「舰队 → 防御 → 库存 → 精确编制」逐档解锁：探测器越多、间谍技术越高，看到的越详细。盲目出击是新手亏光舰队的主要原因。',
    reward: { resources: { crystal: 2000 } },
    tab: 'galaxy',
  },
  {
    id: 12,
    chapter: '征伐',
    title: '初战告捷',
    hint: '挑一个侦察结果显示打得过的目标，赢下第一场战斗',
    titleEn: 'First blood',
    hintEn: 'Pick a target your recon says you can beat and win your first battle',
    why: '把侦察得到的信息真正用起来：先看报告，再决定打不打。送三艘重战作为下一梯队入场券。',
    reward: { resources: { metal: 5000, crystal: 3000, deuterium: 1000 }, ships: { 205: 3 } },
    tab: 'fleet',
  },
  {
    id: 13,
    chapter: '精进',
    title: '战役首通',
    hint: '在征战 tab 通关任意一个战役关卡',
    titleEn: 'Clear a stage',
    hintEn: 'Clear any campaign stage from the Campaign tab',
    why: '战役关卡难度递增、即时结算，对舰队深度有要求。首通后建议保持 1-2 关的余量再挑战下一关，避免全军覆没。',
    reward: { resources: { metal: 3000, crystal: 1500, deuterium: 500 } },
    tab: 'campaign',
  },
  {
    id: 14,
    chapter: '精进',
    title: '延揽军官',
    hint: '在军官 tab 雇佣任意一名军官',
    titleEn: 'Hire an officer',
    hintEn: 'Hire any officer from the Officer tab',
    why: '军官能提供产能加速、维护费打折、战斗加成等长期被动收益。维护费是隐性消耗，雇佣前先看周维护费是否能持续承担。',
    reward: { resources: { metal: 2000 }, ships: { 205: 2 } },
    tab: 'officers',
  },
  {
    id: 15,
    chapter: '精进',
    title: '深空远征',
    hint: '在星系页对 16 号位（深空）发起一次远征',
    titleEn: 'Deep space',
    hintEn: 'Launch an expedition against slot 16 (deep space) on the Galaxy page',
    why: '远征可能带回资源、舰船或黑科技样本，也可能遭遇海盗——不是稳赚买卖。重氢消耗较高，记得保留燃料再出发。',
    reward: { resources: { deuterium: 1500 } },
    tab: 'galaxy',
  },
]