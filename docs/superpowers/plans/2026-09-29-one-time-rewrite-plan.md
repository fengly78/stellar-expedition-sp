# Stellar Expedition SP 一次性重写实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一次维护窗口内把游戏切换到 TypeScript/React + Rust + MariaDB + VPS 的全图形界面生产系统。

**Architecture:** 新系统独立实现 TypeScript API、Worker、MariaDB 数据层和 Rust 战斗适配器。旧 PHP/Go 代码只读参考，不参与新系统运行；所有玩家流程由 React 图形界面完成。

**Tech Stack:** React 19、TypeScript、Vite、Fastify、Zod、Node.js、MariaDB、Rust、Nginx、systemd、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-29-graphical-vps-architecture-design.md`

## Global Constraints

- 生产写入链路只允许新 TypeScript 服务端。
- 任务队列存储在 MariaDB，不引入 Redis 或 RabbitMQ。
- 资源、队列、舰队、战斗和奖励以服务器状态为准。
- Rust 战斗结果必须保持固定语料和种子回放一致。
- 玩家不得依赖命令行、JSON 或脚本完成游戏流程。
- 一次性切换前必须拥有旧数据库和旧 VPS 的可启动快照。
- 新系统必须可以在单台 VPS 上运行。

## Review Focus

- 重复提交同一命令时只能产生一次资源或任务变化；由 API 幂等测试覆盖。
- Worker 在锁定任务后崩溃时任务必须可租约恢复；由队列故障测试覆盖。
- MariaDB 导入后资源账本、库存和任务数量必须守恒；由迁移验收覆盖。
- Rust 调用失败时不能发放战斗奖励；由战斗事务测试覆盖。
- 移动端和桌面端的核心图形流程都必须可完成；由 Playwright 流程覆盖。

---

### Task 1: 新系统目录与构建基线

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/app.ts`
- Create: `server/src/health.ts`
- Create: `combat/README.md`
- Create: `db/README.md`
- Modify: `README.md`
- Test: `server/src/app.test.ts`

**Interfaces:**
- Produces `GET /healthz` returning `{ status: "ok" }`.
- Produces `server` build and test scripts used by later tasks.

- [ ] **Step 1: Write the failing health test**
- [ ] **Step 2: Run the test and verify the new server is absent**
- [ ] **Step 3: Add the TypeScript server scaffold and health route**
- [ ] **Step 4: Run server unit tests and TypeScript build**
- [ ] **Step 5: Commit the new server baseline**

### Task 2: MariaDB schema, migrations, and seed rules

**Files:**
- Create: `db/migrations/001_core.sql`
- Create: `db/migrations/002_commands.sql`
- Create: `db/migrations/003_ledger.sql`
- Create: `db/migrations/004_jobs.sql`
- Create: `db/migrations/005_fleet_and_battles.sql`
- Create: `db/scripts/migrate.ts`
- Create: `db/scripts/verify.ts`
- Test: `db/tests/schema.test.ts`

**Interfaces:**
- Produces versioned MariaDB migrations.
- Produces `migrate` and `verify` commands for deployment and cutover.

- [ ] **Step 1: Write failing schema tests for accounts, planets, ledger, jobs, fleets, and battles**
- [ ] **Step 2: Run the tests against an empty MariaDB and verify missing tables fail**
- [ ] **Step 3: Implement tables, foreign keys, unique idempotency keys, due-time indexes, and audit columns**
- [ ] **Step 4: Implement migration and schema verification scripts**
- [ ] **Step 5: Run schema tests on a clean database and a restored backup**
- [ ] **Step 6: Commit the database baseline**

### Task 3: Authentication, state reads, and API contracts

**Files:**
- Create: `server/src/auth/`
- Create: `server/src/contracts/`
- Create: `server/src/modules/state/`
- Create: `server/src/modules/accounts/`
- Test: `server/src/modules/state/*.test.ts`

**Interfaces:**
- `GET /api/v1/state` returns the authenticated owner snapshot.
- `POST /api/v1/session` creates a session token.
- Zod schemas reject malformed IDs, missing owners, and unsupported versions.

- [ ] **Step 1: Write failing contract and authorization tests**
- [ ] **Step 2: Verify unauthenticated and cross-owner requests fail**
- [ ] **Step 3: Implement session, owner authorization, state aggregation, and error envelopes**
- [ ] **Step 4: Run API tests against MariaDB**
- [ ] **Step 5: Commit the API contract baseline**

### Task 4: Command, ledger, and economic domain

**Files:**
- Create: `server/src/modules/commands/`
- Create: `server/src/modules/ledger/`
- Create: `server/src/modules/economy/`
- Test: `server/src/modules/economy/*.test.ts`

**Interfaces:**
- `POST /api/v1/commands` accepts an idempotent command envelope.
- Domain services expose transactional resource debit, credit, and ledger append operations.

- [ ] **Step 1: Write failing tests for duplicate commands, insufficient resources, and ledger conservation**
- [ ] **Step 2: Verify failures on the empty domain implementation**
- [ ] **Step 3: Implement command persistence, owner checks, ledger writes, and transactional balances**
- [ ] **Step 4: Run MariaDB integration tests including concurrent duplicate submissions**
- [ ] **Step 5: Commit the economic domain**

### Task 5: MariaDB task queue and Worker

**Files:**
- Create: `server/src/queue/claimJob.ts`
- Create: `server/src/queue/leaseJob.ts`
- Create: `server/src/queue/retryJob.ts`
- Create: `server/src/worker/main.ts`
- Create: `server/src/worker/handlers/`
- Test: `server/src/queue/*.test.ts`

**Interfaces:**
- `claimJob(workerId, now)` claims one due job with a lease.
- `completeJob(jobId, workerId)` commits completion only for the active lease.
- `retryJob(jobId, error)` increments attempts and schedules retry or dead-letter state.

- [ ] **Step 1: Write failing tests for claim, lease expiry, retry, dead-letter, and duplicate execution**
- [ ] **Step 2: Verify no job can be claimed by two workers**
- [ ] **Step 3: Implement MariaDB row locking, lease recovery, retry backoff, and handler dispatch**
- [ ] **Step 4: Implement resource, build, research, manufacturing, fleet, and battle handlers**
- [ ] **Step 5: Run worker crash-recovery tests**
- [ ] **Step 6: Commit the queue and Worker**

### Task 6: Rust combat adapter and replay contract

**Files:**
- Create: `server/src/modules/combat/CombatPort.ts`
- Create: `server/src/modules/combat/RustCombatAdapter.ts`
- Modify: `game-server/combat/`
- Create: `server/src/modules/combat/*.test.ts`

**Interfaces:**
- `CombatPort.resolve(snapshot, seed)` returns a deterministic battle result.
- Adapter errors are returned as retryable technical failures and never award rewards.

- [ ] **Step 1: Write failing adapter and replay tests**
- [ ] **Step 2: Verify the adapter rejects malformed snapshots and unavailable combat binaries**
- [ ] **Step 3: Implement the Rust adapter and versioned snapshot protocol**
- [ ] **Step 4: Run Rust corpus, server adapter, and same-seed replay tests**
- [ ] **Step 5: Commit the combat boundary**

### Task 7: Complete graphical client against the new API

**Files:**
- Modify: `web/src/`
- Create: `web/src/api/`
- Create: `web/src/components/queues/`
- Test: `web/tests/`

**Interfaces:**
- Client API module owns HTTP calls and converts server errors into UI messages.
- Screens use server snapshots and never mutate authoritative resources locally.

- [ ] **Step 1: Write failing browser tests for login, overview, build, research, fleet, galaxy, and reports**
- [ ] **Step 2: Verify each flow fails against the missing new API**
- [ ] **Step 3: Implement API client, session state, screen data loaders, queues, map interactions, and error states**
- [ ] **Step 4: Run Vitest, TypeScript build, and Playwright desktop/mobile flows**
- [ ] **Step 5: Commit the graphical client cutover**

### Task 8: VPS packaging and operations

**Files:**
- Create: `ops/systemd/stellar-api.service`
- Create: `ops/systemd/stellar-worker.service`
- Create: `ops/nginx/stellar-expedition.conf`
- Create: `ops/scripts/install.sh`
- Create: `ops/scripts/backup-mariadb.sh`
- Create: `docker-compose.dev.yml`
- Test: `ops/tests/deployment-smoke.ps1`

**Interfaces:**
- systemd starts API and Worker with restart policies.
- Nginx serves the graphical client and proxies `/api`.
- Backup script produces a restorable MariaDB dump.

- [ ] **Step 1: Write the deployment smoke test for health, static UI, API, Worker, and database connectivity**
- [ ] **Step 2: Verify the smoke test fails on an empty VPS image**
- [ ] **Step 3: Implement systemd units, Nginx config, environment template, firewall checklist, and backups**
- [ ] **Step 4: Run the smoke test in a clean VPS-like environment**
- [ ] **Step 5: Commit deployment assets**

### Task 9: Data conversion and cutover rehearsal

**Files:**
- Create: `db/migration/import-legacy.ts`
- Create: `db/migration/verify-conservation.ts`
- Create: `ops/runbooks/cutover.md`
- Create: `ops/runbooks/rollback.md`
- Test: `db/migration/*.test.ts`

**Interfaces:**
- Import script converts the frozen PHP database snapshot into the new MariaDB schema.
- Verification reports owner count, planet count, resource totals, active jobs, and battle records.

- [ ] **Step 1: Write failing conversion tests for representative accounts, queues, fleets, and reports**
- [ ] **Step 2: Verify malformed and duplicate legacy rows are rejected with an audit report**
- [ ] **Step 3: Implement deterministic import, normalization, and conservation checks**
- [ ] **Step 4: Rehearse export, import, verification, smoke test, and rollback on a disposable VPS**
- [ ] **Step 5: Commit the cutover runbooks**

### Task 10: Final release gate and one-time switch

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `CODEX_HANDOFF.md`
- Test: full repository and VPS release suite

- [ ] **Step 1: Run Web, TypeScript, MariaDB, Rust, browser, migration, and recovery suites**
- [ ] **Step 2: Verify the old snapshot can still start for rollback**
- [ ] **Step 3: Freeze writes, export, import, verify, and start the new VPS stack**
- [ ] **Step 4: Run the production smoke checklist and switch traffic**
- [ ] **Step 5: Observe the new system through the agreed window and record evidence**
- [ ] **Step 6: Commit release documentation and tag the cutover**

## Execution Order

Tasks 1–2 establish the new runtime and database. Tasks 3–6 build the authoritative server. Task 7 connects the full graphical client. Task 8 makes the stack deployable on a VPS. Task 9 rehearses data conversion and rollback. Task 10 is the final one-time switch.

No task may switch production traffic until Tasks 1–9 are complete and the rollback snapshot has been verified.
