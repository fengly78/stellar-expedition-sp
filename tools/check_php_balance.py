"""PHP 文件括号配平静态自检（本机无 php -l 的降级检查）。

用法：python tools/check_php_balance.py <目录或文件> [...]
剔除字符串/注释后检查 () [] {} 配平；任一文件不配平则退出码 1。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PAIRS = {"(": ")", "[": "]", "{": "}"}

STR_SQ = re.compile(r"'([^'\\]|\\.)*'", re.S)
STR_DQ = re.compile(r'"([^"\\]|\\.)*"', re.S)
HEREDOC = re.compile(r"<<<['\"]?(\w+)['\"]?\n.*?\n\1;", re.S)
COMMENT_LINE = re.compile(r"//[^\n]*|#[^\n]*")
COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)


def strip_noise(text: str) -> str:
    text = HEREDOC.sub("", text)
    text = COMMENT_BLOCK.sub("", text)
    text = STR_SQ.sub("''", text)
    text = STR_DQ.sub('""', text)
    text = COMMENT_LINE.sub("", text)
    return text


def check(path: Path) -> list[str]:
    errors: list[str] = []
    stack: list[tuple[str, int]] = []
    clean = strip_noise(path.read_text(encoding="utf-8-sig"))
    line = 1
    for ch in clean:
        if ch == "\n":
            line += 1
        elif ch in PAIRS:
            stack.append((ch, line))
        elif ch in PAIRS.values():
            if not stack or PAIRS[stack[-1][0]] != ch:
                errors.append(f"{path}: 行{line} 多余闭合 {ch}")
                break
            stack.pop()
    else:
        for ch, ln in stack:
            errors.append(f"{path}: 行{ln} 未闭合 {ch}")
    return errors


def main(argv: list[str]) -> int:
    files: list[Path] = []
    # 2026-09-29：除 vendor 外，再排除 storage/。
    # 起因：跑过一轮 artisan 之后，`game-server/storage/framework/views/` 下出现
    # 49 个 **Laravel 编译后的 Blade 视图缓存**（含压缩 CSS 里的 `{`），本闸扫到后
    # 报「行10 未闭合 {」——那是**生成物**，不是手写代码，误报。
    #
    # 这不只是误报风险，更是**双向风险**：闸扫生成物时，
    # 生成物碰巧配平就会给出一道**永远绿的假门禁**——与本项目已记录的
    # 「全库求和相等 ≠ 逐主体相符」同一形态。闸的扫描范围必须限定在手写源码。
    EXCLUDED_DIRS = ("vendor", "storage")
    for arg in argv[1:]:
        p = Path(arg)
        if p.is_dir():
            # vendor/ 是 composer 第三方代码（约 2000 文件，含非 UTF-8 编码的库），
            # storage/ 是运行时生成物（视图缓存 / 日志 / 编译产物）。
            # 本闸只管自有手写工程文件。
            candidates = list(p.rglob("*.php")) + [p / "artisan"]
            files.extend(
                f for f in sorted(candidates)
                if f.is_file() and not any(d in f.parts for d in EXCLUDED_DIRS)
            )
        else:
            files.append(p)
    all_errors: list[str] = []
    for f in files:
        all_errors.extend(check(f))
    if all_errors:
        print("\n".join(all_errors))
        return 1
    print(f"OK：{len(files)} 个文件括号配平全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
