#!/usr/bin/env python3
"""Weekly discovery only. Does not execute or publish upstream code."""
import json, pathlib, re, urllib.request, urllib.parse, datetime, os
STATE = pathlib.Path("/opt/fluxer-custom/state")
def github(route):
    request = urllib.request.Request("https://api.github.com/repos/fluxerapp/fluxer/" + route,
        headers={"Accept":"application/vnd.github+json", "User-Agent":"Fluxer-LePast-weekly-check"})
    with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)
def atomic(name, data):
    file = STATE / name
    temp = file.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    os.replace(temp, file)
def main():
    current = json.loads((STATE / "current.json").read_text())
    releases = github("releases?per_page=100")
    candidates = [r for r in releases if not r["draft"] and re.fullmatch(r"fluxer-desktop-canary@\d{4}\.\d+\.\d+", r["tag_name"])]
    if not candidates: raise RuntimeError("No official desktop Canary release found; nothing changed.")
    latest = max(candidates, key=lambda r: r["published_at"])
    tag = latest["tag_name"]
    obj = github("git/ref/tags/" + urllib.parse.quote(tag, safe=""))["object"]
    while obj["type"] == "tag": obj = github("git/tags/" + obj["sha"])["object"]
    if obj["type"] != "commit" or not re.fullmatch("[0-9a-f]{40}", obj["sha"]): raise RuntimeError("Unexpected release ref")
    changed = obj["sha"] != current["upstreamCommit"]
    atomic("candidate.json", {"tag":tag,"commit":obj["sha"],"pending":changed,"checkedAt":datetime.datetime.now(datetime.timezone.utc).isoformat()})
    print("Candidate queued: " + tag if changed else "Already current: " + tag)
if __name__ == "__main__": main()
