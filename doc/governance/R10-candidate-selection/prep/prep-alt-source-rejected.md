# prep-alt-source-rejected.md

> 落盘时间：2026-09-19 23:??
> 状态：**REJECTED — 不并入 R10 决策**

## User 给的 URL

- **URL**: https://www.lennysnewsletter.com/p/how-to-turn-your-ai-into-a-world
- **作者**: Anshu Chimala（前 Apple UI/UX + AI R&D 12 年，guest post 在 Lenny's Newsletter）
- **发表**: 2026-09-01（Sep 01, 2026）

## 真实内容（fetched summary）

**标题误导**：URL slug 是 "turn-your-ai-into-a-world"，看起来像 world-building（对 OGame R10 candidate (a) 终局教程有间接对位），但实际是 **AI 设计工作流教程**（prompt engineering for design）。

**三阶段框架**（受 Double Diamond 启发）：
1. **Discover** — seed string 注入多样性 / 更大胆的 prompt
2. **Define** — subagent critic 反馈环 / 图像生成丰富设计 / 视频生成做动效
3. **Deliver** — 删冗余元素 / 去 AI tells

**7 个 technique**（免费部分到 Technique 6，Technique 7 paywall）：
- T1 Seed strings（random alphanumeric → 颜色/字体灵感）
- T2 大胆 prompt（pixel art / isometric 3D city / 不对称布局）
- T3 Subagent critic loop（Fable 5 评分 / Opus 5 实现）
- T4 Image generation 丰富设计
- T5 Video generation 做动效（fal.ai / Seedance 2.5）
- T6 Cut 冗余元素（删 gradient/glows/自定义 button）
- T7 Remove AI tells ⏭️ **paywall 阻断**

**演示样本**：calorie tracker / space exploration game / landing page（全是 Claude Opus 5 + Fable 5 生成）

## 拒绝理由（3 条 evidence）

1. **跟 R10 candidate (a)「终局教程/日报引导」零 evidence 对位**
   - candidate (a) 是游戏终局引导（殖民地 / 教程 / 日报），期望 Victoria 3 经济学建模类对位
   - 这篇是 AI agent prompt engineering，不是 game design

2. **标题误导**："turn your AI into a world" 听起来像 AI world-builder，但实际是 designer workflow
   - 假设 user 是被标题误导顺手分享，不是替代 Victoria 3 的真意图

3. **Paywall 截断 + 免费段对 OGame 无操作价值**
   - T1-T6 都是「AI agent 怎么生成独特设计」——跟 OGame「设计 12 页签 HUD」或「设计终局引导」是不同问题域
   - OGame 12 页签已有完整 React 实现（GameScreen.tsx 381 行），不需要 AI 重新生成

## 不消耗任何 BLOCKED 项

- ❌ 不修改 decision.md（candidate (a) 期待仍是 Victoria 3）
- ❌ 不修改 prep-candidate-a-victoria3.md（仍等 Victoria 3 URL）
- ❌ 不消耗「Victoria 3 URL」BLOCKED 状态
- ❌ 不消耗「shortlist 拍板」BLOCKED 状态

## User 接下来可能的动作

| 动作 | 后果 |
|---|---|
| 重新给 Victoria 3 URL | 解锁 candidate (a) prep Step 1-3 |
| 确认「这是我误发的，跟 R10 无关」 | 此 prep 归档，不动其他文件 |
| 说「其实我是想替换 candidate (a) 的 evidence 源」 | 重新评估 R10 candidate (a) 是否仍是「终局教程」还是「AI-driven 体验生成」 |
| 给 APICO URL | 跟此 prep 无关，单独解锁 candidate (d) ui-ux 通道 |

## 关键判断

- 严守 paranoia RJR-AI 硬规则：AI 不替 user 决策「这篇能不能替代 Victoria 3」
- 严守 CL-003：阻塞项必须显式标注（Victoria 3 URL 仍 pending）
- 严守 prep 命名约定：alt-source 走独立 prep 文件，不污染 candidate-specific prep
