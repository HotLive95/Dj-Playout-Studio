"""Backend tests for the Show open-alert path (iteration 23).

The first successful GET /api/shows/{code} for a share that has an email
attempts a one-time sender ping. We assert observable behavior only
(HTTP status + opens counter via /stats) — the Resend call itself may
fail against the fake .invalid recipient and that must be handled
gracefully (200, opens still incremented).
"""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or "https://dj-playout-studio.preview.emergentagent.com"
).rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def payload():
    return {
        "app": "hotlive95",
        "kind": "studio",
        "tracks": [{"refId": 1, "id": "t1", "name": "TEST_open_alert", "audio": ""}],
        "playlists": [{"name": "TEST_open_alert_show", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


class TestOpenAlert:
    def test_create_share_with_email(self, client, payload):
        r = client.post(
            f"{BASE_URL}/api/shows",
            json={"payload": payload, "email": "fake-test@example.invalid"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data and len(data["code"]) == 6
        pytest.oa_code = data["code"]

    def test_first_get_increments_opens_to_1(self, client):
        code = pytest.oa_code
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        # Even with a bogus .invalid recipient, the read must succeed.
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("payload", {}).get("app") == "hotlive95"
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert s["opens"] == 1
        assert s["last_opened_at"]

    def test_second_get_increments_opens_to_2_no_error(self, client):
        code = pytest.oa_code
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        assert r.status_code == 200, r.text
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert s["opens"] == 2

    def test_stats_expiry_and_protected_flags(self, client):
        code = pytest.oa_code
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert "expires_at" in s and s["expires_at"]
        assert s["protected"] is False

    def test_share_without_email_still_ok(self, client, payload):
        # Regression: no email → no alert path but GET still works.
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": payload})
        assert r.status_code == 200
        code = r.json()["code"]
        g = client.get(f"{BASE_URL}/api/shows/{code}")
        assert g.status_code == 200
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert s["opens"] == 1
