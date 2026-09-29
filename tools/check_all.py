#!/usr/bin/env python3
"""tools/check_all.py — 全量回归总闸（CR 执行链与日常改动的统一验收入口）。

一条命令跑完本机当前可跑的全部质量闸（无需 PHP/Rust/node 环境）：
  1. tests/test_formulas.py        —— F-01~F-07 公式真值（20 断言）
  2. tools/config_validate.py      —— RC1 配置结构完整性 + TBD 阻塞清单
  3. tools/check_combat_corpus.py  —— 战斗语料 11 例（combat.py）
  4. tools/sim_regression.py check —— sim01~04 骨架与基线逐位一致
  5. tools/check_php_balance.py    —— game-server 83 PHP 文件括号配平（php -l 降级）

可选扩展（环境就位后自动纳入）：node 可用时跑 web/ vitest；cargo 可用时跑 Rust corpus-check。

退出码（三态，刻意区分「没跑成」和「跑挂了」）：
  0 = 全部闸实际通过
  1 = 至少一闸真实失败（有代码/数据问题，必须修）
  2 = 无真实失败，但至少一闸被环境阻塞、结果未知（不能当绿）

2026-09-29：原先只有 0/1 两态，Rust 闸被 WDAC 策略拦截（os error 4551）与真实
编译失败在输出上完全同形，报告里两者无法区分。实测 `cargo --version` 会正常返回
returncode=1 并在 stderr 打印策略文案，而非抛 OSError，所以必须扫 stderr 文本。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    # Windows 默认 GBK 无法打印子进程 UTF-8 解码失败时的替换字符。
    sys.stdout.reconfigure(errors='replace')

ROOT = Path(__file__).resolve().parent.parent

# 环境阻塞的特征串：与「闸跑挂了」在 returncode 上都是 1，只能靠 stderr 文本区分。
BLOCK_MARKERS = (
    "os error 4551",
    "应用程序控制策略",
    "code integrity policy",
    "did not meet the Enterprise signing level",
    "Access is denied",
)

PASS, FAIL, BLOCKED, SKIP = "PASS", "FAIL", "BLOCKED", "SKIP"

GATES: list[tuple[str, list[str]]] = [
    ("公式真值 tests/test_formulas.py", [sys.executable, "tests/test_formulas.py"]),
    ("RC1 配置校验", [sys.executable, "tools/config_validate.py"]),
    # 2026-09-29 新增：RC1 冻结纪律此前**只算不比对**（只在 meta.hash 为空时提示），
    # 导致 hash 早已漂移却无人发现——保护冻结规则集的只有流程和纪律、没有代码。
    # 这条闸会真实篡改一份副本、验证校验器确实拦得住，并反向验证「同步 hash 后放行」
    # （否则就是一道只会永远变红或永远变绿的空门禁）。
    ("RC1 冻结 hash 纪律", [sys.executable, "tools/tests/test_rc1_freeze_hash.py"]),
    ("战斗语料 11 例", [sys.executable, "tools/check_combat_corpus.py"]),
    ("SIM 骨架回归", [sys.executable, "tools/sim_regression.py", "check"]),
    ("PHP 括号配平", [sys.executable, "tools/check_php_balance.py", "game-server"]),
]

# 找 node：先看 PATH，再退到 Windows 上常见的安装位置。
# 2026-09-29：原先这里**硬编码**了维护者本机的绝对路径
# （一个 AI 客户端的内置 node.exe），既泄露本机用户名与工具布局，
# 在任何别的机器上也直接不可用——那是一个功能性 bug，不只是隐私问题。
NODE_CANDIDATES = (
    "node",
    r"C:\Program Files\nodejs\node.exe",
    str(Path.home() / "AppData/Local/Programs/nodejs/node.exe"),
)

# 命中阻塞时的可操作提示。key 是闸名。
BLOCK_HINTS = {
    "Rust corpus-check": (
        "本机 WDAC/应用控制策略拦截了 cargo.exe（Code Integrity Policy "
        "ID:{0283ac0f-fff1-49ae-ada1-8a933130cad6}）。\n"
        "     该闸本次【未被验证】，不得推定为绿；预编译 target/release/corpus-check.exe\n"
        "     也早于源码，不能当替代证据。解除需在 WDAC 策略侧放行 cargo.exe。"
    ),
}


def run(name: str, cmd: list[str], cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True,
                          env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                          encoding="utf-8", errors="replace", timeout=900)
    out = proc.stdout + proc.stderr
    lines = out.splitlines()
    # 2026-09-29：原先失败时只打印**最后 4 行**。
    # 干净克隆验证时正好踩到：vitest 偶发失败，但真正的原因（并发争用 / 其它）
    # 全部落在被截断的部分，导致「跑了却不知道败在哪」。
    # 失败时打印足够上下文（最多 30 行），成功时仍只留摘要，避免刷屏。
    tail = "\n".join(lines[-4:]) if proc.returncode == 0 else "\n".join(lines[-30:])

    if proc.returncode == 0:
        print(f"{PASS}  {name}")
        return PASS

    low = out.lower()
    if any(m.lower() in low for m in BLOCK_MARKERS):
        # 关键：环境拦截不算 FAIL。报 FAIL 会让人去改根本没跑过的 Rust 代码。
        print(f"{BLOCKED} {name}")
        print(f"     {tail}")
        hint = BLOCK_HINTS.get(name)
        if hint:
            print(f"     → {hint}")
        return BLOCKED

    print(f"{FAIL}  {name}")
    print(f"     {tail}")
    return FAIL


def main() -> int:
    tally = {PASS: 0, FAIL: 0, BLOCKED: 0, SKIP: 0}
    for name, cmd in GATES:
        tally[run(name, cmd)] += 1

    # 可选闸：node（前端 vitest，含战斗金值对拍）
    node = next((c for c in NODE_CANDIDATES if c == "node" and shutil.which("node")),
                None)
    if node is None:
        node = next((c for c in NODE_CANDIDATES
                     if c != "node" and Path(c).exists()), None)
    if node:
        tally[run("web/ vitest（含战斗对拍）",
                  [node, "node_modules/vitest/vitest.mjs", "run"], cwd=ROOT / "web")] += 1
    else:
        print(f"{SKIP}  web/ vitest（node 不可用）")
        tally[SKIP] += 1

    # 可选闸：cargo（Rust 语料对拍）
    # 注意：shutil.which 只判断「文件在不在」，感知不到策略拦截——那发生在
    # 进程创建阶段。所以这里必须真跑，让 run() 去判 BLOCKED，不能靠 which 提前 SKIP。
    if shutil.which("cargo"):
        tally[run("Rust corpus-check",
                  ["cargo", "run", "--quiet", "--release", "--bin", "corpus-check",
                   str(ROOT / "sim" / "combat_corpus")],
                  cwd=ROOT / "game-server" / "combat")] += 1
    else:
        print(f"{SKIP}  Rust corpus-check（cargo 未就位，等 E0-c）")
        tally[SKIP] += 1

    print("=" * 40)
    print(f"汇总：{PASS} {tally[PASS]} / {FAIL} {tally[FAIL]} / "
          f"{BLOCKED} {tally[BLOCKED]} / {SKIP} {tally[SKIP]}")
    if tally[FAIL]:
        print("总闸：存在真实失败，必须修")
        return 1
    if tally[BLOCKED]:
        print("总闸：无真实失败，但有闸被环境阻塞、结果未知 —— 不等于全绿")
        return 2
    print("总闸：全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
