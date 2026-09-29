import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 缺失 i18n 键的全量门禁（2026-09-29）
 *
 * 两个玩家可见 P1 都是「t() 拿到了一个语言包里不存在的键，于是原样把键名
 * 显示到界面上」：
 *   ① GameScreen「更多」面板渲染 `t.item.label` 之外直接输出 item.label，
 *      7 个入口全部显示 `nav.buildings` / `nav.galaxy` … 原始键名。
 *   ② Overview 场景热点渲染 `t(link.key)`，而 key 是 `scene.metalMine`
 *      这类**根本不存在**于 zh/en 的伪键，界面上直接显示 `scene.metalMine`。
 *
 * 为什么已有门禁都没抓到：
 *   · `page-render.test.ts` 的「EN 模式零 CJK」扫描只找汉字，而这类键名是
 *     **拉丁字符**，天然逃逸。
 *   · `locale-contract.test.ts` 只比对 zh/en 两侧键集是否对齐、源码里
 *     `t('字面量')` 是否可解析——它解析的是源码里**直接写出**的键，
 *     而这两个 bug 的键都藏在**数据表字段**里（`label:` / `key:`），
 *     运行时才传给 t()。
 *
 * 所以这里换个口径：不看「谁调用了 t()」，而是扫源码里**所有长得像 i18n 键
 * 的字符串字面量**（小写开头的点分串），要求它在 zh/en 任一侧真实存在。
 * 这样数据表里的假键也会被覆盖。
 *
 * 变异验证：修复前本门禁精确报出 5 个 scene.* 键；修复后归零。
 */

const SRC = resolve(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'locales' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function localeKeys(lang: 'zh' | 'en'): Set<string> {
  const txt = readFileSync(resolve(SRC, `game/locales/${lang}.ts`), 'utf8')
  return new Set([...txt.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]))
}

/** 非 i18n 的点分字面量：文件名、扩展名、标识符等 */
const IGNORED = new Set([
  'manifest.json', 'package.json', 'tsconfig.json', 'vite.config',
  'node.js', 'sw.js', 'index.css', 'index.html', 'i18n.ts', 'state.ts',
  'ogame-sp-session', 'ogame-sp-accounts', 'stellar-expedition',
])

const KEY_SHAPE = /['"]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)['"]/g

/** 把注释抹成等长空格，保持行号不变（否则注释里的示例代码会造成误报） */
function stripComments(txt: string): string {
  let out = txt.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
  return out
}

describe('i18n 键存在性（数据表里的假键也要抓到）', () => {
  it('源码中形似 i18n 键的字符串字面量必须真实存在于 zh/en 语言包', () => {
    const known = new Set([...localeKeys('zh'), ...localeKeys('en')])
    expect(known.size, '语言包解析异常').toBeGreaterThan(500)

    const bad = new Map<string, string[]>()
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(KEY_SHAPE)) {
          const key = m[1]
          if (known.has(key) || IGNORED.has(key)) continue
          if (!bad.has(key)) bad.set(key, [])
          bad.get(key)!.push(`${rel}:${i + 1}`)
        }
      })
    }

    const report = [...bad.entries()]
      .map(([k, where]) => `${k}  <- ${[...new Set(where)].slice(0, 4).join(', ')}`)
      .join('\n')
    expect(bad.size, `以下字符串形似 i18n 键但语言包中不存在，t() 会原样显示键名：\n${report}`).toBe(0)
  })

  it('渲染 i18n 键的循环变量不得遮蔽翻译函数 t', () => {
    // 事故：`{TABS.filter((t) => ...).map((t) => <span>{t.label}</span>)}`
    // 循环变量 t 遮蔽了 useLocale 解构出的 t()，于是界面上显示的是 tab 对象的
    // 原始 label（即 `nav.buildings`），7 个入口全部显示键名。
    //
    // 检测口径：只要文件里出现翻译调用 t('...')，就不允许任何回调把形参命名为 t。
    // 不去猜「作者本意」——一旦遮蔽，编译器不会报错（t.label 是合法的属性访问），
    // 运行时才把键名吐到界面上，所以形参名本身就是需要拦住的坏味道。
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      const raw = readFileSync(file, 'utf8')
      // 该文件确实在做翻译（排除纯数据文件）
      if (!/\bt\(\s*['"]/.test(raw)) continue
      stripComments(raw).split('\n').forEach((line, i) => {
        if (/\(\s*t\s*(?::[^)]*)?\)\s*=>/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${raw.split('\n')[i].trim()}`)
        }
      })
    }
    expect(
      offenders.length,
      `以下位置把回调形参命名为 t，遮蔽了翻译函数（会把 i18n 原始键名显示到界面）：\n${offenders.join('\n')}`,
    ).toBe(0)
  })

  it('存放 i18n 键的映射表，其所有取值在渲染处都必须再过一次 t()', () => {
    // 实例（2026-09-29 真机走查抓到）：Reports.tsx 的 KIND_LABEL 把
    // report.kind.* 四个键存在表里。雷达场渲染处写了 t(KIND_LABEL[kind])（正确），
    // 但右侧「选中情报」面板两处直接输出 KIND_LABEL[kind] —— 界面上于是显示
    // 原始键名 `report.kind.battle`。
    //
    // 为什么既有的两道门禁都漏了：
    //   · missing-i18n-keys 第一条断言只查「键是否存在」——这些键**确实存在**，
    //     问题是渲染时忘了调 t()，键存在与否无关；
    //   · page-render 的「EN 零 CJK」只找汉字，键名是拉丁字符，照样逃逸。
    //
    // 实现要点（都踩过坑）：
    //   ① 必须**先全文件收集映射表、再扫使用处**。按行扫描会漏——映射表声明
    //      在第 12 行、使用在第 90 行，同行看不到表名，于是全绿假过。
    //   ② JSX 表达式里可能夹三元与 t()：`{selected ? KIND_LABEL[k] : t('x')}`，
    //      不能只匹配 `{IDENT}`，要扫整段花括号内文再逐个 token 判断。
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      const code = stripComments(readFileSync(file, 'utf8'))
      const lines = code.split('\n')

      // ① 全文件收集「值都是 i18n 键」的映射表常量名
      const tables = new Set<string>()
      for (const line of lines) {
        for (const m of line.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]*?)?=\s*\{([^}]*)\}/g)) {
          const values = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
          if (values.length >= 2 && values.every((v) => v.includes('.'))) tables.add(m[1])
        }
      }
      if (!tables.size) continue

      // ② 扫 JSX 花括号表达式里对表取值的裸渲染
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/(^|[^\w$.])([A-Z][A-Z0-9_]*)\s*\[/g)) {
          const table = m[2]
          if (!tables.has(table)) continue
          // 判定「是否已被 t( 包裹」：看表名起点之前的文本是否以 t( 结尾。
          // 不能用「先剔除 t('字面量') 再匹配」的做法——那样认不出
          // t(KIND_LABEL[...]) 这种「键来自表」的正确写法，会把好代码全判成缺陷
          // （实测 MerchantModal / Reports:80 三处误报）。
          const start = m.index! + m[1].length
          if (/t\(\s*$/.test(line.slice(0, start))) continue
          // 截取匹配点附近的窗口作为定位信息（直接引整行太长，引行内第一个
          // JSX 片段又会是错的——那是同一行里别的表达式）
          const ctx = line.slice(Math.max(0, start - 30), start + 40).trim()
          offenders.push(`${rel}:${i + 1}  …${ctx}…  <- 表 ${table}`)
        }
      })
    }
    expect(
      offenders.length,
      `以下位置直接渲染 i18n 键映射表的取值，未经 t() 包装（界面会显示原始键名）：\n${[...new Set(offenders)].join('\n')}`,
    ).toBe(0)
  })
})
