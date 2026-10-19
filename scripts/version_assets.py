#!/usr/bin/env python3
"""Keep local stylesheet and script URLs tied to their file contents."""

import argparse
import hashlib
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

ATTRIBUTE = re.compile(r'''([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?''')


def version_page(page, root):
    root = Path(root).resolve()
    # HTMLParser counts LF characters, not every Unicode line separator.
    offsets = [0, *(match.end() for match in re.finditer("\n", page))]
    replacements = []

    class Assets(HTMLParser):
        def handle_starttag(self, tag, attrs):
            names = [name for name, _ in attrs]
            attrs = dict(attrs)
            if tag == "script":
                attribute = "src"
            elif tag == "link" and "stylesheet" in (attrs.get("rel") or "").lower().split():
                attribute = "href"
            else:
                return
            if names.count(attribute) > 1:
                raise ValueError(f"Duplicate asset URL attribute: {attribute}")
            raw_url = attrs.get(attribute)
            if not raw_url:
                return
            url = urlsplit(raw_url)
            if url.scheme or url.netloc or Path(url.path).suffix not in {".css", ".js"}:
                return
            asset = (root / unquote(url.path).lstrip("/")).resolve()
            if not asset.is_relative_to(root):
                raise ValueError(f"Asset path leaves the page directory: {url.path}")
            if not asset.is_file():
                raise ValueError(f"Missing local asset: {url.path}")
            version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
            query = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key != "v"]
            query.append(("v", version))
            updated_url = urlunsplit(("", "", url.path, urlencode(query), url.fragment))
            raw_tag = self.get_starttag_text()
            # Consume complete attributes so src= inside another value is skipped.
            match = next((item for item in ATTRIBUTE.finditer(raw_tag, 1 + len(tag)) if item.group(1).lower() == attribute), None)
            group = 2 if match and match.group(2) is not None else 3
            if not match or match.group(group) is None:
                raise ValueError(f"Quote the local asset URL: {url.path}")
            line, column = self.getpos()
            start = offsets[line - 1] + column
            replacements.append((start + match.start(group), start + match.end(group), html.escape(updated_url, quote=True)))

    parser = Assets()
    parser.feed(page)
    parser.close()
    if not replacements:
        raise ValueError("No local CSS or JavaScript references found")
    updated = page
    for start, end, value in reversed(replacements):
        updated = updated[:start] + value + updated[end:]
    return updated, len(replacements)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--page", type=Path, default=Path(__file__).resolve().parents[1] / "index.html")
    parser.add_argument("--check", action="store_true", help="Fail on stale versions without writing files")
    args = parser.parse_args(argv)
    try:
        page = args.page.read_text(encoding="utf-8")
        updated, count = version_page(page, args.page.parent)
        if args.check and updated != page:
            print("Asset versions are stale. Run python3 scripts/version_assets.py.", file=sys.stderr)
            return 1
        if not args.check and updated != page:
            args.page.write_text(updated, encoding="utf-8")
        print(f"{'Checked' if args.check else 'Synchronized'} {count} local CSS/JavaScript references.")
        return 0
    except (OSError, ValueError) as error:
        print(f"Asset version check failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
