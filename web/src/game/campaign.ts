import type { Resource } from './objects'

export interface CampaignStage {
  id: number
  name: string
  desc: string
  /** 英文名/描述：必填，漏译在编译期暴露 */
  nameEn: string
  descEn: string
  enemyFleet: Record<number, number>
  enemyDefenses: Record<number, number>
  reward: Resource
  rewardShips?: Record<number, number>
}

export const CAMPAIGN_STAGES: CampaignStage[] = [
  { id: 1, name: '巡逻队遭遇战', desc: '一支海盗巡逻小队正在附近游荡，正好拿来练手。', nameEn: 'Patrol Clash', descEn: 'A pirate patrol squad is loitering nearby — perfect practice.', enemyFleet: { 204: 3 }, enemyDefenses: {}, reward: { metal: 2000, crystal: 1000, deuterium: 0 } },
  { id: 2, name: '前哨站突袭', desc: '废弃前哨站被海盗占据，防御薄弱。', nameEn: 'Outpost Raid', descEn: 'An abandoned outpost has been seized by pirates, and its defences are thin.', enemyFleet: { 204: 8 }, enemyDefenses: { 401: 2 }, reward: { metal: 5000, crystal: 2000, deuterium: 1000 } },
  { id: 3, name: '海盗巢穴', desc: '顺藤摸瓜找到了巢穴，守军不少。', nameEn: 'Pirate Lair', descEn: 'Following the trail led you to their lair. The garrison is substantial.', enemyFleet: { 204: 10, 205: 5 }, enemyDefenses: { 401: 5, 402: 3 }, reward: { metal: 10000, crystal: 5000, deuterium: 2000 } },
  // C5：{401:8, 404:2} → {401:8, 403:4}。两座高斯炮（甲 3.5 万/座）让第 4 关装甲总量
  // 跳到 10.2 万，是前后关卡的 2 倍以上，形成难度尖峰；换重激光后 4.8 万，曲线平滑。
  { id: 4, name: '铁幕防线', desc: '一道由重战机与重激光炮组成的防线，需要真正的火力。', nameEn: 'Iron Curtain Line', descEn: 'A line of heavy fighters and heavy lasers. This one needs real firepower.', enemyFleet: { 204: 15, 205: 10 }, enemyDefenses: { 401: 8, 403: 4 }, reward: { metal: 20000, crystal: 10000, deuterium: 5000 } },
  { id: 5, name: '深空伏击', desc: '巡洋舰首次登场。小心它的快速射击。', nameEn: 'Deep Space Ambush', descEn: 'Cruisers make their debut. Watch out for their rapid fire.', enemyFleet: { 204: 20, 205: 15, 206: 2 }, enemyDefenses: { 402: 6, 403: 2 }, reward: { metal: 30000, crystal: 15000, deuterium: 8000 }, rewardShips: { 205: 1 } },
  { id: 6, name: '要塞攻坚战', desc: '巡洋舰编队驻防的硬骨头，建议带轰炸机。', nameEn: 'Fortress Assault', descEn: 'A cruiser squadron is garrisoned here. Bring bombers.', enemyFleet: { 205: 20, 206: 8 }, enemyDefenses: { 403: 6, 404: 3, 503: 4 }, reward: { metal: 60000, crystal: 30000, deuterium: 15000 } },
  { id: 7, name: '精英护航队', desc: '战列舰出现了。这是对你舰队成色的真正考验。', nameEn: 'Elite Escort', descEn: 'Battleships have appeared. This is a real test of your fleet quality.', enemyFleet: { 205: 20, 206: 10, 207: 4 }, enemyDefenses: { 404: 5, 405: 3 }, reward: { metal: 100000, crystal: 50000, deuterium: 25000 }, rewardShips: { 206: 1 } },
  { id: 8, name: '月面最终堡垒', desc: '月球背面的最后据点，固若金汤。打完这一仗，银河皆知你名。', nameEn: 'Lunar Final Bastion', descEn: 'The last stronghold on the far side of the moon. After this, the galaxy knows your name.', enemyFleet: { 204: 30, 205: 25, 206: 10, 207: 6 }, enemyDefenses: { 403: 10, 404: 5, 406: 2, 503: 8 }, reward: { metal: 200000, crystal: 100000, deuterium: 50000 }, rewardShips: { 207: 1 } },
]

// 精英战役：与普通战役一一对应（同 ID），但敌军舰队/防御量翻倍、首通奖励保持不变，
// 且不再派送舰船（普通 5/7/8 关送了 205/206/207，精英只给资源——避免玩家纯靠首通白嫖顶级舰船）。
// 精英关卡不参与成就 19「战役英雄」（8 关普通首通）判定，也不影响 tutorial 第 13 步。
export const CAMPAIGN_ELITE_STAGES: CampaignStage[] = [
  { id: 1, name: '巡逻队遭遇战', desc: '海盗增援已到，巡逻队规模翻倍。', nameEn: 'Patrol Clash', descEn: 'Pirate reinforcements have arrived — the patrol is twice as large.', enemyFleet: { 204: 6 }, enemyDefenses: {}, reward: { metal: 2000, crystal: 1000, deuterium: 0 } },
  { id: 2, name: '前哨站突袭', desc: '前哨站已加固防御，驻军加倍。', nameEn: 'Outpost Raid', descEn: 'The outpost has fortified its defences and doubled its garrison.', enemyFleet: { 204: 16 }, enemyDefenses: { 401: 4 }, reward: { metal: 5000, crystal: 2000, deuterium: 1000 } },
  { id: 3, name: '海盗巢穴', desc: '海盗补充了重型战机，防线火力倍增。', nameEn: 'Pirate Lair', descEn: 'The pirates brought in heavy fighters; defensive firepower has doubled.', enemyFleet: { 204: 20, 205: 10 }, enemyDefenses: { 401: 10, 402: 6 }, reward: { metal: 10000, crystal: 5000, deuterium: 2000 } },
  { id: 4, name: '铁幕防线', desc: '防线密度翻倍，炮位交错掩护。', nameEn: 'Iron Curtain Line', descEn: 'Twice the defensive density, with overlapping artillery fields.', enemyFleet: { 204: 30, 205: 20 }, enemyDefenses: { 401: 16, 403: 8 }, reward: { metal: 20000, crystal: 10000, deuterium: 5000 } },
  { id: 5, name: '深空伏击', desc: '巡洋舰双倍编队包围，火力密度翻倍。', nameEn: 'Deep Space Ambush', descEn: 'A doubled cruiser squadron surrounds you; fire density is doubled.', enemyFleet: { 204: 40, 205: 30, 206: 4 }, enemyDefenses: { 402: 12, 403: 4 }, reward: { metal: 30000, crystal: 15000, deuterium: 8000 } },
  { id: 6, name: '要塞攻坚战', desc: '要塞进入一级战备，巡洋舰与炮台倍增。', nameEn: 'Fortress Assault', descEn: 'The fortress is at full readiness, with doubled cruisers and turrets.', enemyFleet: { 205: 40, 206: 16 }, enemyDefenses: { 403: 12, 404: 6, 503: 8 }, reward: { metal: 60000, crystal: 30000, deuterium: 15000 } },
  { id: 7, name: '精英护航队', desc: '战列舰护航舰队列阵，再加一支精锐分舰队。', nameEn: 'Elite Escort', descEn: 'Battleship escort line plus an elite task force.', enemyFleet: { 205: 40, 206: 20, 207: 8 }, enemyDefenses: { 404: 10, 405: 6 }, reward: { metal: 100000, crystal: 50000, deuterium: 25000 } },
  { id: 8, name: '月面最终堡垒', desc: '堡垒全面动员，整支舰队进入战斗警戒。', nameEn: 'Lunar Final Bastion', descEn: 'The bastion is fully mobilised and the entire fleet is on combat alert.', enemyFleet: { 204: 60, 205: 50, 206: 20, 207: 12 }, enemyDefenses: { 403: 20, 404: 10, 406: 4, 503: 16 }, reward: { metal: 200000, crystal: 100000, deuterium: 50000 } },
]
