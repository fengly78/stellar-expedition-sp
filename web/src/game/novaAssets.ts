import type { CSSProperties } from 'react'

type AtlasStyle = CSSProperties & { '--atlas-x'?: string; '--atlas-y'?: string }

const BUILDING_IDS = new Set([1, 2, 3, 4, 14, 21, 22, 23, 24, 31, 33, 41, 42, 43, 44])
// 聚变电站（12）暂无专属贴图：占位用 41 穹顶（反应堆外形最接近），出图后替换
const BUILDING_ATLAS_FALLBACK: Record<number, number> = { 12: 41 }
const SHIP_IDS = new Set([202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 218])
// 215 战列巡航舰/213 毁灭者/218 收割者暂无专属贴图：先就近占位（出图后替换）
const SHIP_ATLAS_FALLBACK: Record<number, number> = { 215: 207, 213: 211, 218: 214 }
const DEFENSE_IDS = new Set([401, 402, 403, 404, 405, 406, 407, 408, 502, 503])

function objectStyle(file: string): AtlasStyle {
  return {
    backgroundImage: `url('/nova/objects/${file}.png?v=2')`,
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export function buildingAtlasStyle(id: number): AtlasStyle {
  const mapped = BUILDING_ATLAS_FALLBACK[id]
  return objectStyle(`building-${BUILDING_IDS.has(id) ? id : mapped ?? 14}`)
}

export function blueprintAtlasStyle(id: number, defense: boolean): AtlasStyle {
  const valid = defense ? DEFENSE_IDS.has(id) : SHIP_IDS.has(id)
  const fallback = defense ? 401 : SHIP_ATLAS_FALLBACK[id] ?? 204
  return objectStyle(`${defense ? 'defense' : 'ship'}-${valid ? id : fallback}`)
}
