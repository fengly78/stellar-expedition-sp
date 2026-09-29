import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 回归：底部固定元素的断点覆盖冲突（2026-09-28）
//
// 背景：教程引导条（.nova-tutorial-bar）与母星切换器（.nova-base-switcher）
// 都是 position:fixed 且贴同一底边。修复时加了 @media(max-width:1180px) 让教程条
// 上移分层，但文件里还有一条更靠后的 @media(max-width:720px)：
//
//   .nova-tutorial-bar { left:.6rem; right:.6rem; bottom:4.9rem; max-width:none }
//
// 同等特异性 + 位置更靠后 = 移动端把避让规则覆盖掉，720px 以下重新出现遮挡。
// 而且移动端母星切换器是 left:.45rem / width:11rem，教程条是全宽——必重叠。
//
// SSR 渲染测不到 CSS 布局，但「同一选择器在多个断点被重定义、后者覆盖前者」
// 这件事可以从源码静态检出。本文件把底部固定元素的所有 bottom 声明列出来，
// 断言它们在每个断点下不相等（分层）或明确相等并有注释说明。

const SRC = resolve(__dirname, '..', '..')
const css = readFileSync(resolve(SRC, 'nova-overrides.css'), 'utf8')

/** 从 CSS 里抽出某个选择器的所有 bottom 声明，标注所属断点 */
function bottomDecls(selector: string): Array<{ line: number; bottom: string; media: string }> {
  const out: Array<{ line: number; bottom: string; media: string }> = []
  let currentMedia = '(default)'
  const lines = css.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '')
    const media = raw.match(/@media\s*\(max-width:\s*(\d+)px\)/)
    if (media) {
      currentMedia = `<=${media[1]}px`
      continue
    }
    // 匹配 "选择器 { ... bottom: X; ... }" 的单行或多行形式
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}', 'g')
    let m: RegExpExecArray | null
    const chunk = lines.slice(i, i + 4).join('\n')
    while ((m = re.exec(chunk)) !== null) {
      const b = m[1].match(/bottom:\s*([^;]+);/)
      if (b) out.push({ line: i + 1, bottom: b[1].trim(), media: currentMedia })
    }
  }
  return out
}

/** 取出 bottom 声明里的第一个 rem 数值；calc(4.4rem + 3.4rem) 取 4.4。
 *  这里取的是「基准层」——分层判断只关心它相对切换器抬高没抬高。 */
function remOf(decl: string): number {
  const m = decl.match(/([\d.]+)rem/)
  return m ? parseFloat(m[1]) : NaN
}

describe('底部固定元素断点一致性', () => {
  it('母星切换器在每个断点都贴底且有明确 bottom', () => {
    const decls = bottomDecls('.nova-base-switcher')
    expect(decls.length, '找不到 .nova-base-switcher 的 bottom 声明').toBeGreaterThan(0)
    for (const d of decls) {
      expect(d.bottom, `L${d.line} 的 bottom 异常: ${d.bottom}`).toBeTruthy()
    }
  })

  it('教程条在移动端仍与母星切换器分层（不被 720px 规则覆盖回同底）', () => {
    const decls = bottomDecls('.nova-tutorial-bar')
    const mobile = decls.filter((d) => d.media === '<=720px')
    expect(mobile.length, '720px 断点没有 .nova-tutorial-bar 规则').toBeGreaterThan(0)

    // 母星切换器在 <=900px 就改为 bottom:4.4rem / width:11rem（实测 nova-overrides.css:586），
    // 所以「移动端」要取所有 ≤900px 的声明里最小那个作为基准。
    const switcherDecls = bottomDecls('.nova-base-switcher')
    const mobileSwitcher = switcherDecls
      .filter((d) => d.media !== '(default)')
      .map((d) => remOf(d.bottom))
      .filter((n) => Number.isFinite(n))
    expect(mobileSwitcher.length, '找不到切换器的窄屏定位').toBeGreaterThan(0)
    const swRem = Math.min(...mobileSwitcher)

    for (const t of mobile) {
      // calc(4.4rem + 3.4rem) 的基准 4.4rem 必须高于切换器的 4.4rem？
      // 不能——相等也会叠在一起。分层要求「整条 bottom 大于切换器 bottom」，
      // 因此这里比的是 calc 的整体落点：基准 + 增量。用完整表达式求值。
      const calc = t.bottom.match(/calc\(([\d.]+)rem\s*\+\s*([\d.]+)rem\)/)
      let effective: number
      if (calc) {
        effective = parseFloat(calc[1]) + parseFloat(calc[2])
      } else {
        effective = remOf(t.bottom)
      }
      expect(Number.isFinite(effective), `教程条 bottom 不可解析: ${t.bottom}`).toBe(true)
      expect(effective, `720px 下教程条 bottom=${t.bottom}（落点 ${effective}rem）未高于切换器 ${swRem}rem`).toBeGreaterThan(swRem)
    }
  })

  it('教程条在 1180px 中屏也与切换器分层', () => {
    const decls = bottomDecls('.nova-tutorial-bar').filter((d) => d.media === '<=1180px')
    expect(decls.length, '1180px 断点没有 .nova-tutorial-bar 规则').toBeGreaterThan(0)
    // 分层表达式应基于切换器的 bottom（4.65rem）再加一行高度
    for (const d of decls) {
      expect(d.bottom, `1180px 规则未使用 calc 分层: ${d.bottom}`).toMatch(/calc\(/)
    }
  })

  it('720px 规则位于 1180px 规则之后但仍各自正确（不被同特异性覆盖）', () => {
    // 两者特异性相同（同一选择器），CSS 按源码顺序后者胜。
    // 所以 720px 块内必须自带正确的 bottom，而不是依赖 1180px 的值。
    const decls = bottomDecls('.nova-tutorial-bar')
    const idx1180 = decls.findIndex((d) => d.media === '<=1180px')
    const idx720 = decls.findIndex((d) => d.media === '<=720px')
    expect(idx1180, '缺 1180px 规则').toBeGreaterThan(-1)
    expect(idx720, '缺 720px 规则').toBeGreaterThan(-1)
    // 720px 的值不能是 4.9rem（那正是修复前的被遮挡值）
    const mobile = decls[idx720]
    expect(mobile.bottom, '720px 仍是修复前的 4.9rem（会覆盖避让规则）').not.toBe('4.9rem')
  })

  it('CSS 花括号平衡（新增媒体查询易切错块）', () => {
    const open = (css.match(/\{/g) ?? []).length
    const close = (css.match(/\}/g) ?? []).length
    expect(open, `花括号不平衡 {=${open} }=${close}`).toBe(close)
  })

  // —— 移动端 390px 复查的可自动化部分 ——
  // 真机 390px 截图仍需人工，但「三层底部固定元素是否叠放冲突」
  // 这类纯几何问题可以从源码静态判定，不必等真机。

  it('390px 下三层底部元素自底向上依次叠放（底栏 < 母星切换器 < 教程条）', () => {
    // 底栏不是 position:fixed+bottom 定位，而是靠 height:4.15rem 占据底部
    // （由 JSX 容器/flex 布局贴底），因此这里比的是「离底边的距离」：
    // 底栏 0，母星切换器 4.4rem，教程条 4.4+3.4=7.8rem。
    const navMatch = css.match(/\.nova-bottom-nav\s*\{[^}]*height:\s*([\d.]+)rem/)
    expect(navMatch, '.nova-bottom-nav 没有 height 声明').toBeTruthy()
    const nav = parseFloat(navMatch![1])

    const swDecl = bottomDecls('.nova-base-switcher').filter((d) => d.media !== '(default)').pop()
    expect(swDecl, '找不到母星切换器的窄屏定位').toBeTruthy()
    const switcher = remOf(swDecl!.bottom)

    const bar = bottomDecls('.nova-tutorial-bar').find((d) => d.media === '<=720px')
    expect(bar, '720px 下没有教程条定位').toBeDefined()
    const barCalc = bar!.bottom.match(/calc\(([\d.]+)rem\s*\+\s*([\d.]+)rem\)/)
    expect(barCalc, `720px 教程条未用 calc 分层: ${bar!.bottom}`).toBeTruthy()
    const barEff = parseFloat(barCalc![1]) + parseFloat(barCalc![2])

    // 越靠上的元素离底边越远，三层不得重叠
    expect(switcher, `母星切换器 ${switcher}rem 应高于底栏 ${nav}rem`).toBeGreaterThan(nav)
    expect(barEff, `教程条 ${barEff}rem 应高于母星切换器 ${switcher}rem`).toBeGreaterThan(switcher)
  })

  it('窄屏关键容器解除固定高度（避免内容被裁）', () => {
    // 390px 下多栏布局应改为纵向流；若仍是固定高度/绝对定位就会裁内容
    const m720 = css.slice(css.indexOf('@media (max-width: 720px)'))
    expect(m720, '720px 断点未解除 construction-stage 固定高度')
      .toMatch(/\.nova-construction-stage\s*\{[^}]*height:\s*auto/)
  })

  it('资源条在窄屏可横向滚动（4 个资源格子不换行挤压）', () => {
    const m720 = css.slice(css.indexOf('@media (max-width: 720px)'))
    expect(m720, '720px 下资源条未开横向滚动')
      .toMatch(/\.nova-resource-grid\s*\{[^}]*overflow-x:\s*auto/)
  })
})
