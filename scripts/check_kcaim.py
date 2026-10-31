#!/usr/bin/env python3
"""kcaim-geo integrity check.

Verifies that every Markdown file is UTF-8 without NUL bytes, that level-1
virtual-path headings (`# /...`) are unique within each file and across the
repository, and that no non-Markdown document formats (docx, xlsx, pdf, ...)
are tracked as canonical data. Exit status is non-zero on any problem.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_EXT = {".docx", ".xlsx", ".pptx", ".pdf", ".db", ".sqlite"}
HEADING = re.compile(r"^# (/\S*)\s*$")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")


def files():
    try:
        out = subprocess.run(
            ["git", "ls-files", "-co", "--exclude-standard"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.split("\n")
        return [ROOT / p for p in out if p]
    except (OSError, subprocess.CalledProcessError):
        return [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts]


def virtual_paths(text):
    """Yield (line_no, path) for level-1 `# /...` headings outside code fences."""
    fence = None
    for n, line in enumerate(text.splitlines(), 1):
        m = FENCE.match(line)
        if m:
            marker = m.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None and (h := HEADING.match(line)):
            yield n, h.group(1)


def main():
    errors = []
    seen = {}
    for path in files():
        rel = path.relative_to(ROOT)
        if not path.exists():
            continue
        if path.suffix.lower() in FORBIDDEN_EXT:
            errors.append(f"{rel}: non-Markdown document format is not canonical")
            continue
        if path.suffix.lower() != ".md":
            continue
        data = path.read_bytes()
        if b"\0" in data:
            errors.append(f"{rel}: binary content (NUL byte)")
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as e:
            errors.append(f"{rel}: not valid UTF-8 ({e})")
            continue
        for n, vp in virtual_paths(text):
            if vp in seen:
                errors.append(f"{rel}:{n}: duplicate virtual path {vp} (first at {seen[vp]})")
            else:
                seen[vp] = f"{rel}:{n}"

    for e in errors:
        print("ERROR", e, file=sys.stderr)
    print(f"checked: {len(seen)} virtual path(s), {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
