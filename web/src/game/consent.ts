/**
 * 隐私同意（G2，公开运营合规门）。
 *
 * 事实口径（必须与实现一致，参见反面教材：声明与实际收集不一致）：
 * - 单机模式：全部数据仅存浏览器 localStorage，无任何网络请求；
 * - 服务器模式：仅在你主动填写的地址上通信（状态读取/命令提交），凭证只存本地；
 * - 无遥测、无统计、无账号服务器、无错误上报。
 */

const KEY = 'privacy-consent-v1'

export function privacyGranted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function grantPrivacy(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* 存储被禁用时视为未同意——每次进入都会再见同意门 */
  }
}

export function withdrawPrivacy(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 同上 */
  }
}

/**
 * 隐私声明正文（2026-09-29 从中文字面量改为 locale 键）。
 *
 * 原先是 4 条纯中文字面量数组，文案直接渲染在 PrivacyGate 上，导致：
 * EN 用户撤回同意后回到本页时，标题/按钮是英文、正文却是中文，
 * 而本页没有语言切换入口，用户既换不了语言也读不懂声明内容。
 * 现在只声明「键在哪」，文案交给 zh.ts / en.ts，本模块保持零 UI 文案。
 */
export const PRIVACY_STATEMENT_KEYS = [
  'privacy.statement1',
  'privacy.statement2',
  'privacy.statement3',
  'privacy.statement4',
] as const
