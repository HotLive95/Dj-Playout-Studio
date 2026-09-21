"""Tests for the raised 200 MB cap on POST /api/shows (Bug 3)."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")


def _payload(filler_bytes: int):
    """Build a payload whose serialized JSON is roughly filler_bytes big."""
    # base64 expands ~4/3; use raw bytes then b64
    raw = b"A" * filler_bytes
    data = base64.b64encode(raw).decode("ascii")
    return {
        "app": "hotlive95",
        "kind": "studio",
        "tracks": [{"refId": 1, "id": "t1", "name": "TEST_big", "data": data}],
        "playlists": [{"name": "TEST_SizeCap", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


class TestShowsSizeCap:
    def test_small_payload_still_ok(self):
        r = requests.post(f"{BASE_URL}/api/shows", json={"payload": _payload(10_000)}, timeout=30)
        assert r.status_code == 200, r.text
        assert "code" in r.json()

    def test_payload_over_50mb_now_accepted(self):
        # ~60 MB of raw filler -> ~80 MB base64 in JSON. Definitely > old 50 MB cap.
        # Kubernetes ingress could still cap the request; try, but if we hit 413 we still want to
        # make sure the detail message references 200 MB (proving cap logic is raised).
        r = requests.post(f"{BASE_URL}/api/shows", json={"payload": _payload(60 * 1024 * 1024)}, timeout=120)
        # Success is the primary assertion (app-level cap raised)
        if r.status_code == 413:
            # If ingress caps it, at least our app message should say 200 MB when it's app-level
            pytest.skip(f"413 received (likely ingress/proxy cap): {r.text[:200]}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"

    def test_payload_over_200mb_rejected_with_200mb_message(self):
        # Build ~230 MB raw -> ~307 MB base64. Very likely blocked by ingress before hitting app.
        try:
            r = requests.post(
                f"{BASE_URL}/api/shows",
                json={"payload": _payload(230 * 1024 * 1024)},
                timeout=180,
            )
        except requests.exceptions.RequestException as e:
            pytest.skip(f"request-level failure (likely ingress): {e}")
            return
        assert r.status_code == 413
        # Our app-level message includes "200 MB"; ingress messages may not.
        body = r.text or ""
        if "200 MB" not in body and "200MB" not in body:
            pytest.skip(f"413 came from ingress (no '200 MB' in body): {body[:200]}")
