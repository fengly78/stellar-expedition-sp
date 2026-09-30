# Stellar Expedition Superpowers Design Pack

> Design baseline closed: 2026-09-30  
> Current implementation target: RC2 Candidate → Vertical Slice → Evidence → Frozen

## 1. Start Here

Implementation should read in this order:

1. `specs/2026-09-30-design-audit-closure.md`
2. `specs/2026-09-29-graphical-vps-architecture-design.md`
3. `specs/2026-09-30-game-core-spec.md`
4. `specs/2026-09-30-game-config-schema-spec.md`
5. `config/rulesets/ruleset_manifest_rc2_candidate.json` (repository-root path)
6. `plans/2026-09-30-scope-freeze-release-gates.md`
7. `plans/2026-09-30-vertical-slice-implementation-plan.md`

## 2. Core Specifications

### Architecture
- `2026-09-29-graphical-vps-architecture-design.md`

### Game Core
- `2026-09-30-game-core-spec.md`
- `2026-09-30-content-catalog-spec.md`

### Economy / Progression
- `2026-09-30-economy-progression-spec.md`
- `2026-09-30-economy-30day-reference-model-v0_1.md`
- `2026-09-30-buildings-tech-balance-v0_2.md`
- `2026-09-30-new-player-protection-progression-v0_2.md`

### Fleet / Combat
- `2026-09-30-fleet-pvp-combat-spec.md`
- `2026-09-30-ships-defense-balance-v0_2.md`
- `2026-09-30-combat-engine-v2-spec.md`

### AI
- `2026-09-30-ai-empire-autopilot-spec.md`

### 2.5D / UX
- `2026-09-30-2_5d-web-mobile-ux-spec.md`
- `2026-09-30-planet-2_5d-layout-system-v0_1.md`

### World / Social / LiveOps
- `2026-09-30-universe-pve-closure-spec.md`
- `2026-09-30-market-alliance-liveops-spec.md`

### Config / Governance
- `2026-09-30-game-config-schema-spec.md`
- `2026-09-30-balance-rc2-design-spec.md`
- `2026-09-30-design-audit-closure.md`

## 3. Implementation Plans

- `plans/2026-09-29-one-time-rewrite-plan.md`
- `plans/2026-09-30-game-design-to-implementation-plan.md`
- `plans/2026-09-30-balance-simulation-test-plan.md`
- `plans/2026-09-30-vertical-slice-implementation-plan.md`
- `plans/2026-09-30-scope-freeze-release-gates.md`

## 4. Runtime Rule Authority

Do not implement gameplay rules by copying values from prose documents.

The machine-readable authoring entry is:

`config/rulesets/ruleset_manifest_rc2_candidate.json`

The prose specifications explain intent, invariants and acceptance criteria.

If prose and machine-readable config conflict during implementation:
1. stop;
2. identify the owning rule domain in the manifest;
3. create a design/ruleset change record;
4. update both config and explanatory documentation;
5. rerun validators.

## 5. Status Meaning

### Closed for implementation
No more design work is required before coding unless implementation reveals a blocker.

### Candidate
Rule/value exists but requires simulation, test or telemetry evidence.

### Frozen
May only change through explicit change control with migration/regression consideration.

## 6. Current State

Closed for implementation:
- Architecture
- Game loop
- Content taxonomy
- Ruleset composition
- Planet layout semantics
- Combat v2 semantics
- AI permission model
- PvP protection state model
- Market Beta1 state model
- Legacy migration semantics
- Release gates

Candidate pending evidence:
- Exact balance numbers
- Economy milestone ranges
- Tactical stats
- PvE rewards
- PvP thresholds
- Tutorial grant sizes
- Fleet matchup tuning

## 7. Development Rule

From this point, prefer implementing and measuring over adding more design.

Any proposed new feature must answer:

> Does this block the current Vertical Slice or a Release Gate?

If no, place it in post-Beta backlog.
