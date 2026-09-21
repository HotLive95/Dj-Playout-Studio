"""Backend tests for handoff analytics: GET /api/shows/{code} increments opens
and GET /api/shows/{code}/stats returns the accrued count."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_code(client):
    payload = {
        "payload": {
            "app": "hotlive95",
            "kind": "studio",
            "tracks": [{"refId": 1, "id": "t1", "name": "Sample", "audio": ""}],
            "playlists": [{"name": "TEST_Stats_Show", "trackRefs": [1]}],
            "jingles": [],
            "vault": [],
        }
    }
    r = client.post(f"{BASE_URL}/api/shows", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["code"]


class TestShowStats:
    def test_stats_initial_zero(self, client, created_code):
        r = client.get(f"{BASE_URL}/api/shows/{created_code}/stats")
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == created_code
        assert body["opens"] == 0
        assert body["protected"] is False
        assert body["expires_at"]

    def test_opens_increment_on_get(self, client, created_code):
        # Open the show twice
        for _ in range(2):
            r = client.get(f"{BASE_URL}/api/shows/{created_code}")
            assert r.status_code == 200
        r = client.get(f"{BASE_URL}/api/shows/{created_code}/stats")
        assert r.status_code == 200
        body = r.json()
        assert body["opens"] == 2, f"expected 2 opens, got {body['opens']}"
        assert body["last_opened_at"]

    def test_stats_unknown_404(self, client):
        r = client.get(f"{BASE_URL}/api/shows/ZZZZZZ/stats")
        assert r.status_code == 404

    def test_stats_case_insensitive(self, client, created_code):
        r = client.get(f"{BASE_URL}/api/shows/{created_code.lower()}/stats")
        assert r.status_code == 200
        assert r.json()["code"] == created_code
