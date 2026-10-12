import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("import_bookmarks", ROOT / "scripts/import_bookmarks.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


def link(name="Article", url="https://example.com/article"):
    return {"type": "url", "name": name, "url": url, "guid": "private-id"}


def folder(name, *children):
    return {"type": "folder", "name": name, "children": list(children)}


class ImportTests(unittest.TestCase):
    def test_recursive_exclusion_and_duplicate_folder_names(self):
        source = {"roots": {"bookmark_bar": folder("Bookmarks Bar", link(), folder("学习", folder("字节", folder("nested", link())), folder("Linux", link("one")), folder("Linux", link("two"))), folder("雪球", link()), folder("京东", link()))}}
        catalog, report = IMPORTER.import_tree(source)
        self.assertEqual((report["source_total"], report["excluded"], report["published"]), (6, 4, 2))
        self.assertEqual(catalog["folders"][0]["name"], "学习")
        self.assertEqual([node["name"] for node in catalog["folders"][0]["children"]], ["Linux", "Linux"])
        self.assertNotIn("guid", json.dumps(catalog))
        rendered = IMPORTER.render_catalog(catalog)
        self.assertIn('id="bookmark-folder-2"', rendered)
        self.assertIn('id="bookmark-folder-3"', rendered)

    def test_bar_shortcuts_are_excluded_without_changing_other_roots_or_source(self):
        source = {"roots": {
            "bookmark_bar": folder("收藏夹栏", link("shortcut"), folder("TOOLS", link("tool"))),
            "other": folder("Other", link("other shortcut")),
        }}
        original = json.dumps(source)
        catalog, report = IMPORTER.import_tree(source)
        self.assertEqual((report["source_total"], report["excluded"], report["published"]), (3, 1, 2))
        self.assertEqual([node["name"] for node in catalog["folders"]], ["TOOLS", "Other"])
        self.assertEqual(catalog["folders"][1]["children"][0]["name"], "other shortcut")
        self.assertEqual(json.dumps(source), original)

    def test_bar_with_only_shortcuts_does_not_create_an_empty_group(self):
        catalog, report = IMPORTER.import_tree({"roots": {"bookmark_bar": folder("Bookmarks Bar", link())}})
        self.assertEqual(catalog, {"folders": []})
        self.assertEqual((report["source_total"], report["excluded"], report["published"]), (1, 1, 0))

    def test_private_and_unsafe_urls_are_held(self):
        urls = ["file:///home/report.pdf", "javascript:alert(1)", "data:text/html,hello", "http://localhost:8080/a", "http://10.0.0.1/a", "http://127.0.0.1/a", "https://[::1]/", "http://198.51.100.2/", "http://2130706433/", "https://portal.internal/", "https://foo.local/", "https://sso.bytedance.net/", "https://user:secret@example.com/", "https://example.com/?access_token=secret", "https://example.com/#session=secret", "https://example.com:wrong/", "https://example.com/\nsecret", "https://example.com\\@localhost/"]
        for url in urls:
            with self.subTest(url=url):
                self.assertIsNone(IMPORTER.public_url(url)[0])
        self.assertIsNone(IMPORTER.public_url(None)[0])
        self.assertIsNone(IMPORTER.public_url("https://example.com/?bad%ZZ=value")[0])
        self.assertIsNone(IMPORTER.public_url("https://example.com/?%FFtoken=value")[0])
        for url in ["http://0x7f.1/", "http://0177.0.0.1/", "http://%31%32%37.0.0.1/", "https://byted.org/"]:
            self.assertIsNone(IMPORTER.public_url(url)[0])
        self.assertEqual(IMPORTER.public_url("https://360.cn/")[0], "https://360.cn/")

    def test_only_known_nonessential_parameters_are_removed(self):
        url, keys, reason = IMPORTER.public_url("https://mp.weixin.qq.com/s?__biz=article&mid=42&sn=signature&poc_token=private")
        self.assertEqual(url, "https://mp.weixin.qq.com/s?__biz=article&mid=42&sn=signature")
        self.assertEqual(keys, ["poc_token"])
        self.assertIsNone(reason)
        self.assertEqual(IMPORTER.public_url("https://raft.github.io/?nsukey=private")[0], "https://raft.github.io/")
        self.assertEqual(IMPORTER.public_url("https://translate.volcengine.com/?source_language=en&text=private")[0], "https://translate.volcengine.com/?source_language=en")
        self.assertIsNone(IMPORTER.public_url("https://mp.weixin.qq.com/cgi-bin/home?token=secret")[0])
        self.assertIsNone(IMPORTER.public_url("https://example.com/s?poc_token=secret")[0])
        original = "http://example.com/?q=a%20b&idx=1#article"
        self.assertEqual(IMPORTER.public_url(original)[0], original)

    def test_private_analysis_and_unverified_github_are_held(self):
        self.assertIsNone(IMPORTER.public_url("https://opts.console.perfma.com/result/optimize/example")[0])
        source = {"roots": {"other": folder("Other", link("public", "https://github.com/example/public/blob/main/a"), link("private", "https://github.com/example/private"))}}
        catalog, report = IMPORTER.import_tree(source, {"Example/Public": "public"})
        self.assertEqual(report["published"], 1)
        self.assertEqual(report["held"][0]["reason"], "github_visibility_unverified")
        self.assertNotIn("url", report["held"][0])
        self.assertEqual(catalog["folders"][0]["children"][0]["name"], "public")

    def test_render_escapes_titles_urls_and_folder_attributes(self):
        catalog = {"folders": [folder('Tools"<script>', link('<img src=x onerror="alert(1)">', 'https://example.com/?q="&a=<tag>'))]}
        rendered = IMPORTER.render_catalog(catalog)
        self.assertNotIn("<img", rendered)
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;img", rendered)
        self.assertIn("&quot;&amp;a=&lt;tag&gt;", rendered)
        self.assertIn('rel="noopener noreferrer"', rendered)

    def test_page_update_is_repeatable_and_requires_markers(self):
        catalog = {"folders": [folder("学习", link())]}
        page = '<span id="bookmark-total">0</span>' + IMPORTER.START + "old" + IMPORTER.END
        updated = IMPORTER.update_page(page, catalog)
        self.assertEqual(IMPORTER.update_page(updated, catalog), updated)
        self.assertIn('id="bookmark-total">1</span>', updated)
        with self.assertRaises(ValueError):
            IMPORTER.update_page("no markers", catalog)
        with self.assertRaises(ValueError):
            IMPORTER.update_page(IMPORTER.START + IMPORTER.END, catalog)

    def test_published_catalog_matches_static_homepage(self):
        catalog = json.loads((ROOT / "data/bookmarks.json").read_text())
        page = (ROOT / "index.html").read_text()
        self.assertEqual(IMPORTER.update_page(page, catalog), page)
        self.assertNotIn("收藏栏", [node["name"] for node in catalog["folders"]])
        def check(node):
            if node["type"] == "url":
                url, removed, reason = IMPORTER.public_url(node["url"])
                self.assertIsNone(reason)
                self.assertEqual(removed, [])
                self.assertEqual(url, node["url"])
            else:
                self.assertNotIn(node["name"], IMPORTER.EXCLUDED)
                for child in node["children"]:
                    check(child)
        for node in catalog["folders"]:
            check(node)


if __name__ == "__main__":
    unittest.main()
