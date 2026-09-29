# -*- coding: utf-8 -*-
"""
从上游 ogamex 浅克隆提取舰船建造需求与科研价格（一次性取数脚本）。

用途：web 线 CR/调参时需要上游原始数值作对照，从 MilitaryShipObjects.php
（舰船 requirements）与 ResearchObjects.php（科研 price）直接抽取，
避免手抄。

数据源：`upstream-ogamex/` 是本机浅克隆（tag 0.14.0），已被 .gitignore 排除，
因此路径按仓库根相对解析，且克隆缺失时直接提示而不抛栈。
出处与 SHA 见 doc/governance/SOURCE-01-ogamex-audit-draft.md。

用法（在仓库根或任意目录均可）：
    python tools/ship_research_scan.py
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "upstream-ogamex" / "app" / "GameObjects"

SHIP_FILE = UPSTREAM / "MilitaryShipObjects.php"
RESEARCH_FILE = UPSTREAM / "ResearchObjects.php"


def read(path: Path) -> str:
    if not path.exists():
        sys.exit(
            "缺少上游参照文件：%s\n"
            "请先按 doc/dev-env-setup.md 克隆 upstream-ogamex（tag 0.14.0）。" % path
        )
    return io.open(str(path), encoding="utf-8").read()


def scan_ships() -> None:
    text = read(SHIP_FILE)
    sections = re.findall(r"// --- (.+?) ---.*?\$(\w+)->id = (\d+);", text, re.S)
    blocks = re.findall(r"\$(\w+)->requirements = \[([^\]]+)\]", text)
    reqmap = {var: re.sub(r"\s+", " ", body).strip() for var, body in blocks}
    for name, var, sid in sections:
        print(sid, name, "=>", reqmap.get(var, "?"))


def scan_research() -> None:
    text = read(RESEARCH_FILE)
    sections = re.findall(
        r"// --- (.+?) ---.*?\$(\w+)->machine_name = .(\w+).;", text, re.S
    )
    blocks = re.findall(r"\$(\w+)->price = new GameObjectPrice\(([\d, ]+)\);", text)
    pricemap = {var: body for var, body in blocks}
    for name, var, machine_name in sections:
        print(var, name, "[%s]" % machine_name, "=>", pricemap.get(var, "?"))


if __name__ == "__main__":
    scan_ships()
    print("---RESEARCH---")
    scan_research()
