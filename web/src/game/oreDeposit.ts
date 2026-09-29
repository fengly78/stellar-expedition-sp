/**
 * 矿脉储量系统（CR-2026-09-27-ORE 决策 A 已批，2026-09-27 实施）。
 *
 * 机制结构参考 ogame-vue-ts oreDepositLogic（MIT+NC：仅机制，数值经 CR 重标定——
 * 见 doc/ore-deposit-cr-2026-09-27.md 与 branches/ore_deposit_candidates.json）：
 * - 星球带矿脉储量（金属/晶体/重氢），位置决定初始量（内圈晶体富、外圈重氢富）
 * - 开采消耗储量；剩余 <5% 起产量线性衰减，耗尽保底 20%
 * - 每小时再生初始量的 1%（上限回满）→ "搬空-轮换-回填" 循环
 * - 老存档/无字段：视为满储量（向后兼容分支，永不惩罚旧档）
 *
 * 数值纪律：本表即 web 单机线唯一矿脉常数源（候选参数经 CR 批准定稿 1/50 档）。
 */
import type { Coordinate } from './objects'
import { mulberry32 } from './prng'

export interface OreDeposits {
  metal: number
  crystal: number
  deuterium: number
}

/** 基础储量（CR 批准：vue-ts 原值的 1/50，使 Lv30+ 会话可感知） */
export const ORE_BASE: OreDeposits = { metal: 100_000_000, crystal: 60_000_000, deuterium: 30_000_000 }

/** 位置系数（1-15）：内圈晶体富、外圈重氢富——与 POS_COEF 同方向、强度更低（叠加不冲突） */
const POS_MUL: Record<keyof OreDeposits, number[]> = {
  metal: [0.8, 0.85, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75],
  crystal: [1.3, 1.25, 1.2, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7],
  deuterium: [0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7],
}

const DECAY_START = 0.05
const MIN_EFFICIENCY = 0.2
const REGEN_RATE_PER_HOUR = 0.01

/** 初始储量（位置决定；±20% 确定性浮动——coords 派生 seed，非 Math.random） */
export function initialDeposits(coords: Coordinate): OreDeposits {
  const rng = mulberry32(coords.galaxy * 100000 + coords.system * 1000 + coords.position)
  const out = {} as OreDeposits
  for (const res of ['metal', 'crystal', 'deuterium'] as const) {
    const pos = Math.min(15, Math.max(1, coords.position))
    const variance = 0.8 + rng() * 0.4 // ±20%
    out[res] = Math.floor(ORE_BASE[res] * POS_MUL[res][pos - 1] * variance)
  }
  return out
}

/** 矿脉效率（产量乘子）：>=5% 满效率；耗尽保底 20%；其间线性。 */
export function depositEfficiency(deposits: OreDeposits | undefined, initial: OreDeposits | undefined, res: keyof OreDeposits): number {
  if (!deposits || !initial) return 1 // 老存档/无数据：满效率（向后兼容）
  const init = initial[res]
  if (init <= 0) return MIN_EFFICIENCY
  const remaining = deposits[res] / init
  if (remaining >= DECAY_START) return 1
  if (deposits[res] <= 0) return MIN_EFFICIENCY
  const progress = remaining / DECAY_START
  return MIN_EFFICIENCY + (1 - MIN_EFFICIENCY) * progress
}

/** 剩余百分比（UI 储量条用；无数据返回 1） */
export function depositPercentage(deposits: OreDeposits | undefined, initial: OreDeposits | undefined, res: keyof OreDeposits): number {
  if (!deposits || !initial || initial[res] <= 0) return 1
  return Math.max(0, Math.min(1, deposits[res] / initial[res]))
}

/** 结算一步：按产量消耗储量 + 再生。dtMs 为游戏毫秒。 */
export function settleDeposits(deposits: OreDeposits, initial: OreDeposits, production: { metal: number; crystal: number; deuterium: number }, dtMs: number): OreDeposits {
  const dtHours = dtMs / 3600000
  const out = { ...deposits }
  for (const res of ['metal', 'crystal', 'deuterium'] as const) {
    const consumed = production[res] * dtHours
    const regenerated = initial[res] * REGEN_RATE_PER_HOUR * dtHours
    out[res] = Math.max(0, Math.min(initial[res], deposits[res] - consumed + regenerated))
  }
  return out
}
