#!/usr/bin/env python3
"""Import a Chrome bookmark snapshot into the public, static homepage."""

import argparse
import hashlib
import html
import ipaddress
import json
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

EXCLUDED = {"雪球", "京东", "字节"}
START = "<!-- BOOKMARKS:START -->"
END = "<!-- BOOKMARKS:END -->"
SENSITIVE = re.compile(r"(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|session|ticket|authorization|credential)", re.I)
INTERNAL_SUFFIXES = ("localhost", "local", "internal", "corp", "lan", "byted.org", "bytedance.net")


def count_links(node):
    if node.get("type") == "url":
        return 1
    return sum(count_links(child) for child in node.get("children", []))


def public_url(raw):
    """Return (public URL, removed query keys, reason). Never return credentials."""
    if not isinstance(raw, str) or re.search(r"[\x00-\x20\x7f\\]|%(?![0-9a-fA-F]{2})", raw):
        return None, [], "invalid_url"
    try:
        url = urlsplit(raw)
        host = (url.hostname or "").lower().rstrip(".")
        url.port  # Validate malformed ports without contacting the target.
    except ValueError:
        return None, [], "invalid_url"
    if url.scheme not in {"http", "https"} or not host:
        return None, [], "unsupported_scheme"
    if url.username is not None or url.password is not None:
        return None, [], "credentials"
    try:
        ipaddress.ip_address(host)
        return None, [], "ip_address"
    except ValueError:
        pass
    try:
        dns_host = host.encode("idna").decode("ascii")
    except UnicodeError:
        return None, [], "invalid_url"
    # A numeric final label also catches browser IPv4 aliases such as 0x7f.1.
    if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}", dns_host) or any(host == suffix or host.endswith("." + suffix) for suffix in INTERNAL_SUFFIXES):
        return None, [], "local_or_internal"
    if host == "opts.console.perfma.com" and url.path.startswith("/result/"):
        return None, [], "personal_analysis"
    try:
        pairs = parse_qsl(url.query, keep_blank_values=True, errors="strict")
        fragment_pairs = parse_qsl(url.fragment, keep_blank_values=True, errors="strict")
    except UnicodeDecodeError:
        return None, [], "invalid_url"
    removed = []
    kept = []
    for key, value in pairs:
        # These known article/translation fields are not needed to open the page.
        removable = (key == "poc_token" and host == "mp.weixin.qq.com" and url.path.startswith("/s")) or (key == "nsukey" and host == "raft.github.io" and url.path == "/") or (key == "text" and host == "translate.volcengine.com" and url.path == "/")
        if removable:
            removed.append(key)
        elif SENSITIVE.search(key) or key.lower() == "nsukey":
            return None, [], "sensitive_query"
        else:
            kept.append((key, value))
    if any(SENSITIVE.search(key) for key, _ in fragment_pairs):
        return None, [], "sensitive_fragment"
    # Preserve original encoding/order when nothing needs removal.
    clean = urlunsplit((url.scheme, url.netloc, url.path, urlencode(kept), url.fragment)) if removed else raw
    return clean, removed, None


def import_tree(source, github_status=None):
    report = {"source_total": 0, "excluded": 0, "published": 0, "held": [], "sanitized": []}
    github_status = {key.lower(): value for key, value in (github_status or {}).items()}

    def visit(node, path):
        name = str(node.get("name", ""))
        if node.get("type") == "folder":
            if name in EXCLUDED:
                report["excluded"] += count_links(node)
                return None
            children = [result for child in node.get("children", []) if (result := visit(child, path + [name])) is not None]
            return {"type": "folder", "name": name, "children": children} if children else None
        if node.get("type") != "url":
            return None
        url, removed, reason = public_url(node.get("url"))
        if url:
            parsed = urlsplit(url)
            parts = [part for part in parsed.path.split("/") if part]
            if parsed.hostname == "github.com" and len(parts) >= 2 and parts[0] not in {"topics", "features", "marketplace", "search"}:
                target = "/".join(parts[:2]).lower().removesuffix(".git")
                if github_status.get(target) != "public":
                    reason = "github_visibility_unverified"
        if reason:
            # Private report records enough to find the source entry, but no URL.
            report["held"].append({"folder": path, "name": name, "reason": reason})
            return None
        if removed:
            report["sanitized"].append({"folder": path, "name": name, "removed_keys": removed})
        report["published"] += 1
        return {"type": "url", "name": name, "url": url}

    folders = []
    for root_key, root in source.get("roots", {}).items():
        if not isinstance(root, dict):
            continue
        report["source_total"] += count_links(root)
        is_bar = root_key == "bookmark_bar" or root.get("name") == "Bookmarks Bar"
        if is_bar:
            # Do not publish loose shortcuts as a separate bookmark-bar group.
            children = root.get("children", [])
            report["excluded"] += sum(count_links(child) for child in children if child.get("type") == "url")
            root = {**root, "children": [child for child in children if child.get("type") != "url"]}
        result = visit(root, [])
        if result:
            if is_bar:
                folders.extend(result["children"])
            else:
                folders.append(result)
    assert report["source_total"] == report["excluded"] + report["published"] + len(report["held"])
    return {"folders": folders}, report


def render_catalog(catalog):
    serial = 0

    def render(node, path):
        nonlocal serial
        name = html.escape(node["name"], quote=True)
        if node["type"] == "url":
            url = html.escape(node["url"], quote=True)
            domain = html.escape(urlsplit(node["url"]).hostname or "", quote=True)
            folder = html.escape(" / ".join(path), quote=True)
            return f'<li class="bookmark-item" data-folder="{folder}"><a href="{url}" target="_blank" rel="noopener noreferrer"><span class="bookmark-name">{name}</span><span class="bookmark-domain">{domain} ↗</span></a></li>'
        serial += 1
        ident = f"bookmark-folder-{serial}"
        children = "\n".join(render(child, path + [node["name"]]) for child in node["children"])
        count = count_links(node)
        return f'<li class="bookmark-group"><details class="bookmark-folder" id="{ident}"><summary><span>{name}</span><span class="bookmark-count">{count}</span></summary><ul>{children}</ul></details></li>'

    return "\n".join(render(folder, []) for folder in catalog["folders"])


def update_page(page, catalog):
    if page.count(START) != 1 or page.count(END) != 1:
        raise ValueError("Homepage must have exactly one bookmark marker pair")
    before, remainder = page.split(START)
    _, after = remainder.split(END)
    result = before + START + "\n" + render_catalog(catalog) + "\n" + END + after
    total = sum(count_links(folder) for folder in catalog["folders"])
    updated, count = re.subn(r'(<span id="bookmark-total">)\d+(</span>)', rf"\g<1>{total}\g<2>", result)
    if count != 1:
        raise ValueError("Homepage must have exactly one bookmark total")
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--page", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True, help="Local report path outside the public repository")
    parser.add_argument("--github-proof", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    if args.report.resolve().is_relative_to(repo):
        parser.error("Keep the private import report outside the public repository")
    if args.source.resolve() in {args.catalog.resolve(), args.page.resolve(), args.report.resolve()}:
        parser.error("Never overwrite the Chrome bookmark source")
    raw = args.source.read_bytes()
    proof = json.loads(args.github_proof.read_text())
    statuses = {row["requested"]: row["status"] for row in proof}
    catalog, report = import_tree(json.loads(raw), statuses)
    page = update_page(args.page.read_text(), catalog)
    report["source_sha256"] = hashlib.sha256(raw).hexdigest()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.catalog.parent.mkdir(parents=True, exist_ok=True)
    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    args.page.write_text(page)
    print(json.dumps({key: report[key] for key in ("source_total", "excluded", "published")} | {"held": len(report["held"]), "sanitized": len(report["sanitized"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
