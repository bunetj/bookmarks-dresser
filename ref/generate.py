#!/usr/bin/env python3
"""
Convert a Firefox bookmarks HTML export into a readable, clickable HTML index.

Usage:
    python bookmarks_to_html.py bookmarks.html [output.html]
"""

import sys
import html
from html.parser import HTMLParser
from datetime import datetime, timezone


class FirefoxBookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []
        self.folder_stack = []
        self._capture = None
        self._capture_attrs = None
        self._capture_text = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs = dict(attrs)
        if tag == "h3":
            self._capture = "h3"
            self._capture_text = []
        elif tag == "a":
            self._capture = "a"
            self._capture_attrs = attrs
            self._capture_text = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "h3" and self._capture == "h3":
            name = "".join(self._capture_text).strip()
            if name:
                self.folder_stack.append(name)
                self.items.append(("folder", list(self.folder_stack)))
            self._capture = None
            self._capture_text = []
        elif tag == "a" and self._capture == "a":
            title = "".join(self._capture_text).strip()
            attrs = self._capture_attrs or {}
            href = attrs.get("href", "").strip()
            add_date = attrs.get("add_date", "").strip()
            tags = attrs.get("tags", "").strip()
            if href:
                self.items.append(("bookmark", {
                    "title": title or href,
                    "href": href,
                    "add_date": add_date,
                    "tags": tags,
                    "folder": list(self.folder_stack),
                }))
            self._capture = None
            self._capture_attrs = None
            self._capture_text = []
        elif tag == "dl":
            if self.folder_stack:
                self.folder_stack.pop()

    def handle_data(self, data):
        if self._capture:
            self._capture_text.append(data)


def fmt_date(raw):
    if not raw:
        return ""
    try:
        return datetime.fromtimestamp(int(raw), tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OverflowError, OSError):
        return ""


def esc(s):
    return html.escape(s, quote=True)


def render(items, out_path):
    groups = []
    current_key = None
    current_list = None
    other_key = ("Other bookmarks",)

    for kind, payload in items:
        if kind == "folder":
            current_key = tuple(payload)
            for key, lst in groups:
                if key == current_key:
                    current_list = lst
                    break
            else:
                current_list = []
                groups.append((current_key, current_list))
        else:
            key = tuple(payload["folder"]) or other_key
            if key != current_key:
                current_key = key
                for k, lst in groups:
                    if k == key:
                        current_list = lst
                        break
                else:
                    current_list = []
                    groups.append((key, current_list))
            current_list.append(payload)

    seen = set()
    deduped = []
    for key, lst in groups:
        if not lst or key in seen:
            continue
        seen.add(key)
        deduped.append((key, lst))

    others = [g for g in deduped if g[0] == other_key]
    dated = [g for g in deduped if g[0] != other_key]
    dated.sort(key=lambda g: tuple(p.lower() for p in g[0]), reverse=True)
    ordered = dated + others

    parts = [
        "<!DOCTYPE html>",
        '<html lang="en"><head><meta charset="utf-8">',
        "<title>Bookmarks Index</title>",
        '<link rel="stylesheet" href="style.css">',
        "</head><body>",
        "<h1>Bookmarks Index</h1>",
        '<div class="ref-search-box">'
        '<span class="icon">\U0001F50D</span>'
        '<input type="text" id="refSearchInput" placeholder="Search bookmarks...">'
        '<span class="clear" id="refClearBtn">\u2715</span>'
        '</div>',
        '<div id="refStats"></div>',
        '<div id="refAllView">',
    ]

    total = 0
    for folder_path, bms in ordered:
        header = " / ".join(folder_path) if folder_path else "Other bookmarks"
        parts.append(f"<h2>{esc(header)}</h2>")
        parts.append("<ol>")
        for bm in bms:
            total += 1
            title = esc(bm["title"])
            href = esc(bm["href"])
            date = fmt_date(bm["add_date"])

            tag_html = ""
            if bm["tags"]:
                raw = [t.strip() for t in bm["tags"].split(",") if t.strip()]
                cleaned = [t.lstrip("#").strip() for t in raw]
                cleaned = [t for t in cleaned if t]
                if cleaned:
                    tag_str = " ".join("#" + esc(t) for t in cleaned)
                    tag_html = f' <span class="tags">[{tag_str}]</span>'

            date_html = (
                f' <span class="accessed">Accessed: {date}</span>' if date else ""
            )

            parts.append(
                f'<li>{title}{tag_html}. '
                f'<a href="{href}">{href}</a>.{date_html}</li>'
            )
        parts.append("</ol>")

    parts.append("</div>")  # close #refAllView
    parts.append(f'<p class="total">Total: {total} bookmarks</p>')
    parts.append('<div id="refSearchResults" style="display:none"></div>')
    parts.append('<script type="module" src="../common/search.js"></script>')
    parts.append('<script type="module" src="search.js"></script>')
    parts.append("</body></html>")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    return total


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    in_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else str(__import__("pathlib").Path(__file__).resolve().parent / "index.html")
    with open(in_path, "r", encoding="utf-8", errors="replace") as f:
        data = f.read()
    parser = FirefoxBookmarkParser()
    parser.feed(data)
    total = render(parser.items, out_path)
    print(f"Wrote {out_path} ({total} bookmarks)")


if __name__ == "__main__":
    main()