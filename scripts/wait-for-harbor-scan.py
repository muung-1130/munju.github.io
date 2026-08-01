#!/usr/bin/env python3
"""Wait for a Harbor Trivy report and enforce the CI vulnerability gate."""

from __future__ import annotations

import argparse
import base64
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


TERMINAL_FAILURES = {"error", "stopped"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--expected-digest", required=True)
    parser.add_argument("--ca-file", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=600)
    parser.add_argument("--poll-seconds", type=int, default=10)
    parser.add_argument("--max-critical", type=int, default=0)
    return parser.parse_args()


def artifact_url(args: argparse.Namespace) -> str:
    project = urllib.parse.quote(args.project, safe="")
    repository = urllib.parse.quote(args.repository, safe="")
    reference = urllib.parse.quote(args.reference, safe="")
    return (
        f"{args.base_url.rstrip('/')}/api/v2.0/projects/{project}"
        f"/repositories/{repository}/artifacts/{reference}"
        "?with_scan_overview=true"
    )


def request_artifact(
    url: str,
    username: str,
    password: str,
    context: ssl.SSLContext,
) -> dict[str, Any] | None:
    token = base64.b64encode(
        f"{username}:{password}".encode("utf-8")
    ).decode("ascii")
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Basic {token}",
        },
    )

    try:
        with urllib.request.urlopen(
            request,
            context=context,
            timeout=15,
        ) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        if error.code in {401, 403}:
            raise RuntimeError(
                f"Harbor authentication/authorization failed: HTTP {error.code}"
            ) from error
        raise RuntimeError(
            f"Harbor API request failed: HTTP {error.code}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Harbor API connection failed: {error.reason}"
        ) from error


def severity_counts(report: dict[str, Any]) -> dict[str, int]:
    summary = report.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("Trivy report has no vulnerability summary.")

    raw_counts = summary.get("summary")
    if not isinstance(raw_counts, dict):
        raise ValueError("Trivy report has an invalid severity summary.")
    if not raw_counts and summary.get("total") not in {0, "0"}:
        raise ValueError("Trivy report severity counts are missing.")

    counts: dict[str, int] = {}

    for name, value in raw_counts.items():
        try:
            counts[str(name).lower()] = int(value)
        except (TypeError, ValueError):
            continue

    return counts


def main() -> int:
    args = parse_args()
    username = os.environ.get("HARBOR_USERNAME", "")
    password = os.environ.get("HARBOR_PASSWORD", "")

    if not username or not password:
        print(
            "HARBOR_USERNAME and HARBOR_PASSWORD are required.",
            file=sys.stderr,
        )
        return 2
    if args.timeout_seconds <= 0 or args.poll_seconds <= 0:
        print("Timeout and poll values must be positive.", file=sys.stderr)
        return 2
    if args.max_critical < 0:
        print("--max-critical cannot be negative.", file=sys.stderr)
        return 2
    if not (
        args.expected_digest.startswith("sha256:")
        and len(args.expected_digest) == 71
        and all(
            character in "0123456789abcdef"
            for character in args.expected_digest[7:]
        )
    ):
        print("--expected-digest is invalid.", file=sys.stderr)
        return 2

    context = ssl.create_default_context(cafile=args.ca_file)
    url = artifact_url(args)
    deadline = time.monotonic() + args.timeout_seconds
    last_status = ""

    while time.monotonic() < deadline:
        artifact = request_artifact(url, username, password, context)
        if artifact is not None:
            observed_digest = str(artifact.get("digest", ""))
            if observed_digest != args.expected_digest:
                print(
                    "Harbor artifact digest mismatch: "
                    f"expected={args.expected_digest}, "
                    f"observed={observed_digest or '<missing>'}.",
                    file=sys.stderr,
                )
                return 1

        scan_overview = (artifact or {}).get("scan_overview") or {}
        reports = [
            report
            for report in scan_overview.values()
            if isinstance(report, dict)
        ]
        statuses = {
            str(report.get("scan_status", "")).lower()
            for report in reports
            if report.get("scan_status")
        }

        status_text = ",".join(sorted(statuses)) or "waiting"
        if status_text != last_status:
            print(f"Harbor Trivy scan status: {status_text}", flush=True)
            last_status = status_text

        failed = statuses.intersection(TERMINAL_FAILURES)
        if failed:
            print(
                "Harbor Trivy scan ended unsuccessfully: "
                + ",".join(sorted(failed)),
                file=sys.stderr,
            )
            return 1

        successful = [
            report
            for report in reports
            if str(report.get("scan_status", "")).lower() == "success"
        ]
        if successful:
            try:
                counts_by_report = [
                    severity_counts(report)
                    for report in successful
                ]
            except ValueError as error:
                print(
                    f"Harbor Trivy gate failed closed: {error}",
                    file=sys.stderr,
                )
                return 1

            critical = max(
                (counts.get("critical", 0) for counts in counts_by_report),
                default=0,
            )
            high = max(
                (counts.get("high", 0) for counts in counts_by_report),
                default=0,
            )
            print(
                "Harbor Trivy result: "
                f"critical={critical}, high={high}",
                flush=True,
            )
            if critical > args.max_critical:
                print(
                    "Harbor Trivy gate failed: "
                    f"critical={critical} exceeds "
                    f"allowed={args.max_critical}.",
                    file=sys.stderr,
                )
                return 1

            print("Harbor Trivy gate passed.", flush=True)
            return 0

        time.sleep(args.poll_seconds)

    print(
        "Timed out waiting for the Harbor Trivy scan report.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
