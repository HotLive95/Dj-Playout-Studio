"""Backend tests for Cloud Handoff /api/shows endpoints."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sample_payload():
    return {
        "app": "hotlive95",
        "kind": "studio",
        "tracks": [{"refId": 1, "id": "t1", "name": "Sample", "audio": ""}],
        "playlists": [{"name": "TEST_Show", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


class TestShowsAPI:
    def test_create_show_success(self, client, sample_payload):
        r = client.post(f"{BASE_URL}/api/shows", json={"payload": sample_payload})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data and "expires_at" in data and "size" in data
        assert re.fullmatch(r"[A-Z0-9]{6}", data["code"]), f"bad code {data['code']}"
        assert isinstance(data["size"], int) and data["size"] > 0
        pytest.share_code = data["code"]

    def test_get_show_success(self, client, sample_payload):
        code = pytest.share_code
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "payload" in body
        assert body["payload"]["app"] == "hotlive95"
        assert body["payload"]["playlists"][0]["name"] == "TEST_Show"

    def test_get_show_case_insensitive(self, client):
        code = pytest.share_code.lower()
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        assert r.status_code == 200

    def test_get_show_unknown_returns_404(self, client):
        r = client.get(f"{BASE_URL}/api/shows/ZZZZZZ")
        assert r.status_code == 404

    def test_create_show_missing_payload_400(self, client):
        r = client.post(f"{BASE_URL}/api/shows", json={"app": "hotlive95"})
        # FastAPI returns 422 when Pydantic validation fails
        assert r.status_code in (400, 422)
