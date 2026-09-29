import { initialDeposits } from './oreDeposit'

export const SPEED = 4

export interface Resource {
  metal: number
  crystal: number
  deuterium: number
}

export interface Coordinate {
  galaxy: number
  system: number
  position: number
}

export type EngineType = 'combustion' | 'pulse' | 'hyper'

export interface ShipDef {
  id: number
  name: string
  nameEn: string
  attack: number
  shield: number
  hull: number
  speed: number
  cargo: number
  fuel: number
  engine: EngineType
  baseTime: number
  cost: Resource
  requires: Record<number, number>
  rapidfire: Record<number, number>
}

export const SHIPS: Record<number, ShipDef> = {
  202: { id: 202, name: '小型运输船', nameEn: 'Small Cargo', attack: 5, shield: 10, hull: 4000, speed: 5000, cargo: 5000, fuel: 20, engine: 'combustion', baseTime: 3.2, cost: { metal: 2000, crystal: 2000, deuterium: 0 }, requires: { 21: 2, 115: 2 }, rapidfire: {} },
  203: { id: 203, name: '大型运输船', nameEn: 'Large Cargo', attack: 5, shield: 25, hull: 12000, speed: 7500, cargo: 25000, fuel: 50, engine: 'combustion', baseTime: 9.6, cost: { metal: 6000, crystal: 6000, deuterium: 0 }, requires: { 21: 4, 115: 6 }, rapidfire: {} },
  204: { id: 204, name: '轻型战斗机', nameEn: 'Light Fighter', attack: 50, shield: 10, hull: 400, speed: 12500, cargo: 50, fuel: 20, engine: 'combustion', baseTime: 2.4, cost: { metal: 3000, crystal: 500, deuterium: 0 }, requires: { 21: 1, 115: 1 }, rapidfire: { 210: 5, 212: 5 } }, // ponytail: 晶体消耗出口。原 cost 纯金属让中期晶体无人接，矿-科-船三角断
  205: { id: 205, name: '重型战斗机', nameEn: 'Heavy Fighter', attack: 150, shield: 25, hull: 1000, speed: 10000, cargo: 100, fuel: 75, engine: 'combustion', baseTime: 6.4, cost: { metal: 6000, crystal: 2000, deuterium: 0 }, requires: { 21: 3, 117: 2 }, rapidfire: { 202: 3, 210: 5, 212: 5 } },
  206: { id: 206, name: '巡洋舰', nameEn: 'Cruiser', attack: 400, shield: 50, hull: 2700, speed: 15000, cargo: 800, fuel: 300, engine: 'pulse', baseTime: 24.8, cost: { metal: 20000, crystal: 7000, deuterium: 2000 }, requires: { 21: 5, 117: 4, 121: 2 }, rapidfire: { 204: 6, 210: 5, 212: 5, 401: 10 } },
  207: { id: 207, name: '战列舰', nameEn: 'Battleship', attack: 1200, shield: 200, hull: 6000, speed: 10000, cargo: 1500, fuel: 750, engine: 'pulse', baseTime: 48, cost: { metal: 45000, crystal: 15000, deuterium: 0 }, requires: { 21: 7, 117: 5, 121: 2 }, rapidfire: { 210: 5, 212: 5 } },
  // 殖民船门槛 {21:4,117:1}（P1-③ 2026-09-27 体验修复）：原 脉冲引擎 Lv.3 需要实验室 3 级
  // +能源链长磨，把首次殖民（成就"奠基者"）推得过深。经典 OGame 殖民船只需中级引擎起步——
  // 降为脉冲 Lv.1（船坞 4 保持，仍是中期建筑投资）。
  208: { id: 208, name: '殖民船', nameEn: 'Colony Ship', attack: 50, shield: 100, hull: 30000, speed: 2500, cargo: 7500, fuel: 600, engine: 'pulse', baseTime: 33.6, cost: { metal: 8000, crystal: 12000, deuterium: 4000 }, requires: { 21: 4, 117: 1 }, rapidfire: {} },
  209: { id: 209, name: '回收船', nameEn: 'Recycler', attack: 1, shield: 10, hull: 16000, speed: 2000, cargo: 20000, fuel: 300, engine: 'combustion', baseTime: 9.6, cost: { metal: 10000, crystal: 6000, deuterium: 2000 }, requires: { 21: 4, 115: 6 }, rapidfire: {} },
  // 探测器门槛 {21:2, 115:1}：教程设计是「先侦察、后出击」（步骤 10-12），
  // 旧门槛 21:3+115:3 让首战前根本造不出探测器，被迫盲打安全区 NPC 全灭。
  210: { id: 210, name: '间谍探测器', nameEn: 'Espionage Probe', attack: 0, shield: 0, hull: 1000, speed: 100000000, cargo: 5, fuel: 1, engine: 'combustion', baseTime: 0.8, cost: { metal: 0, crystal: 2000, deuterium: 0 }, requires: { 21: 2, 115: 1 }, rapidfire: {} }, // ponytail: 抬升一次性侦察成本。原 1k crystal 让 R7（廉价堆探测器揭示编制）几乎无门槛
  211: { id: 211, name: '轰炸机', nameEn: 'Bomber', attack: 1000, shield: 500, hull: 7500, speed: 4000, cargo: 500, fuel: 1000, engine: 'pulse', baseTime: 76, cost: { metal: 50000, crystal: 25000, deuterium: 15000 }, requires: { 21: 8, 117: 6, 121: 5 }, rapidfire: { 210: 5, 212: 5, 401: 20, 402: 20, 403: 10, 404: 5, 405: 10, 406: 5 } },
  // 以下三舰 2026-09-27 补齐（对照 ogamex MilitaryShipObjects，数值 1:1）：
  215: { id: 215, name: '战列巡航舰', nameEn: 'Battlecruiser', attack: 700, shield: 400, hull: 7000, speed: 10000, cargo: 750, fuel: 250, engine: 'hyper', baseTime: 87, cost: { metal: 30000, crystal: 40000, deuterium: 15000 }, requires: { 21: 8, 118: 5, 114: 5, 120: 12 }, rapidfire: { 210: 5, 212: 5, 205: 4, 206: 4, 207: 7, 202: 3, 203: 3 } },
  213: { id: 213, name: '毁灭者', nameEn: 'Destroyer', attack: 2000, shield: 500, hull: 11000, speed: 5000, cargo: 2000, fuel: 1000, engine: 'hyper', baseTime: 126, cost: { metal: 60000, crystal: 50000, deuterium: 15000 }, requires: { 21: 9, 118: 6, 114: 5 }, rapidfire: { 210: 5, 212: 5, 402: 10, 215: 2 } },
  218: { id: 218, name: '收割者', nameEn: 'Reaper', attack: 2800, shield: 700, hull: 14000, speed: 7000, cargo: 10000, fuel: 1100, engine: 'hyper', baseTime: 92, cost: { metal: 85000, crystal: 55000, deuterium: 20000 }, requires: { 21: 6, 117: 6, 118: 4, 109: 8, 110: 6 }, rapidfire: { 210: 5, 212: 5, 204: 4, 205: 3, 202: 3, 203: 3 } },
  212: { id: 212, name: '太阳能卫星', nameEn: 'Solar Satellite', attack: 1, shield: 10, hull: 2000, speed: 1, cargo: 0, fuel: 0, engine: 'combustion', baseTime: 2, cost: { metal: 0, crystal: 2000, deuterium: 500 }, requires: { 21: 1 }, rapidfire: {} },
  214: { id: 214, name: '死星', nameEn: 'Death Star', attack: 200000, shield: 50000, hull: 9000000, speed: 100, cargo: 1000000, fuel: 5000, engine: 'pulse', baseTime: 600, cost: { metal: 5000000, crystal: 4000000, deuterium: 1000000 }, requires: { 21: 12, 117: 7, 121: 7, 109: 8 }, rapidfire: { 202: 250, 203: 250, 204: 200, 205: 100, 206: 33, 207: 30, 208: 250, 209: 250, 210: 250, 211: 25, 212: 250, 401: 200, 402: 200, 403: 100, 404: 50, 405: 100 } },
}

export interface BuildingDef {
  id: number
  name: string
  nameEn: string
  cost: Resource
  factor: number
  baseTime: number
  requires: Record<number, number>
  maxLevel: number
}

export const BUILDINGS: Record<number, BuildingDef> = {
  // 三矿无硬性前置（对齐经典）：电力是软约束——耗电超过发电时产量按比例打折，
  // 由 diagnoseEnergy 驱动的红色横幅提示补电站。硬前置会让教程第一步"开采金属"自相矛盾。
  1: { id: 1, name: '金属矿', nameEn: 'Metal Mine', cost: { metal: 60, crystal: 15, deuterium: 0 }, factor: 1.5, baseTime: 60, requires: {}, maxLevel: 0 },
  // C3：factor 1.6→1.5 对齐金属矿。晶体是科技与舰队的主消耗品，
  // 却顶着全表最深的成本指数——"最需要的资源最难深挖"是错配。
  2: { id: 2, name: '晶体矿', nameEn: 'Crystal Mine', cost: { metal: 48, crystal: 24, deuterium: 0 }, factor: 1.5, baseTime: 60, requires: {}, maxLevel: 0 },
  3: { id: 3, name: '重氢合成器', nameEn: 'Deuterium Synthesizer', cost: { metal: 225, crystal: 75, deuterium: 0 }, factor: 1.5, baseTime: 60, requires: {}, maxLevel: 0 },
  // 聚变电站（2026-09-25 补内容缺口）：电力重器，以持续重氢燃耗换高密度发电，
  // 解能源后期墙（此前只有太阳能+卫星）。参数对齐经典成本 900/360/180、factor 1.8。
  12: { id: 12, name: '聚变电站', nameEn: 'Fusion Reactor', cost: { metal: 900, crystal: 360, deuterium: 180 }, factor: 1.8, baseTime: 90, requires: { 3: 5, 113: 5 }, maxLevel: 0 },
  4: { id: 4, name: '太阳能电站', nameEn: 'Solar Plant', cost: { metal: 75, crystal: 30, deuterium: 0 }, factor: 1.5, baseTime: 60, requires: {}, maxLevel: 0 },
  // 机器人工厂无前置（对齐经典）：若挂三矿前置，月面（无矿）永远建不了工厂，
  // 船坞 21 requires 14:2 的依赖链随之断裂，整条月球工业线被锁死。
  14: { id: 14, name: '机器人工厂', nameEn: 'Robotics Factory', cost: { metal: 400, crystal: 120, deuterium: 200 }, factor: 2, baseTime: 60, requires: {}, maxLevel: 0 },
  21: { id: 21, name: '船坞', nameEn: 'Shipyard', cost: { metal: 400, crystal: 200, deuterium: 100 }, factor: 1.75, baseTime: 60, requires: { 14: 2 }, maxLevel: 0 },
  22: { id: 22, name: '金属仓库', nameEn: 'Metal Storage', cost: { metal: 1000, crystal: 0, deuterium: 0 }, factor: 2, baseTime: 60, requires: { 1: 1 }, maxLevel: 10 },
  23: { id: 23, name: '晶体仓库', nameEn: 'Crystal Storage', cost: { metal: 1000, crystal: 500, deuterium: 0 }, factor: 2, baseTime: 60, requires: { 2: 1 }, maxLevel: 10 },
  24: { id: 24, name: '重氢罐', nameEn: 'Deuterium Tank', cost: { metal: 1000, crystal: 1000, deuterium: 0 }, factor: 2, baseTime: 60, requires: { 3: 1 }, maxLevel: 10 },
  31: { id: 31, name: '研究实验室', nameEn: 'Research Lab', cost: { metal: 200, crystal: 400, deuterium: 200 }, factor: 1.75, baseTime: 60, requires: { 1: 3, 2: 3, 3: 3 }, maxLevel: 0 },
  33: { id: 33, name: '地形改造器', nameEn: 'Terraformer', cost: { metal: 0, crystal: 50000, deuterium: 25000 }, factor: 2, baseTime: 60, requires: { 31: 4, 113: 4 }, maxLevel: 0 },
  41: { id: 41, name: '月球基地', nameEn: 'Moon Base', cost: { metal: 8000, crystal: 8000, deuterium: 4000 }, factor: 2, baseTime: 60, requires: {}, maxLevel: 0 },
  42: { id: 42, name: '传感器阵列', nameEn: 'Sensor Phalanx', cost: { metal: 20000, crystal: 40000, deuterium: 20000 }, factor: 2, baseTime: 60, requires: { 41: 1 }, maxLevel: 0 },
  43: { id: 43, name: '跳跃门', nameEn: 'Jump Gate', cost: { metal: 2000000, crystal: 4000000, deuterium: 2000000 }, factor: 2, baseTime: 60, requires: { 41: 2, 117: 5 }, maxLevel: 1 },
  44: { id: 44, name: '导弹发射井', nameEn: 'Missile Silo', cost: { metal: 20000, crystal: 20000, deuterium: 1000 }, factor: 2, baseTime: 60, requires: { 21: 1 }, maxLevel: 10 },
}

export interface TechDef {
  id: number
  name: string
  nameEn: string
  cost: Resource
  factor: number
  maxLevel: number
  requires: Record<number, number>
}

export interface DefenseDef {
  id: number
  name: string
  nameEn: string
  attack: number
  shield: number
  hull: number
  cost: Resource
  requires: Record<number, number>
  maxCount: number
}

export const DEFENSES: Record<number, DefenseDef> = {
  401: { id: 401, name: '火箭发射器', nameEn: 'Rocket Launcher', attack: 80, shield: 20, hull: 2000, cost: { metal: 2000, crystal: 0, deuterium: 0 }, requires: { 21: 1 }, maxCount: 0 },
  402: { id: 402, name: '轻型激光炮', nameEn: 'Light Laser', attack: 100, shield: 25, hull: 2000, cost: { metal: 1500, crystal: 500, deuterium: 0 }, requires: { 21: 2, 120: 3 }, maxCount: 0 },
  403: { id: 403, name: '重型激光炮', nameEn: 'Heavy Laser', attack: 250, shield: 100, hull: 8000, cost: { metal: 6000, crystal: 2000, deuterium: 0 }, requires: { 21: 4, 120: 6 }, maxCount: 0 },
  404: { id: 404, name: '高斯炮', nameEn: 'Gauss Cannon', attack: 1100, shield: 200, hull: 35000, cost: { metal: 20000, crystal: 15000, deuterium: 2000 }, requires: { 21: 6, 113: 6, 109: 3 }, maxCount: 0 },
  405: { id: 405, name: '离子炮', nameEn: 'Ion Cannon', attack: 150, shield: 500, hull: 8000, cost: { metal: 2000, crystal: 6000, deuterium: 0 }, requires: { 21: 4, 121: 4 }, maxCount: 0 },
  406: { id: 406, name: '等离子炮台', nameEn: 'Plasma Turret', attack: 3000, shield: 300, hull: 100000, cost: { metal: 50000, crystal: 50000, deuterium: 30000 }, requires: { 21: 8, 121: 7, 109: 5 }, maxCount: 0 },
  407: { id: 407, name: '小型护盾罩', nameEn: 'Small Shield Dome', attack: 1, shield: 2000, hull: 2000, cost: { metal: 10000, crystal: 10000, deuterium: 0 }, requires: { 21: 6, 113: 3 }, maxCount: 1 },
  408: { id: 408, name: '大型护盾罩', nameEn: 'Large Shield Dome', attack: 1, shield: 10000, hull: 10000, cost: { metal: 50000, crystal: 50000, deuterium: 0 }, requires: { 21: 6, 113: 6, 407: 1 }, maxCount: 1 },
  502: { id: 502, name: '星际导弹', nameEn: 'Interstellar Missile', attack: 0, shield: 0, hull: 0, cost: { metal: 12500, crystal: 2500, deuterium: 10000 }, requires: { 44: 4, 117: 1 }, maxCount: 0 },
  503: { id: 503, name: '反弹道导弹', nameEn: 'Anti-Ballistic Missile', attack: 0, shield: 0, hull: 0, cost: { metal: 8000, crystal: 0, deuterium: 2000 }, requires: { 44: 2 }, maxCount: 0 },
}

export function isDefense(id: number): boolean {
  return id >= 400 && id < 600
}

export function isMissile(id: number): boolean {
  return id === 502 || id === 503
}

export function siloCapacity(siloLevel: number): number {
  return siloLevel * 10
}

export const TECHS: Record<number, TechDef> = {
  106: { id: 106, name: '间谍技术', nameEn: 'Espionage Technology', cost: { metal: 200, crystal: 1000, deuterium: 200 }, factor: 2, maxLevel: 0, requires: { 31: 3 } },
  108: { id: 108, name: '计算机技术', nameEn: 'Computer Technology', cost: { metal: 0, crystal: 400, deuterium: 600 }, factor: 2, maxLevel: 4, requires: { 31: 1 } },
  109: { id: 109, name: '武器技术', nameEn: 'Weapons Technology', cost: { metal: 800, crystal: 200, deuterium: 0 }, factor: 2, maxLevel: 0, requires: { 31: 4 } },
  110: { id: 110, name: '护盾技术', nameEn: 'Shielding Technology', cost: { metal: 200, crystal: 600, deuterium: 0 }, factor: 2, maxLevel: 0, requires: { 31: 4, 113: 3 } },
  111: { id: 111, name: '装甲技术', nameEn: 'Armour Technology', cost: { metal: 1000, crystal: 0, deuterium: 0 }, factor: 2, maxLevel: 0, requires: { 31: 2 } },
  113: { id: 113, name: '能源技术', nameEn: 'Energy Technology', cost: { metal: 0, crystal: 800, deuterium: 400 }, factor: 1.75, maxLevel: 0, requires: { 31: 1 } },
  114: { id: 114, name: '超空间技术', nameEn: 'Hyperspace Technology', cost: { metal: 0, crystal: 4000, deuterium: 2000 }, factor: 2, maxLevel: 0, requires: { 31: 7, 113: 5, 110: 5 } },
  115: { id: 115, name: '燃烧引擎', nameEn: 'Combustion Drive', cost: { metal: 400, crystal: 0, deuterium: 600 }, factor: 2, maxLevel: 0, requires: { 31: 1, 113: 1 } },
  117: { id: 117, name: '脉冲引擎', nameEn: 'Impulse Drive', cost: { metal: 1200, crystal: 2000, deuterium: 500 }, factor: 1.6, maxLevel: 0, requires: { 31: 2, 113: 1 } },
  118: { id: 118, name: '超空间引擎', nameEn: 'Hyperspace Drive', cost: { metal: 10000, crystal: 20000, deuterium: 6000 }, factor: 2, maxLevel: 0, requires: { 31: 7, 114: 3 } },
  120: { id: 120, name: '激光技术', nameEn: 'Laser Technology', cost: { metal: 200, crystal: 100, deuterium: 0 }, factor: 2, maxLevel: 0, requires: { 31: 1, 113: 2 } },
  121: { id: 121, name: '离子技术', nameEn: 'Ion Technology', cost: { metal: 1000, crystal: 300, deuterium: 100 }, factor: 2, maxLevel: 0, requires: { 31: 4, 120: 5, 113: 4 } },
}

export function productionFactor(level: number): number {
  return level * Math.pow(1.1, level)
}

export function metalProduction(level: number, posCoef = 1): number {
  return 50 * productionFactor(level) * posCoef * SPEED
}

export function crystalProduction(level: number, posCoef = 1): number {
  return 35 * productionFactor(level) * posCoef * SPEED
}

export function deuteriumProduction(level: number, tempMax: number): number {
  const kt = 1.44 - 0.004 * tempMax
  return 18 * productionFactor(level) * kt * SPEED
}

// 能源量纲统一（选项 B）：发电与耗电走同一骨架 L×1.1^L、同一量纲（每游戏小时），
// 都不额外乘 SPEED——对齐 OGameX 的标准做法。旧实现发电 ×SPEED 而耗电不乘，
// 同级供需比恒为 2.00，减产机制从未生效。
// 基数 20→40 使三矿（10+10+20）与电站同级时供需比恰好 1.0：
// "电站跟上就不减产，落后才被罚"，对跟上进度的存档零冲击。
export function solarOutput(level: number, energyTech: number): number {
  return 40 * productionFactor(level) * (1 + 0.05 * energyTech)
}

// 聚变电站：基数取太阳能 1.5 倍（经典 30/20 同比例），能源科技每级 +5%；
// 燃耗 20×pf 重氢/级（与重氢合成器耗电同族基数）。净效果经 planetProduction 单一真值源生效。
export function fusionOutput(level: number, energyTech: number): number {
  return 60 * productionFactor(level) * (1 + 0.05 * energyTech)
}

export function fusionFuelBurn(level: number): number {
  return 20 * productionFactor(level)
}

export function satelliteEnergy(count: number, tempMax: number): number {
  return count * (15 + tempMax * 0.12)
}

// 用 truthy 判断军官是否已雇佣，因此布尔值或 OfficerState 对象都可传入。
export interface ProductionOfficers {
  geologist?: unknown
  engineer?: unknown
}

export interface PlanetProduction {
  metal: number
  crystal: number
  deuterium: number
  energyOut: number
  energyIn: number
  factor: number
  /** 矿脉效率（CR-2026-09-27-ORE）：三资源各自 0.2-1，缺省 1（老档/无字段）。诊断用，结算已内含 */
  oreFactors?: { metal: number; crystal: number; deuterium: number }
}

/**
 * 星球产出的单一真值源。
 *
 * 结算（state.ts 的 produce）与所有 UI 展示必须调用本函数。此前 UI 侧各自内联了一份计
 * 算并漏掉了位置系数、太阳能卫星、军官加成与太阳风暴修正，导致殖民地显示产量比实际到账
 * 高出最多 30%。新增任何产出修正项时，只改这里。
 */
export function planetProduction(
  planet: { buildings: Record<number, number>; ships?: Record<number, number>; temperatureMax: number; posCoef?: Resource; oreDeposits?: { metal: number; crystal: number; deuterium: number } },
  techs: Record<number, number>,
  opts: { officers?: ProductionOfficers; flare?: boolean; oreInitial?: { metal: number; crystal: number; deuterium: number } } = {},
): PlanetProduction {
  const b = planet.buildings
  const sats = planet.ships?.[212] ?? 0
  const geoMul = opts.officers?.geologist ? 1.15 : 1
  const engMul = opts.officers?.engineer ? 1.1 : 1
  const fusionLevel = b[12] ?? 0
  const energyOut =
    solarOutput(b[4] ?? 0, techs[113] ?? 0) * engMul +
    satelliteEnergy(sats, planet.temperatureMax) +
    fusionOutput(fusionLevel, techs[113] ?? 0) * engMul
  const energyIn = energyConsumption(b[1] ?? 0) + energyConsumption(b[2] ?? 0) + energyConsumption(b[3] ?? 0, true)
  let factor = withEnergyDeficit(1, energyOut, energyIn)
  if (opts.flare) factor *= 0.75

  const c = planet.posCoef
  // 矿脉效率（CR-2026-09-27-ORE 决策 A）：三资源各自 0.2-1，缺省 1（老档）。
  // oreInitial 不传 = 老调用方未启用矿脉，恒满效率；游戏界面使用 planetProductionForPlanet。
  const oreF = {
    metal: opts.oreInitial && planet.oreDeposits ? oreEfficiency(planet.oreDeposits, opts.oreInitial, 'metal') : 1,
    crystal: opts.oreInitial && planet.oreDeposits ? oreEfficiency(planet.oreDeposits, opts.oreInitial, 'crystal') : 1,
    deuterium: opts.oreInitial && planet.oreDeposits ? oreEfficiency(planet.oreDeposits, opts.oreInitial, 'deuterium') : 1,
  }
  // 重氢为净额：聚变燃耗是固定运营成本，不吃能源打折/地质学家加成/矿脉衰减
  return {
    metal: metalProduction(b[1] ?? 0, c?.metal ?? 1) * factor * geoMul * oreF.metal,
    crystal: crystalProduction(b[2] ?? 0, c?.crystal ?? 1) * factor * geoMul * oreF.crystal,
    deuterium:
      deuteriumProduction(b[3] ?? 0, planet.temperatureMax) * (c?.deuterium ?? 1) * factor * geoMul * oreF.deuterium -
      fusionFuelBurn(fusionLevel),
    energyOut,
    energyIn,
    factor,
    oreFactors: oreF,
  }
}

/** UI 与结算共用矿脉口径；旧存档缺少矿脉字段时仍保持满效率。 */
export function planetProductionForPlanet(
  planet: Parameters<typeof planetProduction>[0] & { coords: Coordinate },
  techs: Record<number, number>,
  opts: Omit<NonNullable<Parameters<typeof planetProduction>[2]>, 'oreInitial'> = {},
): PlanetProduction {
  return planetProduction(planet, techs, { ...opts, oreInitial: initialDeposits(planet.coords) })
}

/** 矿脉效率（产量公式内的轻量实现；规则口径见 oreDeposit.ts）。 */
function oreEfficiency(deposits: { metal: number; crystal: number; deuterium: number }, initial: { metal: number; crystal: number; deuterium: number }, res: 'metal' | 'crystal' | 'deuterium'): number {
  if (initial[res] <= 0) return 0.2
  const remaining = deposits[res] / initial[res]
  if (remaining >= 0.05) return 1
  if (deposits[res] <= 0) return 0.2
  return 0.2 + 0.8 * (remaining / 0.05)
}

export interface OfficerDef {
  id: string
  name: string
  desc: string
  /** 英文名/描述：必填，漏译在编译期暴露 */
  nameEn: string
  descEn: string
  hireCost: Resource
  weeklyCost: Resource
}

export const OFFICERS: Record<string, OfficerDef> = {
  commander: {
    id: 'commander',
    name: '指挥官',
    desc: '建造时间 -15%，仓储容量 +10%',
    nameEn: 'Commander',
    descEn: 'Build time -15%, storage capacity +10%',
    hireCost: { metal: 0, crystal: 40000, deuterium: 20000 },
    weeklyCost: { metal: 0, crystal: 5000, deuterium: 2500 },
  },
  geologist: {
    id: 'geologist',
    name: '地质学家',
    desc: '所有资源产量 +15%',
    nameEn: 'Geologist',
    descEn: 'All resource output +15%',
    hireCost: { metal: 30000, crystal: 30000, deuterium: 20000 },
    weeklyCost: { metal: 3000, crystal: 3000, deuterium: 2000 },
  },
  engineer: {
    id: 'engineer',
    name: '工程师',
    desc: '防御设施护盾/装甲 +15%，太阳能电站产出 +10%',
    nameEn: 'Engineer',
    descEn: 'Defence shield/armour +15%, solar plant output +10%',
    hireCost: { metal: 40000, crystal: 20000, deuterium: 10000 },
    weeklyCost: { metal: 4000, crystal: 2000, deuterium: 1000 },
  },
  // R10 D-1 (P3.8) — 战术官：远征/攻击舰队火力 +10%
  tactician: {
    id: 'tactician',
    name: '战术官',
    desc: '战斗舰队火力 +10%（远征奖励 + 攻击战损）',
    nameEn: 'Tactician',
    descEn: 'Combat fleet firepower +10% (expedition rewards + attack losses)',
    hireCost: { metal: 50000, crystal: 40000, deuterium: 15000 },
    weeklyCost: { metal: 5000, crystal: 4000, deuterium: 1500 },
  },
  // R10 D-1 (P3.8) — 外交官：NPC 反击舰队强度 -10%
  ambassador: {
    id: 'ambassador',
    name: '外交官',
    desc: 'NPC 反击舰队强度 -10%',
    nameEn: 'Ambassador',
    descEn: 'NPC counterattack fleet strength -10%',
    hireCost: { metal: 35000, crystal: 35000, deuterium: 25000 },
    weeklyCost: { metal: 3500, crystal: 3500, deuterium: 2500 },
  },
}

export function energyConsumption(level: number, deuterium = false): number {
  return (deuterium ? 20 : 10) * productionFactor(level)
}

export function withEnergyDeficit(production: number, output: number, consumption: number): number {
  if (consumption <= 0) return production
  let ratio = output / consumption
  if (ratio > 1) ratio = 1
  if (ratio < 0.2) ratio = 0.2
  return production * ratio
}

export interface EnergyDiagnosis {
  /** 实际生效的产量倍率（1 = 满产，最低 0.2） */
  factor: number
  shortfall: number
  /** 补满缺口所需的太阳能电站等级（已是该等级时返回 0） */
  solarLevelNeeded: number
  /** 若不想升电站，改用太阳能卫星补缺口所需的数量 */
  satellitesNeeded: number
  /** 缺口已被打到 0.2 下限，即使再补也拿不回全部产能 */
  floored: boolean
}

/**
 * 电力缺口诊断。
 *
 * 玩家最容易踩的坑是「猛挖矿、不建电站」——矿井耗电随等级指数上升，太阳能电站一旦落后
 * 就会被 withEnergyDeficit 静默打折，而 UI 上原本只有一处会变红的数字，没有任何文字说明，
 * 玩家只会觉得"产能莫名其妙很低"。本函数把"缺多少、怎么补"算成可直接展示的结论。
 */
export function diagnoseEnergy(
  output: number,
  consumption: number,
  planet: { buildings: Record<number, number>; temperatureMax: number },
  energyTech = 0,
): EnergyDiagnosis {
  const ratio = consumption <= 0 ? 1 : output / consumption
  const factor = Math.min(1, Math.max(0.2, ratio))
  const shortfall = Math.max(0, consumption - output)
  if (shortfall <= 0) return { factor: 1, shortfall: 0, solarLevelNeeded: 0, satellitesNeeded: 0, floored: false }

  const solarLevel = planet.buildings[4] ?? 0
  let solarLevelNeeded = 0
  for (let lv = solarLevel + 1; lv <= solarLevel + 60; lv++) {
    if (solarOutput(lv, energyTech) - solarOutput(solarLevel, energyTech) >= shortfall) {
      solarLevelNeeded = lv
      break
    }
  }
  const perSat = satelliteEnergy(1, planet.temperatureMax)
  return {
    factor,
    shortfall,
    solarLevelNeeded,
    satellitesNeeded: perSat > 0 ? Math.ceil(shortfall / perSat) : 0,
    floored: ratio < 0.2,
  }
}

export function storageCapacity(storageLevel: number): number {
  return 10000 * Math.pow(2, storageLevel)
}

export function buildingCost(b: BuildingDef, currentLevel: number): Resource {
  const f = Math.pow(b.factor, currentLevel)
  return { metal: b.cost.metal * f, crystal: b.cost.crystal * f, deuterium: b.cost.deuterium * f }
}

export function buildingTime(b: BuildingDef, currentLevel: number, roboticsLevel: number): number {
  return (b.baseTime * Math.pow(b.factor, currentLevel)) / SPEED / (1 + roboticsLevel)
}

export function shipBuildTime(shipId: number, shipyardLevel: number): number {
  const ship = SHIPS[shipId]
  let base: number
  if (ship) {
    base = ship.baseTime
  } else {
    // 防御单位没有 baseTime，用造价折算。未知 id 直接抛错而不是静默产出 NaN，
    // 否则玩家会看到一个永远不推进的建造队列却查不出原因。
    const def = DEFENSES[shipId]
    if (!def) throw new Error(`未知单位 id: ${shipId}`)
    base = (def.cost.metal + def.cost.crystal + def.cost.deuterium * 2) / 1250
  }
  return base / SPEED / (1 + shipyardLevel)
}

export function techCost(t: TechDef, currentLevel: number): Resource {
  const f = Math.pow(t.factor, currentLevel)
  return { metal: t.cost.metal * f, crystal: t.cost.crystal * f, deuterium: t.cost.deuterium * f }
}

/**
 * 研究时间（秒）。
 *
 * 此前这里直接用**基础成本**（漏了 factor^level），导致高等级科技研究时间几乎为 0：
 * 武器技术 Lv.20 成本 8.39 亿，耗时却只有约 11 秒。时间这个维度在科技线上完全消失，
 * 门槛全压在 canResearch（实验室等级）上。
 *
 * 改用 cost^0.3 而非线性成本：时间随等级增长，又不像直接乘 factor^level 那样指数爆炸。
 * 0.3 这个软化指数取自参考实现 ogame-vue-ts（src/logic/researchLogic.ts）：
 *   elementCost = Σ(cost_X^0.3) / 0.003
 *   time       = elementCost / ((1 + lab) * (1 + energyTech*0.05) * speed)
 * 成本增长被压到 0.3 次方，终局科技仍可在合理时间内完成。
 *
 * 下限 5 秒：避免低等级小科技出现 0 秒或 1 秒这种无意义的排队。
 */
export function researchTime(t: TechDef, currentLevel: number, labLevel: number, energyTech = 0): number {
  const f = Math.pow(t.factor, currentLevel)
  const sum =
    Math.pow(t.cost.metal * f, 0.3) + Math.pow(t.cost.crystal * f, 0.3) + Math.pow(t.cost.deuterium * f, 0.3)
  const elementCost = sum / 0.003
  return Math.max(5, Math.floor(elementCost / SPEED / ((1 + labLevel) * (1 + energyTech * 0.05))))
}

export function canResearch(techLevel: number, labLevel: number): boolean {
  return labLevel > techLevel
}

export function meetsRequires(levels: Record<number, number>, requires: Record<number, number>): boolean {
  for (const id in requires) {
    if ((levels[+id] ?? 0) < requires[+id]) return false
  }
  return true
}

export function shipSpec(id: number, techs: Record<number, number>): { unitId: number; attack: number; shield: number; hull: number; rapidfire: Record<number, number> } {
  const s = SHIPS[id]
  const w = 1 + 0.1 * (techs[109] ?? 0)
  const sh = 1 + 0.1 * (techs[110] ?? 0)
  const h = 1 + 0.1 * (techs[111] ?? 0)
  return { unitId: id, attack: s.attack * w, shield: s.shield * sh, hull: s.hull * h, rapidfire: s.rapidfire }
}

export function unitBattleSpec(id: number, techs: Record<number, number>): { unitId: number; attack: number; shield: number; hull: number; rapidfire: Record<number, number> } {
  if (isDefense(id)) {
    const d = DEFENSES[id]
    const w = 1 + 0.1 * (techs[109] ?? 0)
    const sh = 1 + 0.1 * (techs[110] ?? 0)
    const h = 1 + 0.1 * (techs[111] ?? 0)
    return { unitId: id, attack: d.attack * w, shield: d.shield * sh, hull: d.hull * h, rapidfire: {} }
  }
  return shipSpec(id, techs)
}

export function unitCost(id: number): Resource {
  return isDefense(id) ? DEFENSES[id].cost : SHIPS[id].cost
}

export function shipSpeed(id: number, techs: Record<number, number>): number {
  const s = SHIPS[id]
  if (s.engine === 'combustion') return s.speed * (1 + 0.1 * (techs[115] ?? 0))
  if (s.engine === 'hyper') return s.speed * (1 + 0.3 * (techs[118] ?? 0))
  return s.speed * (1 + 0.2 * (techs[117] ?? 0))
}

export function fleetSlots(techs: Record<number, number>): number {
  return Math.min(1 + (techs[108] ?? 0), 5)
}

export function colonyCap(techs: Record<number, number>): number {
  return 3 + (techs[108] ?? 0)
}

// C2：防御设施按座占用星球空间。空间取代资源成为防御的约束后，
// 「每格伤害」取代「每资源伤害」成为选型标准——等离子 750 攻/格 vs 火箭 80 攻/格，
// 高阶防御升级线由此成立（此前同价火箭海全面优于高阶防御，升级线是负收益）。
// 导弹不占星球空间（受发射井 siloCapacity 约束）；护盾罩单体高占位。
export const DEFENSE_FIELDS: Record<number, number> = { 401: 1, 402: 1, 403: 2, 404: 3, 405: 3, 406: 4, 407: 5, 408: 10 }

export function usedFields(buildings: Record<number, number>, defenses: Record<number, number> = {}): number {
  let total = 0
  for (const id in buildings) total += buildings[id]
  for (const id in defenses) total += (DEFENSE_FIELDS[+id] ?? 0) * defenses[id]
  return total
}

export function maxFields(buildings: Record<number, number>, isMoon: boolean): number {
  if (isMoon) return 1 + (buildings[41] ?? 0) * 30
  return 200 + (buildings[33] ?? 0) * 15
}

export const POS_COEF: Record<number, { metal: number; crystal: number; deuterium: number }> = {
  1: { metal: 0.8, crystal: 1.3, deuterium: 0.5 },
  2: { metal: 0.85, crystal: 1.25, deuterium: 0.55 },
  3: { metal: 0.9, crystal: 1.2, deuterium: 0.6 },
  4: { metal: 0.95, crystal: 1.1, deuterium: 0.7 },
  5: { metal: 1, crystal: 1, deuterium: 0.8 },
  6: { metal: 1, crystal: 1, deuterium: 0.9 },
  7: { metal: 1, crystal: 1, deuterium: 1 },
  8: { metal: 1, crystal: 1, deuterium: 1 },
  9: { metal: 1, crystal: 1, deuterium: 1.1 },
  10: { metal: 1, crystal: 0.95, deuterium: 1.2 },
  11: { metal: 0.95, crystal: 0.9, deuterium: 1.3 },
  12: { metal: 0.9, crystal: 0.85, deuterium: 1.4 },
  13: { metal: 0.85, crystal: 0.8, deuterium: 1.5 },
  14: { metal: 0.8, crystal: 0.75, deuterium: 1.6 },
  15: { metal: 0.75, crystal: 0.7, deuterium: 1.7 },
}

// 侦察揭示判定 —— 机制复刻自 OGameX `app/GameMissions/EspionageMission.php`。
//
// 对方间谍技术每领先 1 级，就要多花其平方数个探测器去抵消：
//   有效探测器 = 派出数 − (对方技术 − 己方技术)²
// 每一档情报有两种达成方式（双轨），满足其一即可揭示：
//   有效探测器 ≥ 探测器阈值  或   己方技术 − 等级阈值 ≥ 对方技术
// 四档阈值（探测器数 / 技术领先）：舰队 2/1、防御 3/2、资源 5/3、编制 7/4。
// 即：等级领先 1 级就能看舰队，领先 4 级能把对方编制看穿；否则靠堆探测器硬砸。
export interface EspionageReveal {
  effective: number
  fleet: boolean
  defense: boolean
  resources: boolean
  composition: boolean
}

export function espionageReveal(attackTech: number, defendTech: number, probes: number): EspionageReveal {
  const gap = Math.max(0, defendTech - attackTech)
  const effective = Math.max(0, probes - gap * gap)
  const can = (probeThreshold: number, levelThreshold: number) =>
    effective >= probeThreshold || attackTech - levelThreshold >= defendTech
  return {
    effective,
    fleet: can(2, 1),
    defense: can(3, 2),
    resources: can(5, 3),
    composition: can(7, 4),
  }
}

export function distance(a: Coordinate, b: Coordinate): number {
  if (a.galaxy === b.galaxy && a.system === b.system && a.position === b.position) return 5
  if (a.galaxy === b.galaxy && a.system === b.system) return Math.abs(a.position - b.position) * 1000 + 5
  if (a.galaxy === b.galaxy) return 27000 + Math.abs(a.system - b.system) * 95
  return Math.abs(a.galaxy - b.galaxy) * 1000000
}

export function flightTime(dist: number, slowestSpeed: number): number {
  return Math.max(30, (60 * dist) / slowestSpeed)
}

export function fuelConsumption(baseFuel: number, count: number, dist: number): number {
  return Math.ceil((count * baseFuel * dist) / 35000)
}

export function fleetFuel(fleet: Record<number, number>, dist: number): number {
  let total = 0
  for (const id in fleet) {
    const n = fleet[+id]
    if (n > 0) total += fuelConsumption(SHIPS[+id].fuel, n, dist)
  }
  return Math.ceil(total)
}

export function fleetCargo(fleet: Record<number, number>): number {
  let total = 0
  for (const id in fleet) total += SHIPS[+id].cargo * fleet[+id]
  return total
}

export function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'k'
  return Math.floor(n).toString()
}
