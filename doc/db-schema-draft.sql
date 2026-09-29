-- ============================================================================
-- 新OGame MVP 数据库结构草案 v0.1（MariaDB 10.6+ / InnoDB / utf8mb4）
-- 依据：V1.3 §07.3 优先逻辑记录 + API-01 命令契约（doc/api-01-command-contract.md）
-- 状态：DRAFT —— 名称为建议结构（§07.3 明示"不能伪装为上游已存在路径"）；
--       SOURCE-01 源码审计后确定与 OGameX 物理表的映射/适配关系（Keep/Extend/Replace）。
-- 设计纪律：
--   1. 权威余额在行星/舰队实际状态表；Ledger（resource_transactions）只解释来源去向。
--   2. 幂等两层：game_commands.command_id 唯一 + 业务阶段键（任务表内的 idempotency 约束）。
--   3. 资产变更/任务/命令结果/Ledger/Outbox 同事务写入（§07.2），Outbox 提交后再分发。
--   4. 库存四态：Inventory/Reserved/InTransit/Escrow；Reserved 不重复计入总值（GDD-13）。
-- ============================================================================

-- ---------- 配置与版本（GDD-10：版本/哈希/生效时点/废弃状态） ----------
CREATE TABLE game_rulesets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_name    VARCHAR(64)  NOT NULL,              -- 如 'balance_rc1'
    version         VARCHAR(32)  NOT NULL,
    content_hash    CHAR(64)     NOT NULL,              -- sha256，缺失/TBD 拒绝启用
    status          ENUM('candidate','testing','frozen','deprecated') NOT NULL,
    effective_at    DATETIME(6)  NULL,                  -- 生效时点；任务锁定快照用
    deprecated_at   DATETIME(6)  NULL,
    content_json    JSON         NOT NULL,              -- 完整参数集（保留旧任务所需配置）
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_ruleset_ver (ruleset_name, version),
    UNIQUE KEY uq_ruleset_hash (content_hash)
) ENGINE=InnoDB;

-- ---------- 命令表（§07.2 统一入口；提交幂等键） ----------
CREATE TABLE game_commands (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    command_id      CHAR(36)     NOT NULL,              -- UUID，调用方生成
    payload_hash    CHAR(64)     NOT NULL,              -- 同 ID 不同 payload → 拒绝
    actor_kind      ENUM('player','pirate_ai','governor') NOT NULL,
    actor_id        BIGINT UNSIGNED NOT NULL,
    owner_id        BIGINT UNSIGNED NOT NULL,           -- Actor≠Owner 时须授权
    authorization_id  BIGINT UNSIGNED NULL,             -- 总督命令必填（授权版本快照）
    authorization_version INT UNSIGNED NULL,
    type            VARCHAR(40)  NOT NULL,              -- API-01 §3 命令清单
    payload_json    JSON         NOT NULL,
    ruleset_id      BIGINT UNSIGNED NOT NULL,           -- 提交时解析并锁定
    status          ENUM('received','validated','committed','rejected','failed') NOT NULL,
    reject_reason   VARCHAR(255) NULL,                  -- 业务拒绝（不重试）
    error_class     VARCHAR(64)  NULL,                  -- 技术失败分类（可重试）
    attempt_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    result_json     JSON         NULL,                  -- 已记录结果：重放提交直接返回
    submitted_at    DATETIME(6)  NOT NULL,              -- 服务器事件时序以此为准
    committed_at    DATETIME(6)  NULL,
    UNIQUE KEY uq_command_id (command_id),
    KEY idx_owner_time (owner_id, submitted_at),
    FOREIGN KEY (ruleset_id) REFERENCES game_rulesets(id)
) ENGINE=InnoDB;

-- ---------- Outbox（同事务持久化，提交后发布；消息可重复、效果不重复） ----------
CREATE TABLE game_outbox (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    command_id      CHAR(36)     NOT NULL,
    event_type      VARCHAR(64)  NOT NULL,
    payload_json    JSON         NOT NULL,
    published_at    DATETIME(6)  NULL,                  -- NULL=待发布，可重试
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_unpublished (published_at),
    FOREIGN KEY (command_id) REFERENCES game_commands(command_id)
) ENGINE=InnoDB;

-- ---------- Ledger（解释来源去向；不是可花费钱包） ----------
CREATE TABLE resource_transactions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    command_id      CHAR(36)     NOT NULL,
    owner_id        BIGINT UNSIGNED NOT NULL,
    planet_id       BIGINT UNSIGNED NULL,               -- 舰队在途时为空 + fleet_id
    fleet_id        BIGINT UNSIGNED NULL,
    resource        ENUM('M','C','D') NOT NULL,
    amount_signed   DECIMAL(20,4) NOT NULL,             -- 正=入，负=出
    operation       VARCHAR(32)  NOT NULL,              -- production/build/research/ship/fuel/transport/plunder/debris/init...
    source_ref      VARCHAR(64)  NULL,                  -- 显式来源（生产/初始化/掠夺目标…）
    target_ref      VARCHAR(64)  NULL,
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_owner_res (owner_id, resource, created_at),
    FOREIGN KEY (command_id) REFERENCES game_commands(command_id)
) ENGINE=InnoDB;

-- ---------- 战斗快照（battle_id = 业务幂等键；结算层提交损毁/存活/掠夺/残骸） ----------
CREATE TABLE battle_snapshots (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    battle_id       VARCHAR(64)   NOT NULL,  -- 前缀+uuid(battle-/counteresp-),CHAR(36) 过短(MariaDB 截断校验实证)
    command_id      CHAR(36)     NOT NULL,              -- 触发抵达的命令
    ruleset_id      BIGINT UNSIGNED NOT NULL,
    engine_version  VARCHAR(32)  NOT NULL,              -- Rust Classic 模块版本 + 等价语料版本
    seed            BIGINT UNSIGNED NOT NULL,
    participants_json JSON       NOT NULL,              -- 参战方+科技快照（协调器生成）
    rounds_json     JSON         NULL,                  -- 引擎输出（结算前）
    result_json     JSON         NULL,                  -- 损毁/存活/掠夺/残骸（结算后）
    snapshot_at     DATETIME(6)  NOT NULL,              -- 防守方资产快照时刻（战斗时刻）
    settled_at      DATETIME(6)  NULL,
    snapshot_version BIGINT UNSIGNED NOT NULL,          -- 乐观版本：陈旧计算禁止覆盖（§07.2）
    UNIQUE KEY uq_battle_id (battle_id),
    FOREIGN KEY (command_id) REFERENCES game_commands(command_id),
    FOREIGN KEY (ruleset_id) REFERENCES game_rulesets(id)
) ENGINE=InnoDB;

-- ---------- 核心状态表（最小集；与上游表映射待 SOURCE-01） ----------

CREATE TABLE planets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL,           -- 首版兼容玩家账号字段（§07.1）
    galaxy          SMALLINT UNSIGNED NOT NULL,
    system_pos      SMALLINT UNSIGNED NOT NULL,
    orbit           TINYINT UNSIGNED NOT NULL,
    is_homeworld    TINYINT(1) NOT NULL DEFAULT 0,      -- 主星保留/不可占领（GDD-09）
    inv_m           DECIMAL(20,4) NOT NULL DEFAULT 0,   -- Inventory（可花费=inv−reserved）
    inv_c           DECIMAL(20,4) NOT NULL DEFAULT 0,
    inv_d           DECIMAL(20,4) NOT NULL DEFAULT 0,
    reserved_m      DECIMAL(20,4) NOT NULL DEFAULT 0,   -- Reserved 共享物理字段
    reserved_c      DECIMAL(20,4) NOT NULL DEFAULT 0,
    reserved_d      DECIMAL(20,4) NOT NULL DEFAULT 0,
    levels_json     JSON         NOT NULL,              -- 建筑等级（建筑属于行星）
    ships_json      JSON         NOT NULL,              -- 在港舰船（与在途/在建互斥口径）
    queue_building  JSON         NOT NULL,              -- 3 待执行+1 执行（02.2）
    production_checkpoint_at DATETIME(6) NOT NULL,      -- 分段生产检查点（离线恢复）
    version         BIGINT UNSIGNED NOT NULL DEFAULT 0, -- 乐观锁（锁顺序：文明→行星→舰队→目标）
    UNIQUE KEY uq_coords (galaxy, system_pos, orbit)
) ENGINE=InnoDB;

CREATE TABLE civilizations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL UNIQUE,
    techs_json      JSON         NOT NULL,              -- 科技属于文明
    research_active JSON         NULL,                  -- 文明同时至多 1 项（含锁）
    mission_slots_used SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- F-06：2+COMPUTER
    protection_state ENUM('N0','N1','N2','N3') NOT NULL DEFAULT 'N0',
    version         BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE fleet_tasks (                              -- 业务任务状态机，与命令状态分离
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id         CHAR(36)     NOT NULL,
    command_id      CHAR(36)     NOT NULL,
    owner_id        BIGINT UNSIGNED NOT NULL,
    mission         ENUM('transport','colonize','raid','scout','recall') NOT NULL,
    status          ENUM('outbound','holding','returning','done','cancelled') NOT NULL,
    ships_json      JSON         NOT NULL,              -- 在途舰船（锁定组成快照）
    cargo_m         DECIMAL(20,4) NOT NULL DEFAULT 0,   -- InTransit；战利品返航前不可花费
    cargo_c         DECIMAL(20,4) NOT NULL DEFAULT 0,
    cargo_d         DECIMAL(20,4) NOT NULL DEFAULT 0,
    origin_planet_id BIGINT UNSIGNED NOT NULL,
    target_coords   VARCHAR(24)  NOT NULL,
    ruleset_snapshot_json JSON   NOT NULL,              -- 成本/航时/燃料/规则版本锁定（GDD-10）
    depart_at       DATETIME(6)  NOT NULL,
    arrive_at       DATETIME(6)  NOT NULL,              -- 服务器事件时间推进
    settle_phase    VARCHAR(24)  NULL,                  -- 业务阶段幂等键：arrive/return 等
    UNIQUE KEY uq_task_id (task_id),
    UNIQUE KEY uq_task_phase (task_id, settle_phase),   -- 不同 command 重复结算同阶段 → 拒绝
    KEY idx_fleet_due (arrive_at),
    FOREIGN KEY (command_id) REFERENCES game_commands(command_id)
) ENGINE=InnoDB;

CREATE TABLE build_tasks (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    planet_id       BIGINT UNSIGNED NOT NULL,           -- 每行星至多 1 执行中（部分唯一索引见下）
    building        VARCHAR(32)  NOT NULL,
    target_level    SMALLINT UNSIGNED NOT NULL,
    cost_m          DECIMAL(20,4) NOT NULL,             -- 启动时实际扣费快照
    cost_c          DECIMAL(20,4) NOT NULL,
    cost_d          DECIMAL(20,4) NOT NULL,
    ruleset_id      BIGINT UNSIGNED NOT NULL,
    status          ENUM('executing','done','cancelled') NOT NULL,
    complete_at     DATETIME(6)  NOT NULL,
    KEY idx_build_due (status, complete_at),
    FOREIGN KEY (planet_id) REFERENCES planets(id),
    FOREIGN KEY (ruleset_id) REFERENCES game_rulesets(id)
) ENGINE=InnoDB;
-- 每行星单执行中：由事务内 SELECT ... FOR UPDATE 行星行保证（锁顺序 §4），不另建函数索引。

CREATE TABLE research_tasks (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL,           -- 文明锁：同事务 FOR UPDATE civilization 行
    tech            VARCHAR(32)  NOT NULL,
    target_level    SMALLINT UNSIGNED NOT NULL,
    cost_snapshot_json JSON      NOT NULL,
    ruleset_id      BIGINT UNSIGNED NOT NULL,
    status          ENUM('executing','done','cancelled') NOT NULL,
    complete_at     DATETIME(6)  NOT NULL,
    KEY idx_research_due (status, complete_at),
    FOREIGN KEY (ruleset_id) REFERENCES game_rulesets(id)
) ENGINE=InnoDB;

CREATE TABLE ship_orders (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    planet_id       BIGINT UNSIGNED NOT NULL,
    batch_no        CHAR(36)     NOT NULL,              -- 批次号=业务幂等键
    ship            VARCHAR(32)  NOT NULL,
    amount          INT UNSIGNED NOT NULL,
    cost_snapshot_json JSON      NOT NULL,              -- 整批扣费快照（GDD-04）
    ruleset_id      BIGINT UNSIGNED NOT NULL,
    status          ENUM('executing','done','cancelled') NOT NULL,
    complete_at     DATETIME(6)  NOT NULL,
    UNIQUE KEY uq_batch (batch_no),
    KEY idx_ship_due (status, complete_at),
    FOREIGN KEY (planet_id) REFERENCES planets(id)
) ENGINE=InnoDB;

-- ---------- AI / 总督（GDD-05/06；名称建议结构） ----------
CREATE TABLE ai_strategy_states (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL,
    behavior_class  ENUM('BUILD','SCOUT','RAID','RECOVER') NOT NULL,   -- 行为类别
    strategy_state  ENUM('GROWTH','SCOUTING','RAIDING','DEFENSIVE','RECOVERY') NOT NULL, -- 策略状态（两枚举分离，GDD-05）
    state_entered_at DATETIME(6) NOT NULL,
    context_json    JSON         NULL,
    KEY idx_owner (owner_id)
) ENGINE=InnoDB;

CREATE TABLE intel_snapshots (                          -- GDD-12：快照制，无实时订阅
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL,           -- 只读本 Owner 合法情报
    target_ref      VARCHAR(64)  NOT NULL,
    observed_at     DATETIME(6)  NOT NULL,              -- 新鲜度评价基准
    visible_fields_json JSON     NOT NULL,              -- 可见字段+精度说明
    ruleset_id      BIGINT UNSIGNED NOT NULL,
    source_command  CHAR(36)     NOT NULL,              -- 侦察任务实际派船产生
    KEY idx_owner_target (owner_id, target_ref, observed_at)
) ENGINE=InnoDB;

CREATE TABLE governor_authorizations (                  -- GDD-06：授权版本化
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id        BIGINT UNSIGNED NOT NULL,
    version         INT UNSIGNED NOT NULL,
    scope_json      JSON         NOT NULL,              -- 行星/动作/单笔+周期预算/最低储备/禁止资源/有效期
    revoked_at      DATETIME(6)  NULL,                  -- 撤销阻止未承诺动作，不删在途舰队
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_owner_ver (owner_id, version)
) ENGINE=InnoDB;

-- ---------- 残骸场（CR-20260923-004 C；上游 OGameX debris_fields 同构，2026-09-23 落地） ----------
CREATE TABLE debris_fields (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    galaxy          SMALLINT UNSIGNED NOT NULL,
    system_pos      SMALLINT UNSIGNED NOT NULL,
    orbit           TINYINT UNSIGNED  NOT NULL,
    metal           DECIMAL(20,4) NOT NULL DEFAULT 0,
    crystal         DECIMAL(20,4) NOT NULL DEFAULT 0,
    deuterium       DECIMAL(20,4) NOT NULL DEFAULT 0,   -- 氘不成残骸（GDD-04），列保留同构；MVP 只写不收
    version         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uq_debris_coords (galaxy, system_pos, orbit)
) ENGINE=InnoDB;

-- ============================================================================
-- 待 SOURCE-01 决定：与 OGameX 现有表的 Keep/Extend/Replace/Isolate 映射；
-- planets/fleet_tasks 等核心表大概率为 Extend/适配层视图，本稿字段为逻辑需求底线。
-- 显式 TBD：Escrow 独立账本（Post-MVP 市场）。残骸场 TBD 已由 debris_fields 解除（CR-004 C）。
-- ============================================================================
