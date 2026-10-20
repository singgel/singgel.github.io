import gzip
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ai_hub", ROOT / "scripts/update_ai_hub.py")
HUB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HUB)
NOW = "2026-10-20T07:00:00+00:00"


def board_payload():
    return {"rows": [{"row": {"rank": rank, "category": "overall", "model_name": f"Model {rank}",
                              "organization": "Example", "rating": 1500 - rank, "rating_lower": 1490 - rank,
                              "rating_upper": 1510 - rank, "vote_count": 100, "leaderboard_publish_date": "2026-10-19"}}
                     for rank in range(1, 21)]}


def timeline(text="and reset", author="thsottiaux", quoted=False):
    tweet = {"rest_id": "2112432076767289678", "details": {"full_text": text, "created_at_ms": 1792478028000},
             "core": {"user_results": {"result": {"core": {"screen_name": author}}}}}
    if quoted:
        tweet["quoted_tweet_results"] = {"result": {**tweet, "rest_id": "2112432076767289679"}}
    payload = {"data": {"user_result_by_screen_name": {"result": {"profile_user_originals_timeline": {
        "timeline": {"instructions": [{"entries": [{"content": {"content": {"tweet_results": {"result": tweet}}}}]}]}
    }}}}}
    return ('<script>GraphQLRequestStream.Completed({value:' + json.dumps(json.dumps(payload)) + '})</script>').encode()


class AIHubTests(unittest.TestCase):
    def test_board_keeps_source_ranks_intervals_and_date(self):
        payload = board_payload()
        payload["rows"].reverse()
        result = HUB.arena_entries(payload)
        self.assertEqual(result["entries"][0]["rank"], 1)
        self.assertEqual(result["entries"][0]["score"], 1499)
        self.assertEqual(result["published_at"], "2026-10-19")

    def test_incomplete_mixed_duplicate_and_nonfinite_boards_fail_closed(self):
        for mutation in [lambda p: p["rows"].pop(),
                         lambda p: p["rows"][0]["row"].update(rank=2),
                         lambda p: p["rows"][0]["row"].update(rating=float("nan")),
                         lambda p: p["rows"][0]["row"].update(rating_lower=5000),
                         lambda p: p["rows"][0]["row"].update(leaderboard_publish_date="2026-10-18"),
                         lambda p: p["rows"][0]["row"].update(category="other")]:
            with self.subTest(mutation=mutation):
                payload = board_payload()
                mutation(payload)
                with self.assertRaises(ValueError):
                    HUB.arena_entries(payload)

    def test_feed_parses_rss_atom_and_skips_unsafe_or_undated_links(self):
        rss = b'<rss><channel><item><title>Safe</title><link>https://example.com/a</link><pubDate>Tue, 20 Oct 2026 06:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:bad</link><pubDate>Tue, 20 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>'
        identity = {"id": "test", "name": "Example", "kind": "news"}
        self.assertEqual(len(HUB.feed_entries(rss, identity)["items"]), 1)
        atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v1 alpha</title><updated>2026-10-20T06:00:00Z</updated><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/release"/></entry></feed>'
        result = HUB.feed_entries(atom, identity)["items"][0]
        self.assertEqual(result["url"], "https://example.com/release")
        self.assertEqual(result["published_at"], "2026-10-20T06:00:00+00:00")
        with self.assertRaises(ValueError):
            HUB.feed_entries(b"<rss/>", identity)

    def test_urls_reject_secrets_local_addresses_and_non_https(self):
        for url in ["http://example.com", "https://user:secret@example.com", "https://:@example.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://service.internal", "javascript:alert(1)"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                HUB.public_url(url)

    def test_reset_candidates_are_unconfirmed_top_level_posts_only(self):
        result = HUB.reset_entries(timeline(quoted=True))
        self.assertEqual(result["observed_posts"], 1)
        self.assertEqual(result["entries"][0]["state"], "unconfirmed")
        self.assertNotIn("text", result["entries"][0])
        self.assertEqual(result["status"], "partial")
        no_match = HUB.reset_entries(timeline("new release"))
        self.assertEqual(no_match["entries"], [])
        self.assertEqual(no_match["status"], "partial")

    def test_changed_timeline_and_wrong_author_are_not_no_announcement(self):
        for source in [b"<html>Login</html>", timeline(author="other")]:
            with self.assertRaises(ValueError):
                HUB.reset_entries(source)

    def test_failure_preserves_previous_success_and_marks_stale(self):
        previous = {"entries": [1], "last_success_at": "2026-10-19T00:00:00Z"}
        def fail():
            raise OSError("unavailable")
        result = HUB.refresh_part({"id": "text"}, previous, fail, NOW)
        self.assertEqual(result["entries"], [1])
        self.assertEqual(result["last_success_at"], previous["last_success_at"])
        self.assertEqual(result["checked_at"], NOW)
        self.assertEqual(result["status"], "stale")
        self.assertEqual(HUB.refresh_part({"id": "text"}, {}, fail, NOW)["status"], "unavailable")

    def test_gzip_is_decoded_with_a_bound(self):
        class Response(io.BytesIO):
            headers = {"Content-Encoding": "gzip"}
        with patch.object(HUB.urllib.request, "urlopen", return_value=Response(gzip.compress(b"<rss/>"))):
            self.assertEqual(HUB.fetch("https://example.com"), b"<rss/>")
        with patch.object(HUB, "LIMIT", 100), patch.object(HUB.urllib.request, "urlopen", return_value=Response(gzip.compress(b"x" * 101))):
            with self.assertRaises(ValueError):
                HUB.fetch("https://example.com")
        with patch.object(HUB.urllib.request, "urlopen", return_value=Response(gzip.compress(b"<rss/>")[:-4])):
            result = HUB.refresh_part({"id": "deepmind"}, {}, lambda: HUB.fetch("https://example.com"), NOW)
            self.assertEqual(result["status"], "unavailable")
            self.assertEqual(result["error"], "EOFError")
        corrupt = bytearray(gzip.compress(b"x" * 100))
        corrupt[10] = 255
        with patch.object(HUB.urllib.request, "urlopen", return_value=Response(corrupt)):
            result = HUB.refresh_part({"id": "deepmind"}, {}, lambda: HUB.fetch("https://example.com"), NOW)
            self.assertEqual(result["status"], "unavailable")

    def test_all_sources_refresh_independently_without_network(self):
        rss = b'<rss><channel><item><title>Update</title><link>https://example.com/news</link><pubDate>Tue, 20 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>'
        def read(url):
            if "datasets-server" in url:
                return json.dumps(board_payload()).encode()
            if url == HUB.TIBO:
                return timeline()
            return rss
        result = HUB.build_snapshot({}, NOW, read)
        self.assertEqual(len(result["boards"]), 3)
        self.assertEqual(len(result["feeds"]), 6)
        self.assertTrue(all(part["status"] == "ok" for part in result["boards"] + result["feeds"]))
        self.assertEqual(result["resets"]["status"], "partial")
        def truncated_source(url):
            if url == HUB.FEEDS[0][3]:
                raise EOFError("truncated gzip")
            return read(url)
        partial = HUB.build_snapshot(result, NOW, truncated_source)
        self.assertEqual(partial["feeds"][0]["status"], "stale")
        self.assertEqual(partial["feeds"][0]["items"], result["feeds"][0]["items"])
        self.assertTrue(all(part["status"] == "ok" for part in partial["feeds"][1:] + partial["boards"]))

    def test_existing_invalid_checkpoint_is_not_treated_as_first_run(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path(directory) / "previous.json"
            output = Path(directory) / "output.json"
            for content in ["{}", "[]", '{"schema_version": 2}', "broken"]:
                previous.write_text(content)
                with self.subTest(content=content), self.assertRaises(ValueError), patch.object(HUB, "build_snapshot") as build:
                    HUB.main(["--previous", str(previous), "--output", str(output)])
                build.assert_not_called()
                self.assertFalse(output.exists())
                self.assertEqual(previous.read_text(), content)

    def test_rfc_and_fractional_iso_dates_have_the_same_timezone_boundary(self):
        for source in ["2026-10-20T06:00:00.123Z", "Mon, 20 Oct 2026 06:00:00 +0000"]:
            self.assertTrue(HUB.iso_date(source).startswith("2026-10-20T06:00:00"))


if __name__ == "__main__":
    unittest.main()
