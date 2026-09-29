"""gate_evidence 共享判定（2026-09-24 机械化解锁）。

批准后 gate_evidence 不再硬编：按 Ruleset meta 实况判定——
  status == Frozen 且 hash 已回填 → True（附批准记录）；
  否则维持 False 并保留待批说明。
批准记录：所有者 2026-09-23 批准全包 CR（CR-002/003/004/005 + 经典机制组），
执行记录 tools/cr_batch_apply_20260923.py，hash d8f1d02d8f8815021cff0d8d1c5dc47e28093dcabc2dc43850bab52373513ef9。
"""

APPROVAL_REF = ("正式证据：所有者 2026-09-23 批准全包 CR（CR-002/003/004/005 + 经典机制组）；"
                "执行记录 tools/cr_batch_apply_20260923.py")


def gate_verdict(rs_meta: dict) -> tuple[bool, str]:
    """按规则集 meta 返回 (gate_evidence, gate_note)。"""
    if rs_meta.get("status") == "Frozen" and rs_meta.get("hash"):
        short = str(rs_meta["hash"])[:12]
        return True, f"{APPROVAL_REF}；RC1 Frozen hash {short}…"
    return False, ("候选值未冻结（TBD 或 hash 未回填）——正式证据须所有者批准 CR 后重跑。")
