#!/usr/bin/env python3
"""Refresh a bounded snapshot from public, original AI sources."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import gzip
from html.parser import HTMLParser
import io
import ipaddress
import json
import math
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zlib

LIMIT = 6 * 1024 * 1024
ARENA = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
BOARDS = [
    ("text", "文本偏好", "text_style_control"),
    ("webdev", "网页开发", "webdev"),
    ("vision", "视觉理解", "vision_style_control"),
]
FEEDS = [
    ("openai", "OpenAI", "news", "https://openai.com/news/rss.xml"),
    ("google", "Google AI", "news", "https://blog.google/innovation-and-ai/technology/ai/rss/"),
    ("deepmind", "Google DeepMind", "news", "https://deepmind.google/blog/rss.xml"),
    ("codex", "Codex", "tools", "https://github.com/openai/codex/releases.atom"),
    ("kimi", "Kimi Code", "tools", "https://github.com/MoonshotAI/kimi-code/releases.atom"),
    ("claude", "Claude Code", "tools", "https://github.com/anthropics/claude-code/releases.atom"),
]
TIBO = "https://x.com/thsottiaux"
BENCHMARK_FILE = Path(__file__).resolve().parents[1] / "data/benchmark.json"


def benchmark_entry(payload, selected):
    metrics, identity = payload["metrics"], payload["source_filter"]
    metadata = payload["metadata"]
    score, count, total, successes = (number(metrics[key]) for key in ["accuracy", "n_trials", "total_cost_usd", "successes"])
    if count <= 0 or count != int(count) or total <= 0 or not 0 <= score <= 100 or not 0 <= successes <= count or successes != int(successes) or abs(score - 100 * successes / count) > .011:
        raise ValueError("Invalid benchmark trial metrics")
    if identity["model_name"] != selected["source_model_id"] or identity["agent_version"] != selected["agent_version"] or metadata["agent_display"]["label"] != selected["harness"] or metadata["reasoning_effort"] != selected["effort"]:
        raise ValueError("Benchmark configuration changed")
    return {**selected, "source_url": selected["source_main_url"], "score": score, "n_trials": int(count), "total_cost_usd": total, "cost_usd": total / count}


def benchmark_entries(read):
    selected = json.loads(BENCHMARK_FILE.read_text())
    definition = read("https://raw.githubusercontent.com/harbor-framework/terminal-bench/main/leaderboard/leaderboard.yaml").decode("utf-8")
    if not re.search(r"dataset_version_refs:\s*\n- ['\"]?4['\"]?\s*\n", definition):
        raise ValueError("Benchmark dataset version changed")

    def load(point):
        url = point["source_main_url"]
        if not url.startswith("https://raw.githubusercontent.com/harbor-framework/terminal-bench/main/leaderboard/submissions/"):
            raise ValueError("Unexpected benchmark source")
        return benchmark_entry(json.loads(read(url)), point)

    with ThreadPoolExecutor(max_workers=4) as pool:
        entries = list(pool.map(load, selected["entries"]))
    return {**selected, "entries": entries}


def public_url(value):
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not host or parts.username is not None or parts.password is not None:
        raise ValueError("Expected a public HTTPS URL")
    if host == "localhost" or host.endswith((".local", ".internal")):
        raise ValueError("Local URLs are not published")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return value
    raise ValueError("Literal IP URLs are not published")


def fetch(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": "singgel-ai-hub/1.0 (+https://singgel.github.io/ai.html)",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError("Source exceeds size limit")
        if response.headers.get("Content-Encoding") == "gzip":
            with gzip.GzipFile(fileobj=io.BytesIO(data)) as compressed:
                data = compressed.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError("Expanded source exceeds size limit")
        return data


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Invalid numeric result")
    return value


def arena_entries(payload):
    rows = [item["row"] for item in payload["rows"] if item["row"]["category"] == "overall"]
    dates = {row["leaderboard_publish_date"] for row in rows}
    if len(dates) != 1:
        raise ValueError("Mixed or missing leaderboard dates")
    published = dates.pop()
    datetime.strptime(published, "%Y-%m-%d")
    entries = []
    for row in rows:
        rank = number(row["rank"])
        if rank < 1 or rank > 20:
            continue
        if int(rank) != rank or not isinstance(row["model_name"], str) or not row["model_name"].strip():
            raise ValueError("Invalid model or rank")
        low, score, high = (number(row[key]) for key in ["rating_lower", "rating", "rating_upper"])
        votes = number(row["vote_count"])
        if not low <= score <= high or votes < 0:
            raise ValueError("Invalid interval or vote count")
        entries.append({"rank": int(rank), "model": row["model_name"][:180],
                        "organization": str(row["organization"])[:80], "score": round(score, 1),
                        "lower": round(low, 1), "upper": round(high, 1), "votes": int(votes)})
    if len(entries) != 20 or {row["rank"] for row in entries} != set(range(1, 21)):
        raise ValueError("First page does not cover ranks 1–20")
    return {"published_at": published, "entries": sorted(entries, key=lambda row: row["rank"])}


def iso_date(value):
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        date = parsedate_to_datetime(value)
    if date.tzinfo is None:
        raise ValueError("Source date needs a timezone")
    return date.astimezone(timezone.utc).isoformat()


def feed_entries(data, identity):
    root = ET.fromstring(data)
    atom = "{http://www.w3.org/2005/Atom}"
    entries = root.findall("./channel/item") or root.findall(f"{atom}entry")
    items = []
    for entry in entries:
        title = entry.findtext("title") or entry.findtext(f"{atom}title") or ""
        date = entry.findtext("pubDate") or entry.findtext(f"{atom}published") or entry.findtext(f"{atom}updated")
        link = entry.findtext("link")
        if not link:
            links = entry.findall(f"{atom}link")
            link = next((item.get("href") for item in links if item.get("rel", "alternate") == "alternate"), None)
        if not title.strip() or not date or not link:
            continue
        try:
            items.append({"title": title.strip()[:240], "url": public_url(link), "published_at": iso_date(date),
                          "source": identity["name"], "source_id": identity["id"], "kind": identity["kind"]})
        except (ValueError, TypeError, OverflowError):
            continue
    if not items:
        raise ValueError("No dated feed items")
    return {"items": sorted(items, key=lambda item: item["published_at"], reverse=True)[:8]}


def reset_entries(data):
    class Scripts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.active = False
            self.parts = []
            self.scripts = []

        def handle_starttag(self, tag, attrs):
            if tag == "script":
                self.active, self.parts = True, []

        def handle_data(self, value):
            if self.active:
                self.parts.append(value)

        def handle_endtag(self, tag):
            if tag == "script" and self.active:
                self.scripts.append("".join(self.parts))
                self.active = False

    parser = Scripts()
    parser.feed(data.decode("utf-8"))
    tweets = {}
    decoder = json.JSONDecoder()
    for script in parser.scripts:
        if "GraphQLRequestStream.Completed" not in script or "tweet_results" not in script:
            continue
        for match in re.finditer(r"\bvalue\s*:\s*", script):
            try:
                payload, _ = decoder.raw_decode(script, match.end())
                for _ in range(3):
                    if not isinstance(payload, str):
                        break
                    payload = json.loads(payload)
                instructions = payload["data"]["user_result_by_screen_name"]["result"]["profile_user_originals_timeline"]["timeline"]["instructions"]
            except (ValueError, KeyError, TypeError):
                continue
            for instruction in instructions:
                for entry in instruction.get("entries", []):
                    try:
                        tweet = entry["content"]["content"]["tweet_results"]["result"]
                        author = tweet["core"]["user_results"]["result"]["core"]["screen_name"]
                        identifier = tweet["rest_id"]
                        timestamp = number(tweet["details"]["created_at_ms"])
                        text = tweet["details"]["full_text"]
                        if author.lower() != "thsottiaux" or not re.fullmatch(r"\d{10,25}", identifier):
                            continue
                        date = datetime.fromtimestamp(timestamp / 1000, timezone.utc).isoformat()
                        tweets[identifier] = {"text": text, "published_at": date, "url": TIBO + "/status/" + identifier}
                    except (ValueError, KeyError, TypeError, OverflowError):
                        continue
    if not tweets:
        raise ValueError("Public timeline structure unavailable")
    candidates = []
    for tweet in sorted(tweets.values(), key=lambda item: item["published_at"], reverse=True):
        if re.search(r"\breset(?:s|ting)?\b", tweet["text"], re.I):
            candidates.append({"url": tweet["url"], "published_at": tweet["published_at"],
                               "title": "Tibo 提到重置，适用范围待原帖核实", "state": "unconfirmed"})
    return {"status": "partial", "observed_posts": len(tweets), "entries": candidates[:5],
            "coverage": "仅检查公开页面返回的近期原帖；不是完整时间线。关键词命中不代表额度已到账。"}


def refresh_part(identity, previous, loader, now):
    try:
        return {**identity, **loader(), "checked_at": now, "last_success_at": now,
                "status": "partial" if identity["id"] == "resets" else "ok"}
    except (OSError, ValueError, KeyError, TypeError, AttributeError, EOFError, zlib.error, ET.ParseError, OverflowError) as error:
        retained = {key: value for key, value in previous.items() if key not in {"error", "status"}}
        return {**retained, **identity, "checked_at": now,
                "status": "stale" if previous.get("last_success_at") else "unavailable",
                "error": type(error).__name__}


def build_snapshot(previous, now, read=fetch):
    old = {item["id"]: item for item in previous.get("boards", []) + previous.get("feeds", [])}
    old["resets"] = previous.get("resets", {})
    old["benchmark"] = previous.get("benchmark") or json.loads(BENCHMARK_FILE.read_text())
    jobs = []
    for identifier, name, config in BOARDS:
        url = "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=" + config + "&split=latest&offset=0&length=100"
        identity = {"id": identifier, "name": name, "source_url": ARENA, "data_url": url,
                    "license_url": "https://creativecommons.org/licenses/by/4.0/"}
        jobs.append((identity, lambda url=url: arena_entries(json.loads(read(url)))))
    for identifier, name, kind, url in FEEDS:
        identity = {"id": identifier, "name": name, "kind": kind, "source_url": url}
        jobs.append((identity, lambda identity=identity, url=url: feed_entries(read(url), identity)))
    jobs.append(({"id": "resets", "source_url": TIBO}, lambda: reset_entries(read(TIBO))))
    jobs.append(({"id": "benchmark"}, lambda: benchmark_entries(read)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        parts = list(pool.map(lambda job: refresh_part(job[0], old.get(job[0]["id"], {}), job[1], now), jobs))
    return {"schema_version": 1, "updated_at": now, "boards": parts[:3], "feeds": parts[3:9], "resets": parts[9], "benchmark": parts[10]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data/ai.json")
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args(argv)
    previous_path = args.previous or args.output
    previous = {}
    if previous_path.exists():
        previous = json.loads(previous_path.read_text())
        if not isinstance(previous, dict) or previous.get("schema_version") != 1:
            raise ValueError("Unsupported previous snapshot")
    now = datetime.now(timezone.utc).isoformat()
    snapshot = build_snapshot(previous, now)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({part["id"]: part["status"] for part in snapshot["boards"] + snapshot["feeds"] + [snapshot["resets"], snapshot["benchmark"]]}))
    return 0 if any(part["status"] == "ok" for part in snapshot["boards"] + snapshot["feeds"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
