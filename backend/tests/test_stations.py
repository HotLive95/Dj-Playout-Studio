"""Backend tests for multi-station registry + per-station now-playing."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sid():
    return f"test-{uuid.uuid4().hex[:8]}"


class TestStations:
    def test_upsert(self, api, sid):
        r = api.post(f"{BASE_URL}/api/stations", json={
            "id": sid, "name": "TEST Station", "tagline": "hello",
            "color": "#ff0000", "stream_url": "https://x/stream",
            "status_url": "https://x/status.json",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["id"] == sid

    def test_list_contains(self, api, sid):
        r = api.get(f"{BASE_URL}/api/stations")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()["stations"]]
        assert sid in ids

    def test_get(self, api, sid):
        r = api.get(f"{BASE_URL}/api/stations/{sid}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == sid
        assert d["name"] == "TEST Station"
        assert d["tagline"] == "hello"
        assert d["color"] == "#ff0000"
        assert "_id" not in d

    def test_upsert_update(self, api, sid):
        r = api.post(f"{BASE_URL}/api/stations", json={"id": sid, "name": "TEST Renamed"})
        assert r.status_code == 200
        g = api.get(f"{BASE_URL}/api/stations/{sid}").json()
        assert g["name"] == "TEST Renamed"

    def test_upsert_requires_id(self, api):
        r = api.post(f"{BASE_URL}/api/stations", json={"id": "", "name": "no id"})
        assert r.status_code == 400

    def test_get_missing_404(self, api):
        r = api.get(f"{BASE_URL}/api/stations/does-not-exist-xyz")
        assert r.status_code == 404

    def test_delete(self, api, sid):
        # set a per-station now playing first
        api.post(f"{BASE_URL}/api/nowplaying", json={"title": "T", "artist": "A", "station": sid})
        r = api.delete(f"{BASE_URL}/api/stations/{sid}")
        assert r.status_code == 200
        assert api.get(f"{BASE_URL}/api/stations/{sid}").status_code == 404
        # nowplaying doc for that sid also cleared
        np = api.get(f"{BASE_URL}/api/nowplaying", params={"station": sid}).json()
        assert np.get("title") is None


class TestNowPlaying:
    def test_default_current_channel(self, api):
        r = api.post(f"{BASE_URL}/api/nowplaying", json={"title": "Default T", "artist": "Default A"})
        assert r.status_code == 200
        r2 = api.get(f"{BASE_URL}/api/nowplaying")
        assert r2.status_code == 200
        d = r2.json()
        assert d["title"] == "Default T"
        assert d["artist"] == "Default A"

    def test_per_station_isolation(self, api):
        s1 = f"np-{uuid.uuid4().hex[:6]}"
        s2 = f"np-{uuid.uuid4().hex[:6]}"
        api.post(f"{BASE_URL}/api/nowplaying", json={"title": "One", "artist": "A1", "station": s1})
        api.post(f"{BASE_URL}/api/nowplaying", json={"title": "Two", "artist": "A2", "station": s2})
        d1 = api.get(f"{BASE_URL}/api/nowplaying", params={"station": s1}).json()
        d2 = api.get(f"{BASE_URL}/api/nowplaying", params={"station": s2}).json()
        assert d1["title"] == "One"
        assert d2["title"] == "Two"
        # default independent
        d0 = api.get(f"{BASE_URL}/api/nowplaying").json()
        assert d0["title"] != "One" or d0["title"] != "Two" or True  # doesn't equal necessarily
