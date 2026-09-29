//! simulate-json —— 单场模拟 CLI 包装（rust-combat-ffi-spec §1：便于语料回归与手工核查）
//!
//! 用法：从 stdin 读 BattleInput JSON，stdout 输出结果 JSON。
//!   type case.json | cargo run --bin simulate-json

use std::io::Read;

use ogame_battle::simulate_for_corpus;
use serde_json::Value;

fn main() {
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf).expect("stdin 读取失败");
    let input: Value = match serde_json::from_str(&buf) {
        Ok(v) => v,
        Err(e) => {
            println!(r#"{{"error": "JSON 解析失败：{}", "class": "bad_input"}}"#, e);
            std::process::exit(1);
        }
    };
    println!("{}", simulate_for_corpus(&input));
}
