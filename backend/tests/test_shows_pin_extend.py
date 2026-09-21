"""Backend tests for Cloud Handoff PIN + extend endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _payload():
    return {
        "app": "hotlive95",
        "kind": "studio",
        "tracks": [{"refId": 1, "id": "t1", "name": "Sample", "audio": ""}],
        "playlists": [{"name": "TEST_PIN_Show", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


class TestShowPin:
    def test_create_with_pin_returns_protected(self, client):
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": _payload(), "pin": "4820"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["protected"] is True
        assert "code" in data
        pytest.pin_code = data["code"]

    def test_create_with_invalid_pin_422(self, client):
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": _payload(), "pin": "12"})
        assert r.status_code == 422

    def test_get_protected_no_pin_401(self, client):
        r = client.get(f"{BASE_URL}/api/shows/{pytest.pin_code}")
        assert r.status_code == 401
        assert "PIN" in r.json().get("detail", "")

    def test_get_protected_wrong_pin_403(self, client):
        r = client.get(f"{BASE_URL}/api/shows/{pytest.pin_code}", headers={"X-Show-PIN": "0000"})
        assert r.status_code == 403

    def test_get_protected_right_pin_200(self, client):
        r = client.get(f"{BASE_URL}/api/shows/{pytest.pin_code}", headers={"X-Show-PIN": "4820"})
        assert r.status_code == 200
        body = r.json()
        assert body["payload"]["playlists"][0]["name"] == "TEST_PIN_Show"

    def test_create_no_pin_still_works(self, client):
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": _payload()})
        assert r.status_code == 200
        data = r.json()
        assert data.get("protected") is False
        pytest.nopin_code = data["code"]

    def test_get_nopin_show_no_header_200(self, client):
        r = client.get(f"{BASE_URL}/api/shows/{pytest.nopin_code}")
        assert r.status_code == 200


class TestShowExtend:
    def test_extend_updates_expiry(self, client):
        # Create fresh show
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": _payload()})
        assert r.status_code == 200
        code = r.json()["code"]
        original_exp = r.json()["expires_at"]

        # Extend
        r2 = client.post(f"{BASE_URL}/api/shows/{code}/extend")
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["code"] == code
        assert data["expires_at"] != original_exp
        # New expiry should be later
        from datetime import datetime
        assert datetime.fromisoformat(data["expires_at"]) > datetime.fromisoformat(original_exp)

    def test_extend_unknown_code_404(self, client):
        r = client.post(f"{BASE_URL}/api/shows/ZZZZZZ/extend")
        assert r.status_code == 404
