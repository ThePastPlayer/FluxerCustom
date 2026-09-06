#!/usr/bin/env python3
"""Promote one verified bundle; one atomic symlink switches feed and installer together."""
import sys, pathlib, json, re, hashlib, shutil, os, fcntl, pwd
BASE = pathlib.Path("/opt/fluxer-custom")
def digest(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""): h.update(block)
    return h.hexdigest()
def publish(version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version): raise ValueError("Invalid version")
    source = BASE / "incoming" / version
    receipt = json.loads((source / "release.json").read_text())
    if receipt["version"] != version or receipt["testsPassed"] is not True: raise ValueError("Unverified release")
    if not re.fullmatch("[0-9a-f]{40}", receipt["sourceCommit"]): raise ValueError("Missing source commit")
    feed = json.loads((source / "releases.win.json").read_text())
    if len(feed["Assets"]) != 1: raise ValueError("Expected one full package")
    asset = feed["Assets"][0]
    if asset["PackageId"] != "FluxerLePast" or asset["Version"] != version or asset["Type"] != "Full": raise ValueError("Wrong package")
    package = f"FluxerLePast-{version}-full.nupkg"
    if asset["FileName"] != package: raise ValueError("Unexpected filename")
    names = [package, "FluxerLePast-win-Setup.exe", "releases.win.json", "RELEASES"]
    for name in names:
        file = source / name
        if file.is_symlink() or not file.is_file() or digest(file) != receipt["sha256"][name]: raise ValueError("Integrity mismatch: " + name)
    if digest(source / package).upper() != asset["SHA256"].upper() or (source / package).stat().st_size != asset["Size"]:
        raise ValueError("Feed does not match package")
    if shutil.disk_usage(BASE).free < 2 * 1024**3: raise RuntimeError("Less than 2 GiB free; publication held")
    current = BASE / "state/current.json"
    if current.exists():
        old = json.loads(current.read_text())
        if old.get("version") and tuple(map(int, version.split("."))) <= tuple(map(int, old["version"].split("."))):
            raise ValueError("Version must increase; rollback requires an explicit operator action")
    destination = BASE / "public/releases" / version
    destination.mkdir(parents=True, exist_ok=False)
    for name in names + ["release.json"]: shutil.copyfile(source / name, destination / name)
    # Hard links retain old update package URLs for clients whose download began before promotion.
    feed_dir = destination / "feed"
    feed_dir.mkdir()
    for old_package in (BASE / "public/releases").glob("*/FluxerLePast-*-full.nupkg"):
        os.link(old_package, feed_dir / old_package.name)
    for name in ["FluxerLePast-win-Setup.exe", "releases.win.json", "RELEASES"]:
        os.link(destination / name, feed_dir / name)
    link = BASE / "public/current.next"
    if link.is_symlink(): link.unlink()
    link.symlink_to("releases/" + version)
    os.replace(link, BASE / "public/current")
    state = {key:receipt[key] for key in ("version","sourceCommit","upstreamCommit","upstreamTag")}
    temp = current.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2)+"\n")
    os.replace(temp, current)
    owner = pwd.getpwnam('ubuntu')
    os.chown(current, owner.pw_uid, owner.pw_gid)
    print("Published " + version)
if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("Usage: publish.py VERSION")
    with (BASE / "state/publish.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        publish(sys.argv[1])
