"""Local-only promotion tests: dummy files in TemporaryDirectory, never /opt."""
import hashlib, importlib.util, json, os, pathlib, tempfile, types, unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publish_mac', pathlib.Path(__file__).with_name('publish-mac.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Promotion(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='fluxer-mac-publish-test-')
        self.addCleanup(self.temp.cleanup)
        m.BASE = pathlib.Path(self.temp.name)
        self.version = '1.0.4'
        for directory in ('state', 'public/updates', 'public/releases/1.0.3', 'incoming/darwin-arm64/1.0.4'):
            (m.BASE / directory).mkdir(parents=True, exist_ok=True)
        (m.BASE / 'public/current').symlink_to('releases/1.0.3')
        (m.BASE / 'state/current.json').write_text('{"version":"1.0.3"}')
        self.source = m.BASE / 'incoming/darwin-arm64/1.0.4'
        self.zip = 'Fluxer-LePast-1.0.4-darwin-arm64.zip'
        self.dmg = 'Fluxer-LePast-1.0.4-darwin-arm64.dmg'
        for name in (self.zip, self.dmg): (self.source / name).write_bytes(b'SYNTHETIC PACKAGE FOR UNIT TEST ONLY')
        self.feed = {'currentRelease':self.version,'releases':[{'version':self.version,'updateTo':{'version':self.version,'url':'https://chat.lepast.fr/fluxer-custom/releases/darwin-arm64/1.0.4/'+self.zip}}]}
        self.receipt = dict(version=self.version, platform='darwin-arm64', sourceCommit='a'*40, upstreamCommit='b'*40, upstreamTag='test', signed=True, notarized=True, testsPassed=True)
        self.save()
        for p in (patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid())),patch.object(m.os,'chown'),patch.object(m.shutil,'disk_usage',return_value=types.SimpleNamespace(free=10*1024**3))):
            p.start(); self.addCleanup(p.stop)

    def save(self):
        (self.source / 'RELEASES.json').write_text(json.dumps(self.feed))
        self.receipt['sha256']={name:hashlib.sha256((self.source/name).read_bytes()).hexdigest() for name in (self.zip,self.dmg,'RELEASES.json')}
        (self.source / 'release.json').write_text(json.dumps(self.receipt))

    def assert_windows_unchanged(self):
        self.assertEqual(os.readlink(m.BASE / 'public/current'),'releases/1.0.3')
        self.assertEqual((m.BASE/'state/current.json').read_text(),'{"version":"1.0.3"}')

    def test_valid_separate_feed(self):
        m.publish(self.version)
        self.assertEqual(os.readlink(m.BASE/'public/updates/darwin-arm64'),'../current-darwin-arm64')
        self.assertEqual((m.BASE/'public/current-darwin-arm64/Fluxer-LePast-mac-arm64.dmg').read_bytes(),(self.source/self.dmg).read_bytes())
        self.assert_windows_unchanged()
        with self.assertRaises(ValueError): m.publish(self.version)

    def test_unsigned_rejected_before_promotion(self):
        self.receipt['signed']=False; self.save()
        with self.assertRaises(ValueError): m.publish(self.version)
        self.assertFalse((m.BASE/'public/current-darwin-arm64').is_symlink())
        self.assert_windows_unchanged()

    def test_external_or_windows_payload_rejected(self):
        self.feed['releases'][0]['updateTo']['url']='https://chat.lepast.fr/fluxer-custom/updates/win32-x64/FluxerLePast-win-Setup.exe'
        self.save()
        with self.assertRaises(ValueError): m.publish(self.version)
        self.assert_windows_unchanged()

    def test_corruption_rejected(self):
        (self.source/self.zip).write_bytes(b'corrupt')
        with self.assertRaises(ValueError): m.publish(self.version)
        self.assert_windows_unchanged()

    def test_conflicting_feed_does_not_switch_current(self):
        (m.BASE/'public/updates/darwin-arm64').symlink_to('../current')
        with self.assertRaises(ValueError): m.publish(self.version)
        self.assertFalse((m.BASE/'public/current-darwin-arm64').is_symlink())
        self.assert_windows_unchanged()

if __name__ == '__main__': unittest.main()
