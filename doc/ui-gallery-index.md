# 新奥游戏 UI 图片总览

所有图片均以 `ao-xin-ui/ui-style-guide-v1.svg` 和 `ao-xin-ui/ui-control-bars-v1.svg` 的统一基线为准。PNG 是场景与美术参考板，SVG 是可直接交给前端实现的布局/状态图。

## 当前主框架基线（优先实现）

主框架先锁定 7 个 PC 页面和 2 套全局控制栏：星球总览、建筑建设、研发网络、轨道制造、行星防御、舰队指挥、战报恢复；统一顶部资源 Dock、底部模块导航和移动端 More 抽屉。其余外交、联盟、市场、图鉴、治理和情报页面暂作为后续扩展，不影响主框架收敛。

## 主场景图片

| 文件 | 页面 | 关键内容 |
|---|---|---|
| `ao-xin-ui/ui-planet-overview-v1.png` | 星球总览 | 防护罩星球、2.5D 建筑热点、殖民地状态、建筑详情、AI 下一步 |
| `ao-xin-ui/ui-shipyard-v1.png` | 轨道船坞 | 船坞场景、建造队列、舰船蓝图、成本、维护提醒 |
| `ao-xin-ui/ui-research-network-v1.png` | 研究网络 | 科技节点、前置关系、研究进度、AI 建议、研究队列 |
| `ao-xin-ui/ui-galaxy-route-v1.png` | 星系与派遣 | 星系地图、路线风险、风暴区、舰队编组、ETA、燃料 |
| `ao-xin-ui/ui-defense-grid-v1.png` | 行星防御 | 防护罩、防御覆盖、威胁预测、设施升级和防御队列 |
| `ao-xin-ui/ui-master-unified-pc-v1.png` | PC 总规划 | 统一的 PC 星球总览、星系派遣、移动端同源布局、控制栏与视觉令牌 |
| `ao-xin-ui/ui-ao-xin-visual-baseline-v2.png` | 奥新游戏统一视觉基线 | 顶部资源 Dock、左右信息面板、中央大场景、底部五项导航、青蓝 HUD 和全包裹护盾规范 |
| `ao-xin-ui/ui-ao-xin-planet-overview-v3.png` | 奥新游戏星球总览重梳理稿 | 严格按原始参考布局重做：全包裹护盾、独特建筑、左右面板、顶部资源 Dock 和底部五项导航 |
| `ao-xin-ui/ui-core-framework-board-pc-v2.png` | PC 核心界面框架总览板 | 七个主页面、统一顶部资源栏、统一底部导航和建设/研发/制造多线程队列 |
| `ao-xin-ui/ui-construction-states-pc-v2.png` | PC 建筑建设核心状态板 | 正常建造、资源不足、队列已满、护盾限制和统一四线程建设队列 |
| `ao-xin-ui/ui-research-states-pc-v2.png` | PC 研发网络核心状态板 | 可研究、前置未满足、研究中、实验室占用和统一五线程研发队列 |
| `ao-xin-ui/ui-shipyard-states-pc-v2.png` | PC 轨道制造核心状态板 | 可制造、材料不足、产线占用、制造中和统一五线程制造队列 |
| `ao-xin-ui/ui-defense-states-pc-v2.png` | PC 行星防御核心状态板 | 护盾稳定、护盾受压、设施受损、升级中和统一四线程防御队列 |
| `ao-xin-ui/ui-fleet-command-states-pc-v2.png` | PC 舰队指挥核心状态板 | 待命、编组中、出航中、受损返航和统一四线程舰队队列 |
| `ao-xin-ui/ui-reports-recovery-states-pc-v2.png` | PC 战报恢复核心状态板 | 战斗胜利、防守失败、残骸待回收、舰队恢复和统一四线程战报队列 |
| `ao-xin-ui/ui-mobile-core-framework-v2.png` | 移动端核心框架板 | 星球总览、建设、研发、舰队、同源资源条、底部导航和 More 抽屉 |
| `ao-xin-ui/ui-control-bars-framework-v2.png` | 统一控制栏规范板 | PC/移动端顶部资源 Dock、页面状态栏、底部导航、More 抽屉和状态语义 |
| `ao-xin-ui/ui-planet-overview-states-pc-v2.png` | PC 星球总览核心状态板 | 状态稳定、建设进行中、资源短缺、遭遇威胁和统一四线程活动队列 |
| `ao-xin-ui/ui-core-2p5d-asset-kit-v2.png` | 核心 2.5D 物料规范板 | 星球、建筑、战舰、防御设施、防护罩、轨道站和能源管线复用规范 |
| `ao-xin-ui/ui-core-interaction-flow-v2.png` | 核心页面交互流程板 | 星球总览到建设、研发、制造、舰队、战报的导航路径、返回关系和 More 抽屉 |
| `ao-xin-ui/ui-shared-ui-states-v2.png` | 核心系统通用状态板 | 加载、空态、请求中、错误、重连、已完成和统一状态语义 |
| `ao-xin-ui/ui-core-shell-grid-v2.png` | PC 核心 Shell 网格规范板 | 顶部 Dock、左右面板、中央 2.5D 场景、底部队列与导航的尺寸和安全区 |
| `ao-xin-ui/ui-planet-overview-final-distinct-assets-pc-v2.png` | PC 星球总览最终视觉稿 | 全包裹星球护盾、独特建筑/舰艇/防御轮廓和可拖动星系小地图 |
| `ao-xin-ui/ui-distinct-assets-draggable-galaxy-v2.png` | 独特物料与可拖动星系地图规范板 | 独立建筑/舰艇/防御轮廓、全包裹护盾、拖动/缩放/航线交互 |
| `ao-xin-ui/ui-galaxy-map-navigation-pc-v2.png` | PC 当前星系拖动浏览 | 平移、缩放、星球选择、轨道关系、航线预览和返回星球操作 |
| `ao-xin-ui/ui-galaxy-map-states-pc-v2.png` | PC 当前星系地图交互状态板 | 拖动中、缩放中、选中星球、航线规划和不可达目标 |
| `ao-xin-ui/ui-defense-overview-pc-v2.png` | PC 防御总览 | 按用户提供的 PC 参考图重新生成，锁定顶部 Dock、左右面板、底部导航和 2.5D 防御场景 |
| `ao-xin-ui/ui-shipyard-pc-v2.png` | PC 轨道船坞 | 按 PC 参考图统一船坞场景、建造队列、舰船蓝图和底部导航 |
| `ao-xin-ui/ui-research-network-pc-v2.png` | PC 研究网络 | 按 PC 参考图统一研究节点、分类、队列、选中详情和主操作 |
| `ao-xin-ui/ui-galaxy-dispatch-pc-v2.png` | PC 星系派遣 | 按 PC 参考图统一星系地图、航线风险、舰队编组和确认派遣 |
| `ao-xin-ui/ui-battle-recovery-pc-v2.png` | PC 战报恢复 | 按 PC 参考图统一战报列表、战斗详情、残骸和舰队恢复 |
| `ao-xin-ui/ui-planet-overview-pc-v2.png` | PC 星球总览 | 按 PC 参考图统一殖民地状态、2.5D 建筑、防护罩、建筑详情和 AI 下一步 |
| `ao-xin-ui/ui-fleet-command-pc-v2.png` | PC 舰队指挥 | 按 PC 参考图统一舰队编队、任务队列、选中舰队、航线与召回操作 |
| `ao-xin-ui/ui-missions-logistics-pc-v2.png` | PC 任务物流 | 按 PC 参考图统一任务列表、运输队列、物流场景、合同详情和确认运输 |
| `ao-xin-ui/ui-codex-achievements-pc-v2.png` | PC 图鉴成就设置 | 按 PC 参考图统一图鉴分类、成就进度、全息展台、设置和危险操作 |
| `ao-xin-ui/ui-market-pc-v2.png` | PC 星际市场 | 按 PC 参考图统一市场筛选、订单、交易枢纽、报价详情和合同预警 |
| `ao-xin-ui/ui-colonization-outpost-pc-v2.png` | PC 殖民与前哨 | 按 PC 参考图统一候选星球、调查无人机、路线分析、殖民成本和建立殖民地 |
| `ao-xin-ui/ui-officers-command-pc-v2.png` | PC 军官与指挥 | 按 PC 参考图统一军官名单、指挥桥、被动加成、授权状态和任命操作 |
| `ao-xin-ui/ui-rankings-pc-v2.png` | PC 文明排行 | 按 PC 参考图统一排行筛选、文明对比、选中文明情报和侦察建议 |
| `ao-xin-ui/ui-mobile-core-screens-v2.png` | 移动端核心界面 | 统一展示总览、星系、舰队、战报四个手机页面、资源条、底部导航和底部抽屉 |
| `ao-xin-ui/ui-mobile-secondary-v2.png` | 移动端次级界面 | 统一展示任务、物流、图鉴/更多三个手机页面、任务底部面板和更多抽屉 |
| `ao-xin-ui/ui-main-menu-save-select-pc-v2.png` | PC 主菜单与存档 | 继续游戏、新建文明、读取存档、设置、退出和存档预览 |
| `ao-xin-ui/ui-tutorial-first-steps-pc-v2.png` | PC 新手引导 | 三步新手流程、当前目标、AI 秘书、奖励和开始第一步 |
| `ao-xin-ui/ui-battle-replay-pc-v2.png` | PC 战斗回放 | 回放列表、播放控制、当前回合、时间轴、伤害与护盾吸收 |
| `ao-xin-ui/ui-event-comms-pc-v2.png` | PC 事件通讯 | 威胁、风暴、资源短缺、合同到期、任务完成和授权状态 |
| `ao-xin-ui/ui-alliance-diplomacy-pc-v2.png` | PC 联盟与外交 | 联盟档案、星域关系图、条约状态、外交请求、行动记录和 AI 秘书 |
| `ao-xin-ui/ui-system-inbox-pc-v2.png` | PC 系统通知中心 | 通知筛选、未读消息、威胁告警、舰队与建造事件、快捷处理和 AI 建议 |
| `ao-xin-ui/ui-resource-production-pc-v2.png` | PC 资源与生产中心 | 资源库存、产能趋势、设施详情、生产队列、物流吞吐和升级操作 |
| `ao-xin-ui/ui-building-upgrade-pc-v2.png` | PC 建筑升级与布局 | 2.5D 星球建筑、升级分支、布局网格、防护罩覆盖、能耗和建造队列 |
| `ao-xin-ui/ui-fleet-formation-pc-v2.png` | PC 舰队编组与出航 | 舰船编组、任务类型、目标坐标、航线风险、燃料消耗和出航确认 |
| `ao-xin-ui/ui-research-lab-detail-pc-v2.png` | PC 科研实验室详情 | 科技节点、依赖关系、研究队列、科学家分配、研究点产出和加成预览 |
| `ao-xin-ui/ui-fleet-maintenance-pc-v2.png` | PC 舰队维修与维护 | 受损舰船、维修队列、船坞占用、备件消耗、维修优先级和 AI 建议 |
| `ao-xin-ui/ui-alliance-war-room-pc-v2.png` | PC 联盟战争室 | 战区星图、敌我舰队、作战计划、战线任务、补给线和作战确认 |
| `ao-xin-ui/ui-deep-space-scan-pc-v2.png` | PC 深空探索与扫描 | 扫描雷达、未知信号、星球分析、探测队列、风险评估和探测发射 |
| `ao-xin-ui/ui-defense-deployment-pc-v2.png` | PC 防御阵列部署 | 2.5D 炮塔与拦截井、火力覆盖、威胁航线、部署网格和拦截优先级 |
| `ao-xin-ui/ui-colony-habitat-pc-v2.png` | PC 人口与居住区管理 | 栖息穹顶、人口容量、满意度、岗位分配、生命支持和扩建队列 |
| `ao-xin-ui/ui-energy-grid-pc-v2.png` | PC 能源网络与电网调度 | 发电设施、电网负载、过载节点、故障节点、维修队列和应急调度 |
| `ao-xin-ui/ui-mobile-operational-pack-v2.png` | 移动端运营界面组 | 星球总览、舰队派遣、防御告警和科研详情四个竖屏 2.5D 界面 |
| `ao-xin-ui/ui-mobile-secondary-pack-v2.png` | 移动端低频功能组 | 联盟外交、星际市场、设置与 More 抽屉三个竖屏 2.5D 界面 |
| `ao-xin-ui/ui-missions-rewards-pc-v2.png` | PC 任务与奖励中心 | 每日/周常/联盟任务、阶段目标、奖励轨道、赛季进度和领取状态 |
| `ao-xin-ui/ui-ship-blueprint-modules-pc-v2.png` | PC 舰船蓝图与模块配置 | 舰体蓝图、武器槽、护盾、仓储、功率预算、制造成本和配置保存 |
| `ao-xin-ui/ui-alliance-members-pc-v2.png` | PC 联盟成员与权限 | 成员名册、在线状态、职位权限、贡献排行、申请审批和内部通讯 |
| `ao-xin-ui/ui-logistics-trade-routes-pc-v2.png` | PC 星际运输与贸易航线 | 货运舰队、航线风险、仓位、燃料、合同详情、到达预估和物流吞吐 |
| `ao-xin-ui/ui-galaxy-map-route-pc-v2.png` | PC 银河地图与航线规划 | 星区筛选、星系节点、跃迁门、领土圈、航线风险和舰队路径预估 |
| `ao-xin-ui/ui-commander-profile-pc-v2.png` | PC 指挥官档案与文明统计 | 指挥官等级、徽章、殖民地总览、舰队实力、成长曲线和成就里程碑 |
| `ao-xin-ui/ui-alien-civilization-contact-pc-v2.png` | PC 外星文明接触中心 | 文明档案、外交态度、情报关系、翻译进度、条约选项和首次接触 |
| `ao-xin-ui/ui-officer-command-chain-pc-v2.png` | PC 军官任命与指挥链 | 军官档案、技能加成、岗位空缺、编队绑定、合同状态和任命操作 |
| `ao-xin-ui/ui-asteroid-mining-pc-v2.png` | PC 小行星采矿与采集 | 矿区筛选、矿脉扫描、采集舰队、运输容量、采集风险和精炼吞吐 |
| `ao-xin-ui/ui-terraforming-ecology-pc-v2.png` | PC 行星改造与生态工程 | 大气改造、温度、水源、生态进度、防护罩稳定度和工程队列 |
| `ao-xin-ui/ui-planetary-disaster-response-pc-v2.png` | PC 行星灾害与应急响应 | 风暴、陨石、护盾压力、受损建筑、撤离队列和应急资源分配 |
| `ao-xin-ui/ui-colonial-council-policy-pc-v2.png` | PC 殖民地议会与政策 | 政策卡、民意、资源影响、法令生效、议会投票和社会稳定 |
| `ao-xin-ui/ui-expedition-ruins-pc-v2.png` | PC 远征编队与未知遗迹 | 远征目标、遗迹扫描、船员编组、补给、风险、撤退和回收奖励 |
| `ao-xin-ui/ui-salvage-debris-recovery-pc-v2.png` | PC 战场残骸回收 | 残骸场扫描、回收舰队、资源估算、护航风险、归属窗口和回收队列 |
| `ao-xin-ui/ui-orbital-spaceport-pc-v2.png` | PC 轨道空间站与港口 | 泊位容量、进出港舰队、空间站模块、维护状态、拥堵告警和扩建队列 |
| `ao-xin-ui/ui-ai-secretary-automation-pc-v2.png` | PC AI 秘书与自动化 | 自动化规则、工作流触发器、告警优先级、推荐行动、授权范围和审计日志 |
| `ao-xin-ui/ui-mercenary-contracts-pc-v2.png` | PC 雇佣舰队与合同中心 | 雇佣舰队、合同条款、佣金、保证金、信誉趋势和任务绑定 |
| `ao-xin-ui/ui-intelligence-recon-pc-v2.png` | PC 侦察与情报中心 | 敌情档案、侦察任务、扫描进度、反间谍状态、解密队列和情报报告 |
| `ao-xin-ui/ui-flagship-carrier-operations-pc-v2.png` | PC 旗舰与航母作战 | 旗舰状态、舰载机联队、挂载模块、编队容量、出击准备和护航分配 |
| `ao-xin-ui/ui-multi-colony-overview-pc-v2.png` | PC 多殖民地管理总台 | 殖民地列表、星球状态、资源产出、防护罩、舰队位置和跨星球调度 |
| `ao-xin-ui/ui-treaty-negotiation-pc-v2.png` | PC 条约谈判与协议中心 | 协议条款、关系影响、资源交换、反提案、签署和批准进度 |
| `ao-xin-ui/ui-empire-construction-queue-pc-v2.png` | PC 跨星球建设队列 | 多殖民地项目、队列容量、优先级、资源锁定、交付 ETA 和加速操作 |
| `ao-xin-ui/ui-megastructure-construction-pc-v2.png` | PC 巨构工程与奇观建造 | 巨构阶段、资源投入、施工舰队、供应路线、里程碑和全局影响 |
| `ao-xin-ui/ui-crew-academy-pc-v2.png` | PC 舰员训练与军校 | 舰员候选、训练课程、技能树、教官分配、模拟器队列和毕业流程 |
| `ao-xin-ui/ui-interstellar-exchange-orderbook-pc-v2.png` | PC 资源交易所与订单簿 | 买卖挂单、价格趋势、交易费、托管、成交记录和快速成交 |
| `ao-xin-ui/ui-codex-achievement-gallery-pc-v2.png` | PC 文明图鉴与成就展馆 | 舰船、建筑、防御、文明、遗迹收藏、成就进度和解锁奖励 |
| `ao-xin-ui/ui-galactic-season-events-pc-v2.png` | PC 星际赛季与限时事件 | 赛季地图、阶段任务、限时奖励、事件区域、排行榜和倒计时 |
| `ao-xin-ui/ui-galactic-comms-center-pc-v2.png` | PC 银河通讯与频道中心 | 联盟频道、外交私讯、系统广播、未读状态、联系人和消息处理 |
| `ao-xin-ui/ui-battle-outcome-occupation-pc-v2.png` | PC 战役结算与占领管理 | 战果统计、战利品、占领稳定度、驻军、抵抗度和后续治理 |
| `ao-xin-ui/ui-settings-accessibility-save-pc-v2.png` | PC 设置、无障碍与存档 | 图形、音频、输入、语言、对比度、色盲模式、动效、存档和删除保护 |
| `ao-xin-ui/ui-orbital-sensor-network-pc-v2.png` | PC 轨道传感器网络 | 雷达节点、信号覆盖、干扰区域、预警等级、敌情追踪和传感器升级 |
| `ao-xin-ui/ui-jump-gate-management-pc-v2.png` | PC 跃迁门与航道管理 | 跃迁门状态、航道容量、拥堵、能量消耗、交通队列和航线切换 |
| `ao-xin-ui/ui-hyperspace-loading-pc-v2.png` | PC 星际跃迁加载 | 跃迁过场、舰队状态、坐标目的地、燃料、抵达预估和任务提示 |
| `ao-xin-ui/ui-alliance-treasury-research-pc-v2.png` | PC 联盟金库与共同科研 | 共享资源、捐献、联盟科技、项目预算、成员贡献和审计记录 |
| `ao-xin-ui/ui-mission-contracts-bounty-pc-v2.png` | PC 任务委托与合同板 | 护航、调查、悬赏、运输、救援合同、报酬、风险和声望影响 |
| `ao-xin-ui/ui-colony-security-counterintel-pc-v2.png` | PC 治安与反间谍中心 | 治安等级、渗透风险、巡逻覆盖、拘捕行动、安全升级和审讯状态 |
| `ao-xin-ui/ui-colony-workforce-allocation-pc-v2.png` | PC 劳动力与岗位分配 | 人口职业、岗位空缺、效率、疲劳、满意度、轮班和紧急调度 |
| `ao-xin-ui/ui-fleet-insurance-claims-pc-v2.png` | PC 舰队保险与损失理赔 | 受损舰船、理赔条款、维修补偿、残骸抵扣、争议索赔和保费趋势 |
| `ao-xin-ui/ui-new-player-tutorial-pc-v2.png` | PC 新手任务与引导 | 引导章节、当前目标、步骤进度、教学提示、奖励和下一步行动 |
| `ao-xin-ui/ui-faction-reputation-pc-v2.png` | PC 银河阵营声望中心 | 阵营关系、声望等级、解锁奖励、制裁、敌对事件和外交行动 |
| `ao-xin-ui/ui-galactic-senate-summit-pc-v2.png` | PC 银河议会峰会 | 多方代表、议案、影响力、投票、游说、制裁和紧急决议 |
| `ao-xin-ui/ui-planetary-storage-dispatch-pc-v2.png` | PC 行星仓储与库存调度 | 仓库容量、资源分区、库存锁定、运输任务、溢出预警和跨殖民地转移 |
| `ao-xin-ui/ui-relic-archaeology-pc-v2.png` | PC 遗迹档案与考古研究 | 遗迹目录、考古队、扫描进度、未知符号、碎片回收和研究奖励 |
| `ao-xin-ui/ui-fleet-livery-customization-pc-v2.png` | PC 舰队涂装与识别系统 | 舰船外观、徽章、涂装方案、识别灯、呼号和编队预览 |
| `ao-xin-ui/ui-commander-customization-pc-v2.png` | PC 指挥官外观与旗帜定制 | 头像、制服、徽章、文明旗帜、颜色图层和称号预览 |
| `ao-xin-ui/ui-colony-morale-civic-life-pc-v2.png` | PC 民意与幸福度中心 | 人口满意度、舆情、福利政策、文化活动、抗议事件和稳定度趋势 |
| `ao-xin-ui/ui-colony-medical-lifesupport-pc-v2.png` | PC 医疗与生命支持 | 人口健康、医疗舱、疫情风险、氧气库存、隔离状态和救援队列 |
| `ao-xin-ui/ui-colony-education-research-pc-v2.png` | PC 教育与研究人才 | 学校、科学家培养、科研产出、奖学金、人才分配和毕业队列 |
| `ao-xin-ui/ui-surface-transit-logistics-pc-v2.png` | PC 地表交通与物流网络 | 磁悬浮线路、轨道电梯、运输节点、吞吐、拥堵和扩建队列 |
| `ao-xin-ui/ui-colony-agriculture-food-pc-v2.png` | PC 农业与食物供应 | 温室、产量、人口消耗、饮水平衡、冷链运输和短缺预警 |
| `ao-xin-ui/ui-colony-water-ecology-pc-v2.png` | PC 水循环与生态系统 | 水源、净化、循环效率、生态负荷、储备平衡和故障预警 |
| `ao-xin-ui/ui-waste-recycling-industry-pc-v2.png` | PC 废料回收与循环工厂 | 废料分类、回收率、再生材料、处理队列、污染指数和危险泄漏 |
| `ao-xin-ui/ui-planetary-climate-weather-pc-v2.png` | PC 气候与天气控制 | 风暴路径、温度、水汽、灾害预测、气候工程和撤离预警 |
| `ao-xin-ui/ui-empire-economy-forecast-pc-v2.png` | PC 帝国经济预测中心 | 资源趋势、产能预测、价格波动、预算分配、储备和风险预警 |
| `ao-xin-ui/ui-main-menu-save-center-pc-v2.png` | PC 主菜单与存档选择中心 | 继续游戏、新建文明、存档预览、云端/本地状态、设置和退出 |
| `ao-xin-ui/ui-colony-zoning-layout-pc-v2.png` | PC 殖民地分区与布局编辑器 | 建筑网格、道路连接、邻接加成、地块限制、护盾覆盖和规划预览 |
| `ao-xin-ui/ui-colony-ship-launch-settlement-pc-v2.png` | PC 殖民船发射与新定居 | 目标星球、航线、殖民成本、先遣队、护航和落地准备 |
| `ao-xin-ui/ui-deep-space-observatory-pc-v2.png` | PC 深空观测与异常信号 | 深空望远镜、异常信号、观测进度、坐标锁定、解码数据和研究任务 |
| `ao-xin-ui/ui-convoy-escort-route-defense-pc-v2.png` | PC 护航编队与商路防卫 | 商路风险、护航舰队、威胁点、保险、拦截和路线调整 |
| `ao-xin-ui/ui-black-market-smuggling-pc-v2.png` | PC 黑市与走私交易 | 违禁品、匿名订单、隐蔽航线、贿赂成本、追捕风险和安全屋 |
| `ao-xin-ui/ui-spaceport-customs-border-pc-v2.png` | PC 空间站海关与边境管制 | 进出港审查、货物扫描、许可证、税费、走私风险和扣押队列 |
| `ao-xin-ui/ui-fleet-tactical-simulator-pc-v2.png` | PC 舰队演习与战术模拟器 | 模拟战场、编队方案、战术脚本、实时遥测、评分和奖励 |
| `ao-xin-ui/ui-galactic-war-situation-pc-v2.png` | PC 银河战争态势总览 | 战区分布、敌我边界、前线变化、舰队调动、补给路线和战况时间线 |
| `ao-xin-ui/ui-planet-relocation-pc-v2.png` | PC 星球迁移与轨道重定位 | 迁移窗口、目的地预览、航线、资源消耗、风险和护航配置 |
| `ao-xin-ui/ui-prisoner-ceasefire-pc-v2.png` | PC 俘虏交换与停火谈判 | 俘虏名单、停火条款、非军事区、交换资源、信任度和协议确认 |
| `ao-xin-ui/ui-pirate-hunt-bounty-pc-v2.png` | PC 海盗追捕与悬赏行动 | 目标船队、侦察线索、追捕路线、赏金、护航和拦截确认 |
| `ao-xin-ui/ui-ship-retrofit-refit-pc-v2.png` | PC 舰船改装与性能重构 | 模块替换、武器升级、功率平衡、改装队列、备件和性能预览 |
| `ao-xin-ui/ui-colony-immigration-transfer-pc-v2.png` | PC 殖民地移民与人口流动 | 迁入申请、人口配额、航线、住房、就业、安置和审核状态 |
| `ao-xin-ui/ui-covert-operations-infiltration-pc-v2.png` | PC 秘密行动与渗透中心 | 行动目标、潜入进度、情报收益、暴露风险、撤离计划和安全屋 |
| `ao-xin-ui/ui-alliance-diplomacy-center-pc-v2.png` | PC 联盟外交与条约中心 | 联盟名册、外交星图、贸易航线、条约详情、审批状态和 AI 建议 |
| `ao-xin-ui/ui-planetary-disaster-response-center-pc-v2.png` | PC 行星灾害响应中心 | 灾害预警、避难区、护盾状态、救援舰队、资源调度和撤离进度 |
| `ao-xin-ui/ui-fleet-tactical-command-pc-v2.png` | PC 舰队战术指挥中心 | 编队部署、敌我态势、目标锁定、战术指令和战斗时间线 |
| `ao-xin-ui/ui-interstellar-exchange-center-pc-v2.png` | PC 星际贸易与资源交易中心 | 资源价格、订单簿、交易枢纽、货运路线、保险和 AI 市场建议 |
| `ao-xin-ui/ui-colony-governance-population-pc-v2.png` | PC 殖民地治理与人口分配 | 人口结构、住房容量、工作岗位、区域分配、满意度和政策调度 |
| `ao-xin-ui/ui-deep-space-expedition-archaeology-pc-v2.png` | PC 深空远征与遗迹考古 | 远征编队、遗迹扫描、风险评估、回收窗口、战利品和 AI 建议 |
| `ao-xin-ui/ui-orbital-megastructure-construction-pc-v2.png` | PC 轨道巨构建设中心 | 施工阶段、模块队列、资源消耗、轨道工地、交付状态和项目风险 |
| `ao-xin-ui/ui-commander-tutorial-center-pc-v2.png` | PC 新手指挥官引导中心 | 教程章节、当前步骤、首个殖民地、奖励、AI 导师和无障碍提示 |
| `ao-xin-ui/ui-multi-thread-command-queues-pc-v2.png` | PC 多线程指挥队列 | 建设、研发、制造三条并行队列、资源预留、前置依赖、插槽和调度控制 |
| `ao-xin-ui/ui-fleet-maintenance-dock-pc-v2.png` | PC 舰队维护与维修坞 | 维修船坞、受损模块、备件库存、并行维修队列、优先级和 AI 工程师建议 |
| `ao-xin-ui/ui-research-thread-workspace-pc-v2.png` | PC 研发多线程工作台 | 并行科技项目、科学家插槽、研究点预留、依赖图、冲突提示和调度控制 |
| `ao-xin-ui/ui-construction-thread-workspace-pc-v2.png` | PC 建设多线程工作台 | 建筑升级、施工队列、资源锁定、建设槽位、依赖冲突和调度控制 |
| `ao-xin-ui/ui-manufacturing-thread-workspace-pc-v2.png` | PC 制造多线程工作台 | 舰船与装备蓝图、生产槽位、组件依赖、材料锁定、产线调度和质检 |
| `ao-xin-ui/ui-ai-command-automation-pc-v2.png` | PC AI 指挥官自动化中心 | 自动化规则、触发条件、队列路由、权限范围、执行日志和回滚测试 |
| `ao-xin-ui/ui-galactic-season-events-pc-v2.png` | PC 银河赛季与事件中心 | 赛季等级、奖励轨道、限时事件、联盟目标、排行榜和活动倒计时 |
| `ao-xin-ui/ui-alliance-war-operations-pc-v2.png` | PC 联盟战争态势与结算中心 | 战区地图、战线推进、联盟贡献、战损统计、战时目标和奖励结算 |
| `ao-xin-ui/ui-planet-relocation-center-pc-v2.png` | PC 行星迁移与殖民转移中心 | 目标星球评估、跳跃路线、迁移窗口、运输舰队、人口转移和风险预警 |
| `ao-xin-ui/ui-galactic-senate-summit-pc-v2.png` | PC 银河议会与文明峰会 | 文明席位、议案网络、联盟投票、修正案、否决风险和政策决议 |
| `ao-xin-ui/ui-galactic-comms-center-pc-v2.png` | PC 深空通讯与事件收件中心 | 消息分类、未读计数、外交与战报、威胁告警、关联事件和快速回应 |
| `ao-xin-ui/ui-settings-accessibility-save-pc-v2.png` | PC 设置、无障碍与存档中心 | 图形、音频、输入、色彩辅助、动画强度、存档槽位和云同步 |
| `ao-xin-ui/ui-battle-replay-analysis-pc-v2.png` | PC 战斗回放与复盘中心 | 战斗时间轴、回合节点、舰队编队、伤害统计、战术标记和 AI 复盘 |
| `ao-xin-ui/ui-colony-security-counterintel-pc-v2.png` | PC 殖民地安全与反间谍中心 | 安全等级、监控覆盖、可疑活动、证据链、反制任务和 AI 安全建议 |
| `ao-xin-ui/ui-empire-economy-forecast-pc-v2.png` | PC 帝国经济预测中心 | 资源趋势、库存安全线、供需预测、生产线程、贸易合同和 AI 经济建议 |
| `ao-xin-ui/ui-fleet-insurance-claims-pc-v2.png` | PC 舰队保险与损失理赔中心 | 事故报告、损伤重建、保险覆盖、理赔队列、替代舰和 AI 审核 |
| `ao-xin-ui/ui-planetary-storage-dispatch-pc-v2.png` | PC 行星仓储与物流调度中心 | 库存容量、仓储分区、运输队列、装卸节点、配送优先级和 AI 物流建议 |
| `ao-xin-ui/ui-colony-civic-life-morale-pc-v2.png` | PC 殖民地民生与士气中心 | 住房、医疗、教育、就业、派系满意度、政策影响和民生项目 |
| `ao-xin-ui/ui-spaceport-customs-pc-v2.png` | PC 空间港海关与边境检查中心 | 到港舰船、货物申报、风险扫描、通关队列、关税和执法调度 |
| `ao-xin-ui/ui-fleet-tactical-simulator-pc-v2.png` | PC 舰队战术模拟器 | 沙盘推演、敌我编队、战术分支、胜率预测、演习记录和 AI 复盘 |
| `ao-xin-ui/ui-commander-fleet-customization-pc-v2.png` | PC 指挥官与舰队涂装定制中心 | 指挥官外观、舰队涂装、徽章、颜色、引擎尾迹、预设和 3D 预览 |
| `ao-xin-ui/ui-alliance-treasury-research-pc-v2.png` | PC 联盟财政与共同研究中心 | 联盟金库、成员捐献、共同研究、预算分配、提案审批和审计记录 |
| `ao-xin-ui/ui-first-contact-center-pc-v2.png` | PC 外星文明首次接触中心 | 文明档案、翻译进度、信任度、外交选项、交易提案和接触风险 |
| `ao-xin-ui/ui-mission-contracts-bounty-pc-v2.png` | PC 任务合同与悬赏中心 | 悬赏任务、合同条件、风险等级、承包舰队、里程碑、托管和奖励结算 |
| `ao-xin-ui/ui-deep-space-observatory-pc-v2.png` | PC 深空观测台与异常信号中心 | 观测网络、异常信号、星体分析、扫描队列、探针派遣和 AI 科研建议 |
| `ao-xin-ui/ui-terraforming-ecology-center-pc-v2.png` | PC 星球生态改造与气候工程中心 | 温度、水循环、大气成分、生物圈、气候工程和生态恢复队列 |
| `ao-xin-ui/ui-recycling-industry-center-pc-v2.png` | PC 废弃物回收与循环工业中心 | 废料分类、回收产线、材料转化、危险废物、环保合规和并行任务 |
| `ao-xin-ui/ui-faction-reputation-network-pc-v2.png` | PC 阵营声望与关系网络中心 | 阵营关系、声望等级、影响力、任务解锁、外交收益和敌对行动 |
| `ao-xin-ui/ui-colony-education-research-pc-v2.png` | PC 殖民地教育与科研人才中心 | 学校、课程队列、教师分配、人才管线、科研产出和毕业奖励 |
| `ao-xin-ui/ui-colony-medical-lifesupport-pc-v2.png` | PC 殖民地医疗与生命支持中心 | 医疗容量、生命支持、病患队列、隔离风险、救援路线和疫苗研发 |
| `ao-xin-ui/ui-colony-agriculture-food-pc-v2.png` | PC 殖民地农业与食物供应中心 | 温室、产量、人口消耗、水循环、冷链运输和短缺预警 |
| `ao-xin-ui/ui-colony-water-ecology-pc-v2.png` | PC 殖民地水资源与生态循环中心 | 水源、净化、管网、分配、回收率、污染风险和水务项目 |
| `ao-xin-ui/ui-surface-transit-logistics-pc-v2.png` | PC 殖民地地表交通与物流网络中心 | 磁悬浮线路、道路、货运节点、拥堵、通勤、维护和扩建项目 |
| `ao-xin-ui/ui-jump-gate-management-pc-v2.png` | PC 跃迁门网络管理中心 | 跃迁门状态、航线容量、能源负载、通行权限、交通队列和维护项目 |
| `ao-xin-ui/ui-orbital-sensor-network-pc-v2.png` | PC 轨道传感器网络中心 | 传感器节点、覆盖范围、盲区、信号融合、未知目标和侦测队列 |
| `ao-xin-ui/ui-hyperspace-transit-pc-v2.png` | PC 超空间跃迁与加载中心 | 跃迁阶段、舰队状态、航线稳定性、ETA、异常恢复和应急退出 |
| `ao-xin-ui/ui-orbital-spaceport-operations-pc-v2.png` | PC 轨道空间港运营中心 | 泊位调度、起降窗口、货运周转、维修服务、港口拥堵和 AI 调度 |
| `ao-xin-ui/ui-crew-academy-training-pc-v2.png` | PC 舰员学院与训练中心 | 舰员候选、技能树、训练课程、教官分配、模拟器结果和毕业队列 |
| `ao-xin-ui/ui-planetary-climate-weather-pc-v2.png` | PC 殖民地气候与天气控制中心 | 风暴路径、温度、水汽、气候工程、避难区和天气预警 |
| `ao-xin-ui/ui-ceasefire-exchange-center-pc-v2.png` | PC 战俘、停火与人道交换中心 | 战俘状态、停火条款、交换路线、救援舰队、谈判进度和违约风险 |
| `ao-xin-ui/ui-pirate-hunt-bounty-pc-v2.png` | PC 海盗追缉与悬赏行动中心 | 海盗踪迹、目标锁定、赏金任务、追击路线、拦截舰队和证据链 |
| `ao-xin-ui/ui-salvage-recovery-center-pc-v2.png` | PC 战场残骸回收与打捞中心 | 残骸场、资源评估、回收舰队、危险碎片、归属申领和拆解队列 |
| `ao-xin-ui/ui-galactic-codex-achievements-pc-v2.png` | PC 银河图鉴与成就中心 | 文明、舰船、建筑、科技、遗物、成就里程碑和奖励轨道 |
| `ao-xin-ui/ui-alliance-members-permissions-pc-v2.png` | PC 联盟成员与权限管理中心 | 成员名册、职位权限、贡献排行、申请审批、舰队绑定和内部通讯 |
| `ao-xin-ui/ui-convoy-escort-center-pc-v2.png` | PC 舰队护航与运输编队中心 | 商船队、护航舰、航线风险、拦截预警、保险和护航调度 |
| `ao-xin-ui/ui-treaty-negotiation-center-pc-v2.png` | PC 联盟条约谈判中心 | 条约条款、利益交换、安全保证、关系影响、审批队列和生效倒计时 |
| `ao-xin-ui/ui-ai-command-chain-pc-v2.png` | PC AI 秘书与指挥链中心 | AI 助手、军官节点、权限范围、建议队列、自动化委托和决策审计 |
| `ao-xin-ui/ui-commander-profile-statistics-pc-v2.png` | PC 指挥官档案与文明统计中心 | 等级、徽章、殖民地总览、舰队实力、成长曲线和成就里程碑 |
| `ao-xin-ui/ui-ship-retrofit-refit-pc-v2.png` | PC 舰船改装与模块重构中心 | 舰体改装、模块替换、功率预算、材料消耗和多线程改装队列 |
| `ao-xin-ui/ui-planet-construction-center-pc-v2.png` | PC 星球建筑建设中心 | 2.5D 星球分区、建筑规划、防护罩覆盖、资源预留和并行建设队列 |
| `ao-xin-ui/ui-orbital-manufacturing-control-pc-v2.png` | PC 轨道制造总控中心 | 2.5D 船坞、制造产线、舰船装配、材料瓶颈和五线程制造队列 |
| `ao-xin-ui/ui-fleet-deployment-planner-pc-v2.png` | PC 舰队出征规划中心 | 舰队编组、航线预览、跃迁窗口、任务规则和四线程出征队列 |
| `ao-xin-ui/ui-planetary-shield-network-pc-v2.png` | PC 行星护盾网络控制中心 | 护盾分层、覆盖半径、节点能量分配、故障扇区和四线程维护队列 |
| `ao-xin-ui/ui-stargate-transit-hub-pc-v2.png` | PC 星门跃迁枢纽 | 2.5D 星门场景、航道容量、跃迁能源、目的地筛选和五线程跃迁队列 |
| `ao-xin-ui/ui-interstellar-senate-policy-pc-v2.png` | PC 星际议会与政策中心 | 文明政策、法案投票、人口影响、资源税率和四线程政策队列 |
| `ao-xin-ui/ui-deep-space-resource-harvesting-pc-v2.png` | PC 深空资源采集中心 | 小行星带、采矿无人机、产量监控、航线风险和五线程采集队列 |
| `ao-xin-ui/ui-interstellar-resource-exchange-pc-v2.png` | PC 星际资源交易所 | 订单簿、报价深度、跨星区运输、税费与五线程交易订单 |
| `ao-xin-ui/ui-galactic-alerts-center-pc-v2.png` | PC 全局事件与警报中心 | 星系告警地图、威胁等级、事件详情、委派处理和五线程响应队列 |
| `ao-xin-ui/ui-commander-training-hub-pc-v2.png` | PC 指挥官教程与任务中心 | 新手章节、阶段目标、奖励解锁、交互教学和四线程训练任务 |
| `ao-xin-ui/ui-intelligence-analysis-center-pc-v2.png` | PC 星际情报与侦察分析中心 | 扫描波段、目标识别、隐形舰队、情报置信度和五线程侦察队列 |
| `ao-xin-ui/ui-fleet-repair-control-pc-v2.png` | PC 舰队维修与损伤管理中心 | 受损舰体、模块诊断、备件库存、维修优先级和五线程维修队列 |
| `ao-xin-ui/ui-orbital-launch-control-pc-v2.png` | PC 轨道发射与回收中心 | 发射窗口、泊位调度、轨道交通、燃料消耗和五线程发射队列 |
| `ao-xin-ui/ui-planetary-terraforming-control-pc-v2.png` | PC 星球地表改造中心 | 2.5D 地形编辑、生态分区、气候参数、防护罩边界和四线程改造队列 |
| `ao-xin-ui/ui-planetary-power-grid-pc-v2.png` | PC 行星能源网络中心 | 发电设施、储能、能源线路、峰值负载和四线程能源升级队列 |
| `ao-xin-ui/ui-interstellar-logistics-control-pc-v2.png` | PC 星际物流调度中心 | 货运航线、仓储节点、护航舰队、装载计划和五线程运输队列 |
| `ao-xin-ui/ui-galactic-war-theater-pc-v2.png` | PC 银河战区态势中心 | 战区边界、舰队位置、补给线、威胁热区和五线程作战行动 |
| `ao-xin-ui/ui-colony-civic-management-pc-v2.png` | PC 殖民地人口与社会治理中心 | 人口结构、住房容量、职业分配、迁移计划和四线程治理项目 |
| `ao-xin-ui/ui-alliance-command-center-pc-v2.png` | PC 联盟成员与权限中心 | 成员档案、职位权限、舰队共享、资源库、贡献度和四线程联盟项目 |
| `ao-xin-ui/ui-research-program-control-pc-v2.png` | PC 科研项目调度中心 | 研究节点、科学家分配、实验室资源、技术路线和五线程研发队列 |
| `ao-xin-ui/ui-codex-achievements-pc-v2.png` | PC 图鉴与成就中心 | 舰船、建筑、防御、科技图鉴、收藏进度和四线程成就目标 |
| `ao-xin-ui/ui-counterintelligence-control-pc-v2.png` | PC 殖民地安全与反间谍中心 | 安全等级、渗透路线、监控节点、嫌疑目标和五线程反制行动 |
| `ao-xin-ui/ui-planetary-recovery-center-pc-v2.png` | PC 行星灾后重建中心 | 受损区域、重建优先级、避难区、救援资源、施工队列和恢复进度 |
| `ao-xin-ui/ui-relic-archaeology-center-pc-v2.png` | PC 外星遗迹考古分析中心 | 遗迹层级、扫描进度、文物价值、解谜线索、考古队列和 AI 历史学家 |
| `ao-xin-ui/ui-research-lab-allocation-pc-v2.png` | PC 科研实验室资源分配中心 | 实验室负载、科学家分配、研究点产出、并行项目、实验日志和突破概率 |
| `ao-xin-ui/ui-colony-zoning-layout-editor-pc-v2.png` | PC 殖民地分区与布局编辑器 | 建筑网格、道路连接、邻接加成、地块限制、护盾覆盖和布局版本 |
| `ao-xin-ui/ui-flow-design-v1.png` | 全流程总览 | 总览、星系、舰队、战报四个核心页面的流程关系 |

## 统一组件图片

| 文件 | 作用 |
|---|---|
| `ao-xin-ui/ui-style-guide-v1.svg` | 颜色、字体、面板、层级、光照统一规范 |
| `ao-xin-ui/ui-control-bars-v1.svg` | 顶部资源栏、底部模块导航、桌面/移动端状态 |
| `ao-xin-ui/ui-mobile-responsive-v1.svg` | 移动端四个主页面和底部抽屉布局 |
| `ao-xin-ui/ui-battle-report-v1.svg` | 战报、损失、残骸和舰队恢复状态 |
| `ao-xin-ui/ui-secondary-screens-v1.svg` | 任务、物流、成就军官、图鉴、设置、新手引导 |

## 页面与图片映射

| 页面 | 参考图 | 实现重点 |
|---|---|---|
| 星球总览 | `ao-xin-ui/ui-planet-overview-v1.png` | 中央星球场景 + 建筑选中详情 |
| 建筑 | `ao-xin-ui/ui-planet-overview-v1.png` / `ao-xin-ui/materials-design-sheet-v1.png` | 2.5D 建筑卡、产出、升级 |
| 船坞 | `ao-xin-ui/ui-shipyard-v1.png` | 建造队列、蓝图、维护 |
| 研究 | `ao-xin-ui/ui-research-network-v1.png` | 节点网络、前置、研究队列 |
| 星系 | `ao-xin-ui/ui-galaxy-route-v1.png` | 坐标、可见情报、路线风险 |
| 派遣 | `ao-xin-ui/ui-galaxy-route-v1.png` | 编队、燃料、货舱、确认 |
| 防御 | `ao-xin-ui/ui-defense-grid-v1.png` | 护盾、防御覆盖、威胁预测 |
| 战报 | `ao-xin-ui/ui-battle-report-v1.svg` | 结果、损失、残骸、逐轮时间线 |
| 恢复 | `ao-xin-ui/ui-battle-report-v1.svg` | 维修队列、保障权益、修复 |
| 任务 | `ao-xin-ui/ui-secondary-screens-v1.svg` | 事件通讯、风险选项、继续任务 |
| 物流 | `ao-xin-ui/ui-secondary-screens-v1.svg` | 运输预算、报价、装载、确认 |
| 成就/军官 | `ao-xin-ui/ui-secondary-screens-v1.svg` | 进度、奖励、任命、授权 |
| 图鉴/设置 | `ao-xin-ui/ui-secondary-screens-v1.svg` | 搜索、辅助功能、存档和危险操作 |

## 状态覆盖

- 护盾：稳定 / 受压 / 受损。
- 航线：安全 / 注意 / 高风险 / 不可达。
- 舰队：待命 / 出航 / 战斗 / 受损 / 维修 / 失联。
- 资源请求：可执行 / 资源不足 / 队列已满 / 报价过期 / 授权冲突。
- 战斗结果：胜利 / 失败 / 防守成功 / 撤退 / 无掠夺权。
- 页面状态：加载 / 空态 / 错误 / 重连 / 请求中 / 已完成。

## 交付检查

- [x] 每个游戏页面都有对应图片或统一布局板。
- [x] 顶部与底部控制栏只有一套视觉规则。
- [x] 桌面与移动端的组件和颜色语义一致。
- [x] 2.5D 建筑、战舰、防御、星球、防护罩物料已有资产板。
- [x] 战报、恢复、任务、物流、设置和新手引导已有细节板。
- [x] 秘密行动与渗透中心加入行动目标、潜入进度、暴露风险和撤离计划细节板。
- [ ] ImageGen 额度恢复后，将 SVG 细节板重新渲染为同风格高清 PNG。

