#!/usr/bin/env python3
"""Independent, atomic macOS promotion. Never changes the Windows feed/state."""
import fcntl, hashlib, json, os, pathlib, pwd, re, shutil, sys
BASE = pathlib.Path('/opt/fluxer-custom')

def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def publish(version):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version): raise ValueError('Invalid version')
    source = BASE / 'incoming/darwin-arm64' / version
    receipt = json.loads((source / 'release.json').read_text())
    if receipt.get('version') != version or receipt.get('platform') != 'darwin-arm64': raise ValueError('Wrong release')
    if any(receipt.get(key) is not True for key in ('signed','notarized','testsPassed')): raise ValueError('Mac publication gates failed')
    if not re.fullmatch('[a-f0-9]{40}', receipt.get('sourceCommit', '')): raise ValueError('Missing source commit')
    names = [f'Fluxer-LePast-{version}-darwin-arm64.{ext}' for ext in ('zip','dmg')] + ['RELEASES.json']
    for name in names:
        file = source / name
        if file.is_symlink() or not file.is_file() or digest(file) != receipt['sha256'][name]: raise ValueError('Integrity mismatch: ' + name)
    feed = json.loads((source / 'RELEASES.json').read_text())
    if feed['currentRelease'] != version or len(feed['releases']) != 1: raise ValueError('Invalid feed')
    target = feed['releases'][0]
    url = f'https://chat.lepast.fr/fluxer-custom/releases/darwin-arm64/{version}/{names[0]}'
    if target['version'] != version or target['updateTo']['version'] != version or target['updateTo']['url'] != url: raise ValueError('External or incorrect update URL')
    state = BASE / 'state/current-darwin-arm64.json'
    # All checks must finish before changing the visible current link.
    for key in ('upstreamCommit', 'upstreamTag'): receipt[key]
    update = BASE / 'public/updates/darwin-arm64'
    if update.exists() or update.is_symlink():
        if not update.is_symlink() or os.readlink(update) != '../current-darwin-arm64': raise ValueError('Unexpected existing Mac feed link')
    owner = pwd.getpwnam('ubuntu')
    if state.exists():
        old = json.loads(state.read_text())
        if tuple(map(int, version.split('.'))) <= tuple(map(int, old['version'].split('.'))): raise ValueError('Version must increase')
    if shutil.disk_usage(BASE).free < 2 * 1024**3: raise RuntimeError('Insufficient free disk space')
    destination = BASE / 'public/releases/darwin-arm64' / version
    destination.mkdir(parents=True, exist_ok=False)
    for name in names + ['release.json']: shutil.copyfile(source / name, destination / name)
    (destination / 'Fluxer-LePast-mac-arm64.dmg').symlink_to(names[1])
    link = BASE / 'public/current-darwin-arm64.next'
    if link.is_symlink(): link.unlink()
    link.symlink_to(f'releases/darwin-arm64/{version}')
    os.replace(link, BASE / 'public/current-darwin-arm64')
    if not update.is_symlink(): update.symlink_to('../current-darwin-arm64')
    temp = state.with_suffix('.tmp')
    temp.write_text(json.dumps({key:receipt[key] for key in ('version','sourceCommit','upstreamCommit','upstreamTag')}, indent=2)+'\n')
    os.replace(temp, state)
    os.chown(state, owner.pw_uid, owner.pw_gid)
    print('Published notarized macOS ' + version)

if __name__ == '__main__':
    if len(sys.argv) != 2: raise SystemExit('Usage: publish-mac.py VERSION')
    with (BASE / 'state/publish.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        publish(sys.argv[1])
