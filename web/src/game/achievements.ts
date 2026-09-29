import type { Resource } from './objects'

export interface GameStats {
  shipsBuilt: number
  defensesBuilt: number
  battlesTotal: number
  battlesWon: number
  totalLoot: number
  totalDebris: number
  colonies: number
  missilesFired: number
  trades: number
  expeditions: number
  defensesDestroyed: number
  moonsDestroyed: number
  campaignWins: number
}

export function emptyStats(): GameStats {
  return { shipsBuilt: 0, defensesBuilt: 0, battlesTotal: 0, battlesWon: 0, totalLoot: 0, totalDebris: 0, colonies: 0, missilesFired: 0, trades: 0, expeditions: 0, defensesDestroyed: 0, moonsDestroyed: 0, campaignWins: 0 }
}

export interface Achievement {
  id: number
  name: string
  desc: string
  hint: string
  /** 英文名/描述/提示：必填，漏译在编译期暴露（EN 下不会退化成中文） */
  nameEn: string
  descEn: string
  hintEn: string
  // 一次性解锁奖励，发放到母星。Partial 允许只给单资源，避免给每个成就都写三零。
  reward?: Partial<Resource>
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 1, name: '奠基者', desc: '建立第一个殖民地', hint: '造一艘殖民船，找到空位殖民', nameEn: 'Founder', descEn: 'Found your first colony', hintEn: 'Build a colony ship and colonise an empty slot' },
  { id: 2, name: '首胜', desc: '赢得第一场战斗', hint: '侦察后挑软柿子捏', nameEn: 'First Blood', descEn: 'Win your first battle', hintEn: 'Recon first, then pick a soft target', reward: { metal: 1000 } },
  { id: 3, name: '舰队指挥官', desc: '同时拥有 50 艘舰船', hint: '船坞流水线开起来', nameEn: 'Fleet Commander', descEn: 'Own 50 ships at once', hintEn: 'Get the shipyard assembly line running' },
  { id: 4, name: '工业巨头', desc: '金属矿达到 Lv.10', hint: '长期投入矿产资源', nameEn: 'Industrialist', descEn: 'Reach Metal Mine Lv.10', hintEn: 'Long-term investment in metal', reward: { metal: 5000, crystal: 2000 } },
  { id: 5, name: '学者', desc: '任意科技达到 Lv.5', hint: '持续升级研究实验室', nameEn: 'Scholar', descEn: 'Reach Lv.5 in any technology', hintEn: 'Keep upgrading the research lab' },
  { id: 6, name: '掠夺者', desc: '累计缴获 100,000 资源', hint: '打赢战斗后自动掠夺', nameEn: 'Raider', descEn: 'Loot 100,000 resources in total', hintEn: 'Winning a battle auto-loots' },
  { id: 7, name: '回收商', desc: '累计回收 10,000 残骸', hint: '战场残骸用回收船收集', nameEn: 'Recycler', descEn: 'Recycle 10,000 debris in total', hintEn: 'Use recyclers to collect battlefield debris' },
  { id: 8, name: '全能舰队', desc: '同时拥有全部 8 种舰船', hint: '收集党狂喜', nameEn: 'Full Fleet', descEn: 'Own all 8 ship types at once', hintEn: 'Completionist joy' },
  { id: 9, name: '战争之王', desc: '拥有一艘战列舰', hint: '顶级火力平台', nameEn: 'War Lord', descEn: 'Own a battleship', hintEn: 'The ultimate firepower platform', reward: { metal: 10000, crystal: 5000 } },
  { id: 10, name: '盾墙', desc: '建有 10 座防御设施', hint: '保卫你的资源', nameEn: 'Shield Wall', descEn: 'Build 10 defence structures', hintEn: 'Protect your resources' },
  { id: 11, name: '导弹之父', desc: '发射第一枚星际导弹', hint: '先建导弹发射井', nameEn: 'Missile Father', descEn: 'Launch your first interstellar missile', hintEn: 'Build a missile silo first' },
  { id: 12, name: '精打细算', desc: '完成第一笔商人交易', hint: '顶栏星际商人按钮', nameEn: 'Frugal', descEn: 'Complete your first merchant trade', hintEn: 'The merchant button in the top bar' },
  { id: 13, name: '智囊团', desc: '雇佣一位军官', hint: '军官 tab，维护费不便宜', nameEn: 'Brain Trust', descEn: 'Hire an officer', hintEn: 'Officer tab — upkeep is not cheap' },
  { id: 14, name: '探险家', desc: '完成 10 次深空远征', hint: '星系页 16 号位', nameEn: 'Explorer', descEn: 'Complete 10 deep space expeditions', hintEn: 'Slot 16 on the Galaxy page', reward: { deuterium: 10000 } },
  { id: 15, name: '征服者', desc: '在银河 3 赢得一场战斗', hint: '精英区的硬仗', nameEn: 'Conqueror', descEn: 'Win a battle in galaxy 3', hintEn: 'The tough fights live in the elite zone' },
  { id: 16, name: '毁灭者', desc: '累计摧毁 100 座防御设施', hint: '导弹和轰炸机是你的朋友', nameEn: 'Destroyer', descEn: 'Destroy 100 defence structures in total', hintEn: 'Missiles and bombers are your friends' },
  { id: 17, name: '月球漫步者', desc: '拥有一颗月球', hint: '防御战打出 10 万+ 残骸就有机会凝聚月球', nameEn: 'Moonwalker', descEn: 'Own a moon', hintEn: 'Win 100k+ debris in defence battles and a moon may condense', reward: { crystal: 5000, deuterium: 2000 } },
  { id: 18, name: '灭月者', desc: '用死星摧毁一颗 NPC 月球', hint: '银河 2/3 的硬区 NPC 才有月球', nameEn: 'Moonslayer', descEn: 'Destroy an NPC moon with a Death Star', hintEn: 'Only hard-zone NPCs in galaxies 2/3 have moons' },
  { id: 19, name: '战役英雄', desc: '通关全部 8 个战役关卡', hint: '战役 tab，一关更比一关硬', nameEn: 'Campaign Hero', descEn: 'Clear all 8 campaign stages', hintEn: 'Campaign tab — each stage is harder than the last', reward: { metal: 50000, crystal: 30000, deuterium: 10000 } },
]
