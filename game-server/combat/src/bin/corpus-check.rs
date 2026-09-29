//! corpus-check —— 黄金语料回归入口（rust-combat-ffi-spec §6 L0）
//!
//! 用法：cargo run --bin corpus-check <语料目录>   （如 sim/combat_corpus/）
//! 逐例：读 {case, seed, input, expected}，注入 seed/max_rounds 后调 simulate，
//! 与 expected 做**数值深比较**（对象键序无关、数组保序、数字按 f64 精确比较——
//! Python 侧 int 50 与 Rust 侧 f64 50.0 视为同值，浮点和因同序运算而逐位相等）。
//! 任一用例不符 → 退出码 1。

use std::process::exit;

use ogame_battle::simulate_for_corpus;
use serde_json::Value;

/// 数值深比较：数字一律按 f64 比（精确），对象键序无关，数组保序。
fn numeric_eq(a: &Value, b: &Value, path: &str) -> Result<(), String> {
    match (a, b) {
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return Err(format!("{path}: 键数不等 {} vs {}", x.len(), y.len()));
            }
            for (k, v) in x {
                match y.get(k) {
                    Some(w) => numeric_eq(v, w, &format!("{path}.{k}"))?,
                    None => return Err(format!("{path}: 缺键 {k}")),
                }
            }
            Ok(())
        }
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Err(format!("{path}: 数组长度不等 {} vs {}", x.len(), y.len()));
            }
            for (i, (v, w)) in x.iter().zip(y.iter()).enumerate() {
                numeric_eq(v, w, &format!("{path}[{i}]"))?;
            }
            Ok(())
        }
        (Value::Number(x), Value::Number(y)) => {
            let (fx, fy) = (x.as_f64().unwrap_or(f64::NAN), y.as_f64().unwrap_or(f64::NAN));
            if fx == fy {
                Ok(())
            } else {
                Err(format!("{path}: 数值不等 {fx} vs {fy}"))
            }
        }
        (Value::Null, Value::Null) => Ok(()),
        (Value::Bool(x), Value::Bool(y)) if x == y => Ok(()),
        (Value::String(x), Value::String(y)) if x == y => Ok(()),
        _ => Err(format!("{path}: 类型或值不等 {a} vs {b}")),
    }
}

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "sim/combat_corpus".to_string());
    let manifest_path = format!("{dir}/manifest.json");
    let manifest: Value = serde_json::from_str(
        &std::fs::read_to_string(&manifest_path).expect("manifest.json 读取失败"),
    )
    .expect("manifest.json 解析失败");

    let cases = manifest["cases"].as_array().expect("manifest 缺 cases");
    let mut failed = 0;
    for c in cases {
        let name = c["case"].as_str().expect("case 名缺失");
        let path = format!("{dir}/{name}.json");
        let case: Value = serde_json::from_str(
            &std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("{path} 读取失败")),
        )
        .unwrap_or_else(|_| panic!("{path} 解析失败"));

        let mut input = case["input"].clone();
        input["seed"] = case["seed"].clone();
        if input.get("max_rounds").is_none() {
            input["max_rounds"] = json6();
        }

        let got = simulate_for_corpus(&input);
        match numeric_eq(&got, &case["expected"], name) {
            Ok(()) => println!("PASS {name}"),
            Err(e) => {
                println!("FAIL {name}: {e}");
                failed += 1;
            }
        }
    }
    println!("---\n{} 例，失败 {}", cases.len(), failed);
    if failed > 0 {
        exit(1);
    }
}

fn json6() -> Value {
    Value::from(6)
}
