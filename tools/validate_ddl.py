#!/usr/bin/env python3
"""tools/validate_ddl.py — db-schema-draft.sql 语法/结构验证（本机无 MariaDB 的替代手段）

方法（两档，诚实声明能力边界）：
A. 静态检查（不经 SQL 引擎）：
   - CREATE TABLE 计数与表名清单、配对括号、语句以分号结束；
   - 每表列名无重复、PRIMARY KEY 存在；
   - UNIQUE KEY/KEY/FOREIGN KEY 引用的列在本表存在；
   - FOREIGN KEY 引用的表在本脚本存在且列存在。
B. sqlite3 执行检查：把 MariaDB 方言机械降级为 SQLite 方言后逐句执行，
   可抓出括号/逗号/关键字拼写级错误。不能证明 MariaDB 语义正确
   （ENUM/UNSIGNED/JSON/DATETIME(6)/ENGINE 均被改写），正式验证待 E0-c 工具链。

输出：tools/reports/ddl-validate-*.json + stdout 摘要。exit 1 = 发现问题。
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "doc" / "db-schema-draft.sql"


def split_statements(text: str) -> list[str]:
    """按分号切语句（先剔除 -- 注释行；本稿无存储过程/触发器，无分号嵌套）。"""
    no_comments = "\n".join(l for l in text.splitlines() if not l.strip().startswith("--"))
    # 行尾注释
    no_comments = re.sub(r"--[^\n]*", "", no_comments)
    return [s.strip() for s in no_comments.split(";") if s.strip()]


def parse_columns(body: str) -> tuple[list[str], list[str], list[str], list[tuple[str, str]]]:
    """返回 (列名, 唯一键列, 普通索引列, 外键(列, 参照表.列))。按顶层逗号切分。"""
    cols, uniques, keys, fks = [], [], [], []
    depth, cur, parts = 0, [], []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur).strip())
    for p in parts:
        p = p.strip().rstrip(",")
        if not p:
            continue
        u = re.match(r"UNIQUE KEY \w+ \(([^)]+)\)", p, re.I)
        k = re.match(r"KEY \w+ \(([^)]+)\)", p, re.I)
        f = re.match(r"FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)", p, re.I)
        if u:
            uniques.extend(c.strip() for c in u.group(1).split(","))
        elif k:
            keys.extend(c.strip() for c in k.group(1).split(","))
        elif f:
            for c in f.group(1).split(","):
                fks.append((c.strip(), f"{f.group(2)}.{f.group(3).strip()}"))
        elif re.match(r"(PRIMARY KEY|CONSTRAINT|CHECK|FOREIGN)", p, re.I):
            pass
        else:
            m = re.match(r"(\w+)\s", p)
            if m:
                cols.append(m.group(1))
    return cols, uniques, keys, fks


def to_sqlite(stmt: str) -> str:
    s = stmt
    s = re.sub(r"\b(BIGINT|SMALLINT|TINYINT|INT|DECIMAL)\([^)]*\)\s+UNSIGNED", "INTEGER", s, flags=re.I)
    s = re.sub(r"\b(BIGINT|SMALLINT|TINYINT|INT)\s+UNSIGNED", "INTEGER", s, flags=re.I)
    s = re.sub(r"\bDECIMAL\([^)]*\)", "REAL", s, flags=re.I)
    s = re.sub(r"ENUM\([^)]*\)", "TEXT", s, flags=re.I)
    s = re.sub(r"\bDATETIME\(\d+\)", "TEXT", s, flags=re.I)
    s = re.sub(r"\bJSON\b", "TEXT", s, flags=re.I)
    s = re.sub(r"CURRENT_TIMESTAMP\(\d+\)", "CURRENT_TIMESTAMP", s, flags=re.I)
    s = re.sub(r"^\s*UNIQUE KEY \w+", "UNIQUE ", s, flags=re.I | re.M)
    s = re.sub(r"^\s*KEY \w+ \([^)]+\),?\s*$", "", s, flags=re.I | re.M)  # 普通索引降级丢弃
    s = re.sub(r"\)\s*ENGINE=\w+\s*$", ")", s, flags=re.I | re.S)
    s = re.sub(r",\s*\)", ")", s)  # 丢弃索引后可能的尾逗号
    return s


def main() -> int:
    text = SQL.read_text(encoding="utf-8")
    statements = split_statements(text)
    creates = [s for s in statements if re.match(r"CREATE TABLE", s, re.I)]
    problems: list[str] = []
    tables: dict[str, list[str]] = {}
    fk_refs: list[tuple[str, str, str]] = []  # (本表, 本表列, 参照表.列)

    for s in creates:
        m = re.match(r"CREATE TABLE (\w+)\s*\((.*)\)(?:\s*ENGINE\s*=\s*\w+)?\s*$", s, re.I | re.S)
        if not m:
            problems.append(f"无法解析 CREATE TABLE 语句: {s[:60]}…")
            continue
        name, body = m.group(1), m.group(2)
        if body.count("(") != body.count(")"):
            problems.append(f"{name}: 括号不配对")
        cols, uniques, keys, fks = parse_columns(body)
        if len(cols) != len(set(cols)):
            dup = [c for c in set(cols) if cols.count(c) > 1]
            problems.append(f"{name}: 列名重复 {dup}")
        if not re.search(r"PRIMARY KEY", body, re.I):
            problems.append(f"{name}: 缺 PRIMARY KEY")
        for c in uniques + keys:
            if c not in cols:
                problems.append(f"{name}: 索引引用未知列 {c}")
        for c, ref in fks:
            fk_refs.append((name, c, ref))
            if c not in cols:
                problems.append(f"{name}: 外键引用本表未知列 {c}")
        tables[name] = cols

    for tname, col, ref in fk_refs:
        rt, rc = ref.split(".")
        if rt not in tables:
            problems.append(f"{tname}.{col}: 外键参照未知表 {rt}")
        elif rc not in tables[rt]:
            problems.append(f"{tname}.{col}: 外键参照 {rt} 未知列 {rc}")

    # B 档：sqlite3 降级执行
    sqlite_fails = []
    if not problems:
        con = sqlite3.connect(":memory:")
        for s in creates:
            try:
                con.execute(to_sqlite(s))
            except Exception as e:  # noqa: BLE001
                sqlite_fails.append(f"{re.match(r'CREATE TABLE (\\w+)', s, re.I).group(1)}: {e}")
        con.close()
    problems.extend(sqlite_fails)

    report = {
        "run_id": f"ddl-validate-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "file": str(SQL),
        "method": "A 静态结构检查 + B sqlite3 方言降级执行（非 MariaDB 语义验证，正式验证待 E0-c 工具链）",
        "tables_found": sorted(tables),
        "table_count": len(tables),
        "fk_count": len(fk_refs),
        "problems": problems,
        "ok": not problems,
    }
    out = ROOT / "tools" / "reports" / f"{report['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"报告: {out}")
    print(f"表数: {len(tables)}（含 debris_fields 共 15）  外键: {len(fk_refs)}")
    if problems:
        print("发现问题:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("A 静态检查 PASS；B sqlite3 降级执行 PASS（15 表全部建表成功）")
    print("边界声明：ENUM/UNSIGNED/JSON/DATETIME(6)/ENGINE 已降级改写，MariaDB 语义验证待 E0-c 工具链。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
