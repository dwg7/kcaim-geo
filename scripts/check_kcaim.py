#!/usr/bin/env python3
"""kcaim-geo integrity check.

Verifies that every Markdown file is UTF-8 without NUL bytes, that level-1
virtual-path headings (`# /...`) are unique across the repository and carry one of
the five statuses, that geometry follows the convention (at most one `## geometry`
per `#`, never `### geometry`, a single json block holding a valid GeoJSON
Geometry), and that no non-Markdown document formats (docx, xlsx, pdf, ...) are
tracked as canonical data. Exit status is non-zero on any problem.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_EXT = {".docx", ".xlsx", ".pptx", ".pdf", ".db", ".sqlite"}
STATUSES = {"verified", "derived", "normative", "open", "volatile"}
GEOMETRY_TYPES = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon",
                  "MultiPolygon", "GeometryCollection"}
HEADING = re.compile(r"^# (/\S*)\s*$")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})(\w*)")


def files():
    try:
        out = subprocess.run(
            ["git", "ls-files", "-co", "--exclude-standard"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.split("\n")
        return [ROOT / p for p in out if p]
    except (OSError, subprocess.CalledProcessError):
        return [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts]


def scan(text):
    """Yield (line_no, line, fence_info) where fence_info is None outside code
    fences and the opening info string (e.g. 'json') inside them. Fence markers
    themselves are yielded with their own info."""
    fence = None
    for n, line in enumerate(text.splitlines(), 1):
        m = FENCE.match(line)
        if m:
            marker, info = m.groups()
            if fence is None:
                fence = (marker, info)
                yield n, line, info or ""
            elif marker[0] == fence[0][0] and len(marker) >= len(fence[0]):
                yield n, line, fence[1] or ""
                fence = None
            else:
                yield n, line, fence[1] or ""
            continue
        yield n, line, (fence[1] or "") if fence else None


def coords_ok(c):
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        return True
    return isinstance(c, list) and bool(c) and all(coords_ok(x) for x in c)


def positions(c):
    if c and isinstance(c[0], (int, float)):
        yield c
    else:
        for x in c:
            yield from positions(x)


def geometry_errors(g):
    if not isinstance(g, dict) or g.get("type") not in GEOMETRY_TYPES:
        return ["not a GeoJSON Geometry (type must be one of %s)" % ", ".join(sorted(GEOMETRY_TYPES))]
    if g["type"] == "GeometryCollection":
        errs = []
        for sub in g.get("geometries", []):
            errs += geometry_errors(sub)
        return errs
    c = g.get("coordinates")
    if not coords_ok(c):
        return ["coordinates are missing or not numeric"]
    for pos in positions(c):
        if len(pos) < 2 or not (-180 <= pos[0] <= 180 and -90 <= pos[1] <= 90):
            return [f"position {pos} is not [lon, lat] in range"]
    return []


def check_file(rel, text, seen, errors):
    chapter = None            # (line_no, path, status_seen)
    geoms = 0                 # `## geometry` count in the current chapter
    state = None              # None | 'wait' | 'collect'
    buf = []

    def close_chapter():
        if chapter and not chapter["status"]:
            errors.append(f"{rel}:{chapter['line']}: {chapter['path']} has no valid `- status:` "
                          f"(one of {', '.join(sorted(STATUSES))})")

    for n, line, fence in scan(text):
        if fence is None:
            if state == "wait" and re.match(r"^#{1,6} ", line):
                errors.append(f"{rel}:{n}: `## geometry` is not followed by a json block")
                state = None
            if (h := HEADING.match(line)):
                close_chapter()
                vp = h.group(1)
                if vp in seen:
                    errors.append(f"{rel}:{n}: duplicate virtual path {vp} (first at {seen[vp]})")
                else:
                    seen[vp] = f"{rel}:{n}"
                chapter = {"line": n, "path": vp, "status": False}
                geoms = 0
            elif re.match(r"^### geometry\s*$", line, re.I):
                errors.append(f"{rel}:{n}: `### geometry` is not allowed; use one `## geometry` per `#`")
            elif re.match(r"^## geometry\s*$", line, re.I):
                geoms += 1
                if geoms > 1:
                    errors.append(f"{rel}:{n}: more than one `## geometry` in {chapter and chapter['path']}")
                if chapter is None:
                    errors.append(f"{rel}:{n}: `## geometry` outside any `# /...` chapter")
                state = "wait"
            elif chapter and (m := re.match(r"^- status:\s*(\w+)\s*$", line)) and not chapter["status"]:
                if m.group(1) in STATUSES:
                    chapter["status"] = True
                else:
                    errors.append(f"{rel}:{n}: unknown status '{m.group(1)}'")
                    chapter["status"] = True
            continue
        # inside a code fence
        if state == "wait" and fence == "json" and FENCE.match(line):
            state, buf = "collect", []
        elif state == "collect":
            if FENCE.match(line):
                try:
                    for e in geometry_errors(json.loads("\n".join(buf))):
                        errors.append(f"{rel}:{n}: geometry {e}")
                except json.JSONDecodeError as e:
                    errors.append(f"{rel}:{n}: geometry is not valid JSON ({e})")
                state = None
            else:
                buf.append(line)
    if state == "wait":
        errors.append(f"{rel}: `## geometry` is not followed by a json block")
    close_chapter()


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
        check_file(rel, text, seen, errors)

    for e in errors:
        print("ERROR", e, file=sys.stderr)
    print(f"checked: {len(seen)} virtual path(s), {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
