#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyjwt", "cryptography"]
# ///
"""List the latest TestFlight builds of Virtus Lift and their processing state.

Read-only: it only calls GET endpoints of the App Store Connect API.

    uv run scripts/asc-builds.py            # latest 10 builds
    uv run scripts/asc-builds.py -n 3

Needs APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and
APP_STORE_CONNECT_KEY_P8 (the .p8 contents, pasted as-is or base64-encoded,
the same forms the iOS workflow accepts).
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import jwt

APP_ID = "6817940570"  # "Virtus Lift", com.swarajban.virtus
API = "https://api.appstoreconnect.apple.com/v1"


def token() -> str:
    pem = os.environ["APP_STORE_CONNECT_KEY_P8"]
    if "BEGIN PRIVATE KEY" not in pem:
        pem = base64.b64decode(pem).decode()
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip(), "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        pem,
        algorithm="ES256",
        headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"].strip(), "typ": "JWT"},
    )


def get(path: str, params: dict) -> dict:
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token()}"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        sys.exit(f"App Store Connect returned HTTP {e.code}: {e.read().decode()[:500]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("-n", "--limit", type=int, default=10)
    args = parser.parse_args()

    data = get(
        "/builds",
        {
            "filter[app]": APP_ID,
            "sort": "-uploadedDate",
            "limit": args.limit,
            "include": "preReleaseVersion,buildBetaDetail",
            "fields[builds]": "version,uploadedDate,processingState,expired,preReleaseVersion,buildBetaDetail",
            "fields[preReleaseVersions]": "version",
            "fields[buildBetaDetails]": "internalBuildState,externalBuildState",
        },
    )
    included = {(i["type"], i["id"]): i["attributes"] for i in data.get("included", [])}

    def rel(build: dict, name: str) -> dict:
        ref = (build["relationships"].get(name) or {}).get("data")
        return included.get((ref["type"], ref["id"]), {}) if ref else {}

    rows = [("BUILD", "VERSION", "UPLOADED (UTC)", "PROCESSING", "TESTFLIGHT (INTERNAL)", "EXPIRED")]
    for b in data["data"]:
        a = b["attributes"]
        rows.append((
            a["version"],
            rel(b, "preReleaseVersion").get("version", "?"),
            datetime.fromisoformat(a["uploadedDate"]).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            a["processingState"],
            rel(b, "buildBetaDetail").get("internalBuildState", "?"),
            "yes" if a["expired"] else "no",
        ))
    widths = [max(len(str(r[i])) for r in rows) for i in range(len(rows[0]))]
    for r in rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(r, widths)).rstrip())


if __name__ == "__main__":
    main()
