import contextlib
import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("version_assets", ROOT / "scripts/version_assets.py")
VERSIONER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERSIONER)


class AssetVersionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "assets").mkdir()
        self.script = self.root / "assets/app.js"
        self.script.write_bytes(b'"use strict";\n')
        self.style = self.root / "assets/style.css"
        self.style.write_bytes(b"body { color: black; }\n")
        self.page = self.root / "index.html"
        self.page.write_text('<link rel="stylesheet" href="assets/style.css?v=old">\n<script src="assets/app.js" defer></script>\n', encoding="utf-8")

    def run_cli(self, *args):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return VERSIONER.main(["--page", str(self.page), *args])

    def test_missing_or_stale_versions_fail_without_writing_and_sync_is_repeatable(self):
        original = self.page.read_bytes()
        self.assertEqual(self.run_cli("--check"), 1)
        self.assertEqual(self.page.read_bytes(), original)
        self.assertEqual(self.run_cli(), 0)
        synchronized = self.page.read_bytes()
        for asset in [self.script, self.style]:
            version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
            self.assertIn(f"{asset.name}?v={version}".encode(), synchronized)
        self.assertEqual(self.run_cli("--check"), 0)
        self.assertEqual(self.run_cli(), 0)
        self.assertEqual(self.page.read_bytes(), synchronized)

    def test_a_content_change_requires_a_new_version(self):
        self.assertEqual(self.run_cli(), 0)
        original = self.page.read_bytes()
        self.script.write_bytes(b'"use strict";\nconsole.log("changed");\n')
        self.assertEqual(self.run_cli("--check"), 1)
        self.assertEqual(self.page.read_bytes(), original)
        self.assertEqual(self.run_cli(), 0)
        self.assertNotEqual(self.page.read_bytes(), original)
        self.assertEqual(self.run_cli("--check"), 0)

    def test_preserves_queries_fragments_quotes_and_unrelated_markup(self):
        page = "<!-- <script src='missing.js'></script> -->\n<link rel='preload stylesheet' data-href='unrelated' href='/assets/style.css?theme=light&amp;v=old&amp;v=older#rules'>\n<script src='https://example.com/app.js'></script><a href='assets/app.js'>source</a>"
        updated, count = VERSIONER.version_page(page, self.root)
        version = hashlib.sha256(self.style.read_bytes()).hexdigest()[:12]
        self.assertEqual(count, 1)
        self.assertEqual(updated, page.replace("theme=light&amp;v=old&amp;v=older", f"theme=light&amp;v={version}"))
        self.assertEqual(VERSIONER.version_page(updated, self.root)[0], updated)

    def test_missing_assets_and_paths_outside_the_page_directory_fail(self):
        for source in ["assets/missing.js", "../outside.js", "%2e%2e/outside.js"]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                VERSIONER.version_page(f'<script src="{source}"></script>', self.root)
        self.script.unlink()
        original = self.page.read_bytes()
        self.assertEqual(self.run_cli(), 2)
        self.assertEqual(self.page.read_bytes(), original)

    def test_attribute_like_text_inside_another_value_is_preserved(self):
        for page in [
            "<script data-note='src=\"decoy.js\"' src=\"assets/app.js\"></script>",
            '<link data-note="href=\'decoy.css\'" rel="stylesheet" href=\'assets/style.css\'>',
        ]:
            with self.subTest(page=page):
                updated, count = VERSIONER.version_page(page, self.root)
                self.assertEqual(count, 1)
                asset = self.script if "<script" in page else self.style
                version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
                self.assertEqual(updated, page.replace(f"assets/{asset.name}", f"assets/{asset.name}?v={version}"))
                self.assertEqual(VERSIONER.version_page(updated, self.root)[0], updated)

    def test_offsets_follow_html_parser_across_unicode_and_crlf_lines(self):
        for separator in ["\u2028", "\u2029", "\r", "\r\n", "\v", "\f"]:
            with self.subTest(separator=separator):
                page = f'<p>alpha{separator}beta</p>\n<script src="assets/app.js"></script>'
                updated, count = VERSIONER.version_page(page, self.root)
                version = hashlib.sha256(self.script.read_bytes()).hexdigest()[:12]
                self.assertEqual(count, 1)
                self.assertEqual(updated, page.replace("assets/app.js", f"assets/app.js?v={version}"))

    def test_duplicate_asset_attributes_are_rejected_without_writing(self):
        self.page.write_text('<script src="assets/app.js" src="assets/app.js"></script>', encoding="utf-8")
        original = self.page.read_bytes()
        self.assertEqual(self.run_cli(), 2)
        self.assertEqual(self.page.read_bytes(), original)

    def test_empty_pages_and_unquoted_local_urls_do_not_silently_pass(self):
        for page in ["<p>no assets</p>", '<script src="https://example.com/a.js"></script>', "<script src=assets/app.js></script>"]:
            with self.subTest(page=page), self.assertRaises(ValueError):
                VERSIONER.version_page(page, self.root)

    def test_repository_entrypoint_has_current_content_versions(self):
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        updated, count = VERSIONER.version_page(page, ROOT)
        self.assertEqual(count, 6)
        self.assertEqual(updated, page)


if __name__ == "__main__":
    unittest.main()
