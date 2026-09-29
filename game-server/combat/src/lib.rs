//! ogame-battle —— Rust Classic 战斗模块（doc/rust-combat-ffi-spec.md）
//!
//! 权威链：web/src/game/battle.ts = canonical；sim/combat.py = 已逐位等价验证的参照移植。
//! 本实现逐行对齐 sim/combat.py（mulberry32/hash32 u32 环绕语义、f64 战斗数值、
//! 弹跳/吸收/爆炸/rapidfire/回合末清场重置护盾）。
//!
//! 纯函数契约：同一（输入, 种子, 规则版本）→ 同一输出。无 I/O、无时钟、无外部状态。
//! 错误契约（规格 §7）：bad_input / too_large 以 JSON 返回，不 panic 跨 FFI。

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic::{catch_unwind, AssertUnwindSafe};

use serde_json::{json, Map, Value};

const MAX_UNITS_PER_SIDE: u64 = 100_000; // 规格 §7 too_large

// ---------- PRNG（逐位对齐 prng.ts / combat.py） ----------

struct Mulberry32 {
    a: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { a: seed }
    }
    fn next(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6D2B79F5);
        let mut t = (self.a ^ (self.a >> 15)).wrapping_mul(1 | self.a);
        t = t
            .wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))
            ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

fn hash32(nums: &[u32]) -> u32 {
    let mut h: u32 = 2166136261;
    for &n in nums {
        h = (h ^ n).wrapping_mul(16777619);
    }
    h
}

// ---------- 领域类型 ----------

#[derive(Clone)]
struct Spec {
    unit_id: i64,
    attack: f64,
    shield: f64,
    hull: f64,
    rapidfire: HashMap<i64, i64>,
}

#[derive(Clone)]
struct Unit {
    spec: Spec,
    shield: f64,
    hull: f64,
}

struct Fleet {
    owner_id: i64,
    // 展开顺序 = unit_id 升序（canonical battle.ts 行为：JS 对象整数键按升序数值迭代；
    // 种子派生与目标选择都依赖此顺序，禁止用 JSON 插入序）
    groups: Vec<(i64, Spec, u64)>,
}

#[derive(Default)]
struct RoundCounters {
    hits_attacker: f64,
    hits_defender: f64,
    full_strength_attacker: f64,
    full_strength_defender: f64,
    absorbed_damage_attacker: f64,
    absorbed_damage_defender: f64,
}

// ---------- 输入解析（解析后 groups 按 unit_id 升序排序，对齐 canonical JS 整数键迭代序） ----------

fn parse_fleets(v: &Value) -> Result<Vec<Fleet>, String> {
    let arr = v.as_array().ok_or("fleets 必须是数组")?;
    let mut out = Vec::new();
    for f in arr {
        let owner_id = f.get("owner_id").and_then(Value::as_i64).ok_or("缺 owner_id")?;
        let units = f.get("units").and_then(Value::as_object).ok_or("缺 units")?;
        let mut groups = Vec::new();
        for (_key, g) in units.iter() {
            // 遍历顺序无关：下方统一按 unit_id 升序排序
            let spec_v = g.get("spec").ok_or("缺 spec")?;
            let unit_id = spec_v.get("unit_id").and_then(Value::as_i64).ok_or("缺 unit_id")?;
            let amount = g.get("amount").and_then(Value::as_u64).ok_or("缺 amount")?;
            let mut rapidfire = HashMap::new();
            if let Some(rf) = spec_v.get("rapidfire").and_then(Value::as_object) {
                for (k, val) in rf.iter() {
                    let kid: i64 = k.parse().map_err(|_| "rapidfire 键非整数")?;
                    rapidfire.insert(kid, val.as_i64().ok_or("rapidfire 值非整数")?);
                }
            }
            groups.push((
                unit_id,
                Spec {
                    unit_id,
                    attack: spec_v.get("attack").and_then(Value::as_f64).ok_or("缺 attack")?,
                    shield: spec_v.get("shield").and_then(Value::as_f64).ok_or("缺 shield")?,
                    hull: spec_v.get("hull").and_then(Value::as_f64).ok_or("缺 hull")?,
                    rapidfire,
                },
                amount,
            ));
        }
        // canonical battle.ts 行为对齐：JS 对象整数键升序迭代 → groups 按 unit_id 升序
        groups.sort_by_key(|g| g.0);
        out.push(Fleet { owner_id, groups });
    }
    Ok(out)
}

fn battle_seed(attacker: &[Fleet], defender: &[Fleet]) -> u32 {
    let mut flat: Vec<u32> = Vec::new();
    for f in attacker {
        flat.push(f.owner_id as u32);
        for (uid, _spec, amount) in &f.groups {
            flat.push(*uid as u32);
            flat.push(*amount as u32);
        }
    }
    flat.push(0xDEADBEEF);
    for f in defender {
        flat.push(f.owner_id as u32);
        for (uid, _spec, amount) in &f.groups {
            flat.push(*uid as u32);
            flat.push(*amount as u32);
        }
    }
    hash32(&flat)
}

fn expand(fleets: &[Fleet]) -> Vec<Unit> {
    let mut out = Vec::new();
    for f in fleets {
        for (_uid, spec, amount) in &f.groups {
            for _ in 0..*amount {
                out.push(Unit {
                    spec: spec.clone(),
                    shield: spec.shield,
                    hull: spec.hull,
                });
            }
        }
    }
    out
}

// ---------- 战斗语义（逐行对齐 combat.py） ----------

fn combat_phase(
    rng: &mut Mulberry32,
    attackers: &[Unit],
    defenders: &mut [Unit],
    rnd: &mut RoundCounters,
    attacker_side: bool,
) {
    for a in attackers {
        loop {
            if defenders.is_empty() {
                return;
            }
            let idx = (rng.next() * defenders.len() as f64) as usize;
            let target = &mut defenders[idx];

            let damage = a.spec.attack;
            if damage < 0.01 * target.spec.shield {
                break; // 弹跳（基础护盾口径）
            }

            let mut absorbed = 0.0;
            if target.shield > 0.0 {
                if damage <= target.shield {
                    absorbed = damage;
                    target.shield -= damage;
                } else {
                    absorbed = target.shield;
                    target.hull -= damage - target.shield;
                    target.shield = 0.0;
                }
            } else {
                target.hull -= damage;
            }

            let ratio = target.hull / target.spec.hull;
            if ratio < 0.7 && rng.next() < 1.0 - ratio {
                target.hull = 0.0;
                target.shield = 0.0;
            }

            if attacker_side {
                rnd.hits_attacker += 1.0;
                rnd.full_strength_attacker += damage;
                rnd.absorbed_damage_defender += absorbed;
            } else {
                rnd.hits_defender += 1.0;
                rnd.full_strength_defender += damage;
                rnd.absorbed_damage_attacker += absorbed;
            }

            let rf = a.spec.rapidfire.get(&target.spec.unit_id).copied().unwrap_or(0);
            if rf == 0 {
                break;
            }
            if rng.next() < 1.0 - 1.0 / rf as f64 {
                continue; // 续射同一攻击循环
            }
            break;
        }
    }
}

fn cleanup(losses: &mut Map<String, Value>, units: Vec<Unit>) -> Vec<Unit> {
    let mut kept = Vec::new();
    for mut u in units {
        if u.hull <= 0.0 {
            let key = u.spec.unit_id.to_string();
            let cur = losses.get(&key).and_then(Value::as_u64).unwrap_or(0);
            losses.insert(key, json!(cur + 1));
        } else {
            u.shield = u.spec.shield; // 回合末护盾重置
            kept.push(u);
        }
    }
    kept
}

fn counts(units: &[Unit]) -> Map<String, Value> {
    let mut out = Map::new();
    for u in units {
        let key = u.spec.unit_id.to_string();
        let cur = out.get(&key).and_then(Value::as_u64).unwrap_or(0);
        out.insert(key, json!(cur + 1));
    }
    out
}

// ---------- 主入口 ----------

fn simulate(input: &Value) -> Result<Value, (String, &'static str)> {
    let bad = |msg: &str| (msg.to_string(), "bad_input");
    let attacker = parse_fleets(input.get("attacker_fleets").ok_or_else(|| bad("缺 attacker_fleets"))?)
        .map_err(|e| bad(&e))?;
    let defender = parse_fleets(input.get("defender_fleets").ok_or_else(|| bad("缺 defender_fleets"))?)
        .map_err(|e| bad(&e))?;

    let n_att: u64 = attacker.iter().flat_map(|f| f.groups.iter().map(|g| g.2)).sum();
    let n_def: u64 = defender.iter().flat_map(|f| f.groups.iter().map(|g| g.2)).sum();
    if n_att > MAX_UNITS_PER_SIDE || n_def > MAX_UNITS_PER_SIDE {
        return Err(("单方单位数超过 100000".to_string(), "too_large"));
    }

    let max_rounds = input
        .get("max_rounds")
        .and_then(Value::as_u64)
        .unwrap_or(6) as usize;
    let seed = match input.get("seed") {
        None | Some(Value::Null) => battle_seed(&attacker, &defender), // TS 行为：输入派生
        Some(v) => v.as_u64().ok_or_else(|| bad("seed 非整数"))? as u32,
    };

    let mut attackers = expand(&attacker);
    let mut defenders = expand(&defender);
    let mut rng = Mulberry32::new(seed);

    let mut total_att_losses = Map::new();
    let mut total_def_losses = Map::new();
    let mut rounds: Vec<Value> = Vec::new();

    for _ in 0..max_rounds {
        if attackers.is_empty() || defenders.is_empty() {
            break;
        }
        let mut rnd = RoundCounters::default();
        combat_phase(&mut rng, &attackers, &mut defenders, &mut rnd, true);
        combat_phase(&mut rng, &defenders, &mut attackers, &mut rnd, false);
        attackers = cleanup(&mut total_att_losses, attackers);
        defenders = cleanup(&mut total_def_losses, defenders);
        rounds.push(json!({
            "attacker_ships": counts(&attackers),
            "defender_ships": counts(&defenders),
            "hits_attacker": rnd.hits_attacker,
            "hits_defender": rnd.hits_defender,
            "full_strength_attacker": rnd.full_strength_attacker,
            "full_strength_defender": rnd.full_strength_defender,
            "absorbed_damage_attacker": rnd.absorbed_damage_attacker,
            "absorbed_damage_defender": rnd.absorbed_damage_defender,
        }));
    }

    Ok(json!({
        "rounds": rounds,
        "attacker_losses": total_att_losses,
        "defender_losses": total_def_losses,
        "attacker_survivors": counts(&attackers),
        "defender_survivors": counts(&defenders),
    }))
}

// ---------- 语料回归/CLI 用公共入口 ----------

/// corpus-check 与 simulate-json CLI 共用入口：错误以 {"error","class"} JSON 返回（不 panic）。
pub fn simulate_for_corpus(input: &Value) -> Value {
    match simulate(input) {
        Ok(v) => v,
        Err((msg, class)) => json!({"error": msg, "class": class}),
    }
}

// ---------- C ABI（规格 §2/§7） ----------

fn respond(result: Result<Value, (String, &'static str)>) -> *mut c_char {
    let v = match result {
        Ok(v) => v,
        Err((msg, class)) => json!({"error": msg, "class": class}),
    };
    let s = v.to_string();
    CString::new(s).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
}

/// # Safety
/// input 必须为合法 UTF-8 NUL 结尾字符串；返回指针由 ogame_battle_free 释放。
#[no_mangle]
pub unsafe extern "C" fn ogame_battle_simulate(input: *const c_char) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| {
        if input.is_null() {
            return Err(("null input".to_string(), "bad_input"));
        }
        let json_str = match CStr::from_ptr(input).to_str() {
            Ok(s) => s,
            Err(_) => return Err(("输入非 UTF-8".to_string(), "bad_input")),
        };
        let parsed: Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(e) => return Err((format!("JSON 解析失败：{e}"), "bad_input")),
        };
        simulate(&parsed)
    }));
    match result {
        Ok(r) => respond(r),
        Err(_) => respond(Err(("内部 panic（不应到达）".to_string(), "internal"))),
    }
}

/// # Safety
/// ptr 必须为 ogame_battle_simulate* 返回的指针，且仅释放一次。
#[no_mangle]
pub unsafe extern "C" fn ogame_battle_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

/// 批量接口（规格 §2）：{"cases": [...]} → {"results": [...]}
///
/// # Safety
/// 同 ogame_battle_simulate。
#[no_mangle]
pub unsafe extern "C" fn ogame_battle_simulate_batch(input: *const c_char) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| {
        if input.is_null() {
            return Err(("null input".to_string(), "bad_input"));
        }
        let json_str = CStr::from_ptr(input).to_str().map_err(|_| ("输入非 UTF-8".to_string(), "bad_input"))?;
        let parsed: Value = serde_json::from_str(json_str).map_err(|e| (format!("JSON 解析失败：{e}"), "bad_input"))?;
        let cases = parsed.get("cases").and_then(Value::as_array).ok_or_else(|| ("缺 cases".to_string(), "bad_input"))?;
        let results: Vec<Value> = cases
            .iter()
            .map(|c| match simulate(c) {
                Ok(v) => v,
                Err((msg, class)) => json!({"error": msg, "class": class}),
            })
            .collect();
        Ok(json!({"results": results}))
    }));
    match result {
        Ok(r) => respond(r),
        Err(_) => respond(Err(("内部 panic（不应到达）".to_string(), "internal"))),
    }
}

// ---------- 最小冒烟测试（语料回归入口 corpus-check 见下一迭代） ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prng_matches_python_first_values() {
        // 锚点真值由 sim/combat.py 实测生成（交接档凌晨三十）：逐位一致才算对齐
        let mut rng = Mulberry32::new(0);
        assert!((rng.next() - 0.26642920868471265).abs() < 1e-18);
        assert!((rng.next() - 0.0003297457005828619).abs() < 1e-18);
        assert!((rng.next() - 0.2232720274478197).abs() < 1e-18);
        assert_eq!(hash32(&[7, 204, 100, 0xDEADBEEF]), 3255844019);
    }

    #[test]
    fn empty_defender_zero_rounds() {
        let input = json!({
            "attacker_fleets": [{"fleet_mission_id": 1, "owner_id": 7,
                "units": {"204": {"spec": {"unit_id": 204, "attack": 50.0, "shield": 10.0, "hull": 400.0, "rapidfire": {}}, "amount": 10}}}],
            "defender_fleets": [],
            "seed": null,
            "max_rounds": 6
        });
        let out = simulate(&input).unwrap();
        assert_eq!(out["rounds"].as_array().unwrap().len(), 0);
        assert_eq!(out["attacker_survivors"]["204"], json!(10));
    }
}
