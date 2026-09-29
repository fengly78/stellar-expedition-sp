#!/usr/bin/env python3
"""tools/sim_regression.py — SIM 骨架回归基线工具。

用途：任何引擎/公式改动后，一条命令验证四个骨架 SIM 输出逐位一致。
  python tools/sim_regression.py record   # 记录基线（跑 4 个骨架 sim，归一化后存入 baseline/）
  python tools/sim_regression.py check    # 复跑并与基线深比较（退出码 1 = 有回归）

归一化：剥除 run_id 等运行期挥发字段后做全量深比较（数值按 f64 精确比）。
纪律：只跑骨架脚本（sim01~sim04.py，gate_evidence=false 实验口径）；
正式档（*_formal.py / sim23）等 CR 批准，不在此列。
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "sim" / "reports"
BASELINE = REPORTS / "baseline"

# 骨架脚本 → 报告文件名前缀
SIMS = {
    "sim01": ("sim/sim01.py", "sim01-matrix"),
    "sim02": ("sim/sim02.py", "sim02-skeleton"),
    "sim03": ("sim/sim03.py", "sim03-skeleton"),
    "sim04": ("sim/sim04.py", "sim04-skeleton"),
    "f08": ("sim/f08_calibrate.py", "f08-calibrate"),
}

VOLATILE_KEYS = {"run_id", "generated_at", "timestamp", "report_path", "started_at", "finished_at"}


def normalize(node):
    """递归剥除挥发字段；其余原样保留（数值不做任何圆整，保持逐位敏感）。"""
    if isinstance(node, dict):
        return {k: normalize(v) for k, v in node.items() if k not in VOLATILE_KEYS}
    if isinstance(node, list):
        return [normalize(v) for v in node]
    return node


def latest_report(prefix: str, after: float) -> Path | None:
    cands = [p for p in REPORTS.glob(f"{prefix}-*.json") if p.stat().st_mtime >= after]
    return max(cands, key=lambda p: p.stat().st_mtime) if cands else None


def run_sim(script: str) -> float:
    t0 = time.time()
    proc = subprocess.run([sys.executable, str(ROOT / script)], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", cwd=ROOT, timeout=600)
    if proc.returncode != 0:
        tail = "\n".join((proc.stdout + proc.stderr).splitlines()[-15:])
        raise RuntimeError(f"{script} 运行失败（exit {proc.returncode}）:\n{tail}")
    return t0


def diff_path(a, b, path: str = "") -> list[str]:
    """返回前若干条差异路径说明。"""
    diffs: list[str] = []
    if type(a) is not type(b) and not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
        return [f"{path}: 类型 {type(a).__name__} vs {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                diffs.append(f"{path}.{k}: 基线缺失")
            elif k not in b:
                diffs.append(f"{path}.{k}: 新运行缺失")
            else:
                diffs.extend(diff_path(a[k], b[k], f"{path}.{k}"))
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append(f"{path}: 长度 {len(a)} vs {len(b)}")
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                diffs.extend(diff_path(x, y, f"{path}[{i}]"))
    elif a != b:
        diffs.append(f"{path}: {a!r} vs {b!r}")
    return diffs


def load_norm(path: Path):
    return normalize(json.loads(path.read_text(encoding="utf-8")))


def cmd_record() -> int:
    BASELINE.mkdir(parents=True, exist_ok=True)
    for name, (script, prefix) in SIMS.items():
        t0 = run_sim(script)
        rep = latest_report(prefix, t0)
        if not rep:
            print(f"[{name}] 未找到新报告（前缀 {prefix}）")
            return 1
        norm = load_norm(rep)
        out = BASELINE / f"{name}.json"
        out.write_text(json.dumps({"source_report": rep.name, "payload": norm},
                                  ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[{name}] 基线已记录 ← {rep.name}")
    print("基线记录完成")
    return 0


def cmd_check() -> int:
    fails = 0
    for name, (script, prefix) in SIMS.items():
        base = BASELINE / f"{name}.json"
        if not base.exists():
            print(f"[{name}] 缺基线 {base}，先跑 record")
            fails += 1
            continue
        t0 = run_sim(script)
        rep = latest_report(prefix, t0)
        if not rep:
            print(f"[{name}] 未找到新报告")
            fails += 1
            continue
        diffs = diff_path(json.loads(base.read_text(encoding="utf-8"))["payload"], load_norm(rep))
        if diffs:
            fails += 1
            print(f"[{name}] FAIL {rep.name}（{len(diffs)} 处差异，示前 5）")
            for d in diffs[:5]:
                print("   ", d)
        else:
            print(f"[{name}] PASS（与基线逐位一致）")
    print("回归检查", "全部通过" if fails == 0 else f"{fails} 项失败")
    return 1 if fails else 0


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in ("record", "check"):
        print(__doc__)
        return 2
    return cmd_record() if sys.argv[1] == "record" else cmd_check()


if __name__ == "__main__":
    sys.exit(main())
