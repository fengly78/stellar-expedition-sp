"""RC1 冻结纪律的防回归测试（2026-09-29）。

背景：并行审计发现 `config_validate.py` 只在 `meta.hash` 为**空**时提示回填，
**从不与实际内容比对**，于是 balance_rc1.json 的 hash 早已漂移却一直没人发现。
复核又查出它在**全部 3 个历史提交里从未一致过** → 是写入时就错的记录字段，
而非「内容被改后没同步」。

本文件锁住两件事：
  1. 当前 `balance_rc1.json` 的 `meta.hash` 与内容**一致**（冻结性可验证）
  2. 内容一旦被改动而 hash 未同步，校验**必须报错**（这才是纪律的关键）

**口径要点**：`meta.hash` 就在被哈希的文档**内部**，拿「整文件哈希」去比
数学上永远不相等（自指不动点不存在）。可验证的口径只能是
「**去掉 meta.hash 之后**文档的 canonical sha256」。写回填脚本时正是被这一点
拦下来的——最初按整文件哈希回填，校验立刻报「回填后整文件哈希与写入值不符」。
"""
import copy
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RC1 = REPO / "config" / "rulesets" / "balance_rc1.json"
VALIDATOR = REPO / "tools" / "config_validate.py"

results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  —— {detail}" if detail else ""))


def content_hash(data: dict) -> str:
    """与 config_validate.content_hash 同口径：去掉 meta.hash 后的 canonical sha256。"""
    stripped = copy.deepcopy(data)
    stripped.get("meta", {}).pop("hash", None)
    return hashlib.sha256(
        json.dumps(stripped, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def run_validator(path: str):
    r = subprocess.run(
        [sys.executable, VALIDATOR, path],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=REPO,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    return r.returncode, (r.stdout or "") + (r.stderr or "")


print("=== 1. 当前 RC1 的 meta.hash 与内容一致 ===")
data = json.loads(io.open(RC1, encoding="utf-8").read())
claimed = str(data.get("meta", {}).get("hash") or "")
calc = content_hash(data)
check("meta.hash 非空", bool(claimed), claimed[:16] + "…")
check("meta.hash == 去掉 hash 后的内容哈希", claimed == calc,
      f"声称 {claimed[:16]}… 实际 {calc[:16]}…")

print()
print("=== 2. 校验器对当前文件 exit 0 ===")
code, out = run_validator(RC1)
check("config_validate exit 0", code == 0, f"exit={code}")
check("输出明示冻结性可验证", "冻结性可验证" in out)

print()
print("=== 3. 篡改内容但不同步 hash -> 必须报错（这条才是纪律的关键）===")
tmpdir = tempfile.mkdtemp(prefix="rc1_tamper_")
tmp = os.path.join(tmpdir, "balance_rc1.json")
tampered = copy.deepcopy(data)
# 改一个真实参数值（金属矿造价），模拟「绕过流程改了冻结数据」
victim = None
for p in tampered.get("parameters", []):
    if p.get("key") == "BUILD.METAL_MINE":
        victim = p
        break
if victim is None:
    for p in tampered.get("parameters", []):
        if str(p.get("key", "")).startswith("BUILD."):
            victim = p
            break
check("找到可篡改的参数", victim is not None, str(victim.get("key")) if victim else "未找到")
if victim is not None:
    before = json.dumps(victim, ensure_ascii=False, sort_keys=True)
    # 改 value 里的数字
    if isinstance(victim.get("value"), dict) and victim["value"]:
        k = next(iter(victim["value"]))
        if isinstance(victim["value"][k], (int, float)):
            victim["value"][k] = victim["value"][k] + 1
        else:
            victim["value"][k] = "999"
    else:
        victim["value"] = 999999
    after = json.dumps(victim, ensure_ascii=False, sort_keys=True)
    check("篡改确实改了内容", before != after)
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        json.dumps(tampered, ensure_ascii=False, indent=2) + "\n"
    )
    code2, out2 = run_validator(tmp)
    check("篡改后校验器非 0（必须拦住）", code2 != 0, f"exit={code2}")
    check("报错信息指向 hash 与内容不符",
          "meta.hash 与内容不符" in out2, out2.strip().splitlines()[-1][:90] if out2.strip() else "")

    print()
    print("=== 4. 篡改内容但【同步】hash -> 放行（证明这不是空门禁）===")
    synced = copy.deepcopy(tampered)
    synced["meta"]["hash"] = content_hash(synced)
    tmp2 = os.path.join(tmpdir, "balance_rc1_synced.json")
    io.open(tmp2, "w", encoding="utf-8", newline="\n").write(
        json.dumps(synced, ensure_ascii=False, indent=2) + "\n"
    )
    code3, out3 = run_validator(tmp2)
    check("同步 hash 后 exit 0", code3 == 0, f"exit={code3}")

print()
ok = sum(1 for _, v in results if v)
print(f"结果：{ok}/{len(results)} 通过")
for n, v in results:
    if not v:
        print("  FAILED:", n)
sys.exit(0 if ok == len(results) else 1)
