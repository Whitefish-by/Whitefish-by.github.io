"""Exercise the deployment CLI in an isolated Linux directory, never the live site."""
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "site"
        self.previous = self.root / "releases" / "20200101T000000Z-00000000"
        self.previous.mkdir(parents=True)
        (self.root / "current").symlink_to(self.previous)
        source = Path(__file__).with_name("receive-site.py").read_text()
        original = 'root = Path("/srv/paperenjoyer/site")'
        self.assertEqual(source.count(original), 1)
        self.script = Path(self.temp.name) / "receive.py"
        self.script.write_text(source.replace(original, f"root = Path({str(self.root)!r})"))
        self.files = ["index.html", "en/index.html", "pricing/index.html", "terms/index.html",
                      "privacy/index.html", "refund/index.html", "site-build.json", "sitemap.xml"]
        for language in ("zh-hans", "zh-hant", "ja", "ko", "ru", "fr", "de"):
            self.files.extend([f"{language}/index.html", f"{language}/pricing/index.html"])

    def receive(self, files):
        payload = io.BytesIO()
        with tarfile.open(fileobj=payload, mode="w:gz") as archive:
            for name in files:
                member = tarfile.TarInfo(name)
                member.size = 2
                archive.addfile(member, io.BytesIO(b"ok"))
        return subprocess.run([sys.executable, str(self.script)], input=payload.getvalue(),
                              capture_output=True)

    def test_complete_multilingual_release_is_activated(self):
        result = self.receive(self.files)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        current = (self.root / "current").resolve()
        self.assertNotEqual(current, self.previous)
        self.assertTrue(self.previous.is_dir())
        for name in self.files:
            self.assertEqual((current / name).read_bytes(), b"ok")

    def test_missing_translation_keeps_previous_release(self):
        self.files.remove("ja/pricing/index.html")
        result = self.receive(self.files)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Incomplete website build", result.stderr)
        self.assertEqual((self.root / "current").resolve(), self.previous)
        self.assertEqual(list((self.root / "releases").iterdir()), [self.previous])

    def test_archive_cannot_escape_the_release_directory(self):
        result = self.receive(["../escaped", *self.files])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Unsafe archive member", result.stderr)
        self.assertEqual((self.root / "current").resolve(), self.previous)
        self.assertFalse((self.root / "releases" / "escaped").exists())


if __name__ == "__main__":
    unittest.main()
