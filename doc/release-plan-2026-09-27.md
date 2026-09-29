# OGame 单机线 · Beta → Release 细化开发计划

> 制定：2026-09-27 深夜 · 依据：CODEX_HANDOFF 全部登记项 + 12 批次实测结论
> 当前状态：main 分支 88 提交 · vitest 113/phpunit 87/七门禁全绿 · 工作树干净
> 总原则：**每批七门禁全绿才提交；老存档兼容（v11 期内字段 + ?? 兜底）不可破；服务器线数值变更一律走 CR**

---

## 总览：三个里程碑

```
Beta ──→ M1 发布切割（1.0.0）──→ M2 服务器线同步（1.1.0）──→ M3 内容与打磨（1.2.0+）
          2-3 晚                   2 晚 + CR 审批               按玩家反馈滚动
```

**发布定义（Definition of Release）**：
- 单机线 zh/en 双语全程可玩、老存档无损升级、离线 PWA 可安装
- 七门禁全绿 + 双端（桌面 1680/移动 390）截图走查零 P0/P1
- 服务器线维持现有 Beta 标签不变（同步推到 1.1.0 再摘标）

---

## M1 发布切割（目标版本 1.0.0）

### M1.1 i18n 批次 D 收尾（预计 3 晚，每晚 1-2 页）

| 晚 | 页面 | 中文行 | 备注 |
|---|---|---|---|
| D1 | Shipyard | 23 | 舰船+防御双目录，模式同 Buildings |
| D2 | Galaxy | 50 | 最大页；含残骸徽标/月球信号/导弹按钮 |
| D3 | Fleet + Reports | 27+28 | 任务类型标签已有 TYPE_LABEL 常量，搬键即可 |
| D4 | Achievements + Campaign + Codex + Officers + Highscore | 23+23+23+13+11 | 每页薄，可合并一晚 |

每页验收：tsc 零错 → vitest → 该页中文行数归零（术语层除外）→ build。

### M1.2 术语层（与 D 批并行）

- objects.ts 四表（SHIPS/TECHS/BUILDINGS/DEFENSES）加 `nameEn` 字段（~60 条，数值不动）
- `t()` 加 `term(id, table)` 通道：zh 返回 name、en 返回 nameEn
- 涉及页：Shipyard 目录/Galaxy 态势图/Reports 编制行/战报回放图例/模拟器舰种表
- 效果行文案（techEffectRows 等 20+ 条）**本轮不做**——它们是"模板句"，留 1.2.0

### M1.3 发布工程（1 晚）

| 项 | 动作 | 验收 |
|---|---|---|
| 版本号 | vite define 0.3.0 → 1.0.0；BUILD_DATE 自动 | 关于页/隐私门版本显示 1.0.0 |
| G3 更新清单 | 写 `version-manifest.json` 样例 + `VITE_VERSION_MANIFEST_URL` 说明入 deploy.md；本地起静态服务实测"发现新版本"提示 | 检查更新按钮返回 available |
| PWA | dist/manifest.webmanifest 图标核对（现 favicon.svg）；离线断网烟测 | 断网可玩、刷新不丢档 |
| 生产 env 模板 | `.env.example` 补 GM_KEY / GAME_AUTH_ENFORCED / VITE_VERSION_MANIFEST_URL 三行注释 | 新环境按模板可起 |
| 存档兼容矩阵 | v2→v11 迁移链逐版本 smoke（造 5 个旧档 JSON 逐个 load） | 全部可载入 |

### M1.4 发布验收（1 晚，QA 角色）

- **双语全页走查**：12 页 × zh/en 逐页截图（24 张），中文残留>0 的页面记 P2
- **移动端 390px**：基地/建筑/科研/舰队/星系五主页面复查
- **七门禁** + phpunit 双库（SQLite/MariaDB）
- **真机烟测**：Edge/Chrome 正式浏览器开 dist（非 preview server），注册→开局→10 分钟操作→关浏览器→重开继续
- **P0/P1 清零** → 打 tag `v1.0.0` → Release 1.0.0

**M1 出口条件（Gate）**：上表全勾 + 无新增未修复缺陷 + 交接档更新。

---

## M2 服务器线同步（目标版本 1.1.0，依赖 CR 审批）

**前置**：每个 CR 提交 `doc/governance/` 决策文档（材料已备，见对应分析），所有者批准后才动 RC1。

| 批次 | 内容 | 涉及 | 验收 |
|---|---|---|---|
| M2.1 超空舰船 | 215/213/218 + 科技 114/118 进 ruleset JSON（数值已 1:1 对齐） | RC1 重导 hash；ShipOrderHandler 校验自动生效 | game_commands 审计 + e2e 造舰 |
| M2.2 NPC 成长 | ProcessAiTick 挂 npcDynamicGrowth（50/80/110% 封顶同参） | sim03 基线重录 | 新旧基线 diff 报告入 doc |
| M2.3 等待队列 | BUILD_ENQUEUE 满 3 槽转 WAIT 预约（game_commands 加 WAIT 类型审计） | CommandController + 迁移 | e2e：满槽→预约→转正 |
| M2.4 矿脉储量 | ORE_DEPOSIT 键族 + planets 表 ore 字段（SQLite+MariaDB 双迁移） | ProductionService + F-02 扩展 + sim02 重录 | 双库 phpunit + 基线 diff |
| M2.5 GM 扩展 | GmService 加 grant 指定行星/解锁全科技动词（运营补漏用） | 现有 GmService 扩展 | phpunit + 实机 |

**顺序强制**：M2.1 → M2.2 → M2.3 → M2.4（后项依赖前项的 RC1 重导工具链）。每批 phpunit 双库全绿 + 七门禁。

---

## M3 内容与打磨（1.2.0+，按玩家反馈滚动排序）

| 项 | 来源 | 优先 |
|---|---|---|
| 三舰+聚变电站贴图出图（215/213/218/12 占位替换） | 视觉债 | 高（出图即换） |
| 章节战役（vue-ts 章-任务-目标三层参考） | 上游对齐登记 | 中 |
| 外交好感度（NPC 关系/赠礼） | 上游对齐登记 | 中 |
| 科技效果行模板句 t() 化（M1.2 术语层的自然延伸） | i18n 尾巴 | 中 |
| 战斗/殖民/月球事件专属音效 | 音频登记 | 低 |
| 爬虫 217/探路者 219 生活舰 | 上游差距 | 低 |
| 矿脉参数二次调参（regen 0.1%/h 加压档） | CR 风险① | 按反馈 |

**明确不做（已评估否决）**：联盟/ACS/站内信/buddy（MMO 向）；黑洞/新银河扩展（超范围）。

---

## 每晚节奏模板（沿用已验证的批次纪律）

1. 选定批次 → todo 列表落 todo
2. 实施 → tsc 零错 → vitest 全绿 → build
3. 涉及 UX 的批次浏览器实机走查 + 截图
4. 七门禁（跨仓库批次加 phpunit 双库）
5. 提交（feat/fix/docs 前缀）→ 交接档更新 → 提交

---

## 当前风险台账（滚动更新）

| 风险 | 状态 | 缓解 |
|---|---|---|
| 服务器线落后单机线 4 批次 | M2 收敛 | CR 材料已备 |
| 术语层未设计（en 玩家见中英混排） | M1.2 解决 | 60 键一次性补 |
| 矿脉/NPC 叠加后期压力 | 已实测定稿（安全阀定位） | 观察项关闭 |
| 三舰贴图占位 | M3 出图 | 占位可用不阻塞发布 |
| 单人开发总线因子 | 批次纪律（门禁+交接档）持续 | 每晚交接可续 |
