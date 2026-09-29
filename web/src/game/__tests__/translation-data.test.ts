import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '../achievements'
import { CAMPAIGN_ELITE_STAGES, CAMPAIGN_STAGES } from '../campaign'
import { OFFICERS, SHIPS, BUILDINGS, TECHS, DEFENSES } from '../objects'
import { TUTORIAL_STEPS } from '../tutorial'

/**
 * 术语与内容数据的英文完整性。
 *
 * 上一轮给成就/关卡/军官/教程补 `nameEn`/`descEn`/`hintEn` 时，全部是脚本化
 * 插入 90+ 条字符串。类型系统只保证「字段存在」，不保证「字段非空」也不保证
 * 「英文不是中文的复制」——后两者恰好是最可能发生、且最难在界面上看出来的退化。
 * 这里把三条不变量钉死。
 */

const TABLES: Array<[string, Record<string, { name?: string; nameEn?: string }>]> = [
  ['SHIPS', SHIPS],
  ['BUILDINGS', BUILDINGS],
  ['TECHS', TECHS],
  ['DEFENSES', DEFENSES],
]
const OFFICER_LIST = Object.values(OFFICERS) as Array<{ name: string; nameEn: string; desc: string; descEn: string }>
const STAGES = [...CAMPAIGN_STAGES, ...CAMPAIGN_ELITE_STAGES]
const TUTORIAL = TUTORIAL_STEPS as Array<{ title: string; titleEn: string; hint: string; hintEn: string }>

describe('术语与内容数据的英文完整性', () => {
  for (const [table, defs] of TABLES) {
    it(`${table}：nameEn 非空且不是中文 name 的复制`, () => {
      const problems: string[] = []
      for (const [id, def] of Object.entries(defs)) {
        const en = def.nameEn
        if (!en || !en.trim()) problems.push(`${id}: nameEn 为空`)
        else if (/[一-鿿]/.test(en)) problems.push(`${id}: nameEn 含中文「${en}」`)
        else if (en === def.name) problems.push(`${id}: nameEn 与 name 相同「${en}」`)
      }
      expect(problems).toEqual([])
    })
  }

  it('OFFICERS：5 位都有非空、且与中文不同的 nameEn/descEn', () => {
    expect(OFFICER_LIST.length).toBe(5)
    const problems: string[] = []
    for (const o of OFFICER_LIST) {
      for (const f of ['name', 'desc', 'nameEn', 'descEn'] as const) {
        if (!o[f] || !o[f].trim()) problems.push(`${o.name}.${f} 为空`)
      }
      if (o.nameEn === o.name) problems.push(`${o.name}: nameEn 与 name 相同`)
      if (o.descEn === o.desc) problems.push(`${o.name}: descEn 与 desc 相同`)
      if (/[一-鿿]/.test(o.descEn)) problems.push(`${o.name}: descEn 含中文`)
    }
    expect(problems).toEqual([])
  })

  it('CAMPAIGN：16 关都有 nameEn/descEn，且与中文不同', () => {
    expect(STAGES.length).toBe(16)
    const problems: string[] = []
    for (const s of STAGES) {
      if (!s.nameEn?.trim() || !s.descEn?.trim()) problems.push(`关卡 ${s.id}: 英文字段为空`)
      if (s.nameEn === s.name) problems.push(`关卡 ${s.id}: nameEn 与 name 相同`)
      if (s.descEn === s.desc) problems.push(`关卡 ${s.id}: descEn 与 desc 相同`)
      if (/[一-鿿]/.test(s.nameEn) || /[一-鿿]/.test(s.descEn)) problems.push(`关卡 ${s.id}: 英文字段含中文`)
    }
    expect(problems).toEqual([])
  })

  it('ACHIEVEMENTS：19 项都有 nameEn/descEn/hintEn，且与中文不同', () => {
    expect(ACHIEVEMENTS.length).toBe(19)
    const problems: string[] = []
    for (const a of ACHIEVEMENTS) {
      if (!a.nameEn?.trim() || !a.descEn?.trim() || !a.hintEn?.trim()) problems.push(`成就 ${a.id}: 英文字段为空`)
      if (a.nameEn === a.name) problems.push(`成就 ${a.id}: nameEn 与 name 相同`)
      if (a.descEn === a.desc) problems.push(`成就 ${a.id}: descEn 与 desc 相同`)
      if (a.hintEn === a.hint) problems.push(`成就 ${a.id}: hintEn 与 hint 相同`)
      if (/[一-鿿]/.test(a.nameEn + a.descEn + a.hintEn)) problems.push(`成就 ${a.id}: 英文字段含中文`)
    }
    expect(problems).toEqual([])
  })

  it('TUTORIAL：15 步都有 titleEn/hintEn，且与中文不同', () => {
    expect(TUTORIAL.length).toBe(15)
    const problems: string[] = []
    for (const st of TUTORIAL) {
      if (!st.titleEn?.trim() || !st.hintEn?.trim()) problems.push(`步骤 ${st.title}: 英文字段为空`)
      if (st.titleEn === st.title) problems.push(`步骤 ${st.title}: titleEn 与 title 相同`)
      if (st.hintEn === st.hint) problems.push(`步骤 ${st.title}: hintEn 与 hint 相同`)
      if (/[一-鿿]/.test(st.titleEn + st.hintEn)) problems.push(`步骤 ${st.title}: 英文字段含中文`)
    }
    expect(problems).toEqual([])
  })
})
