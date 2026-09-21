"""Backend tests for the Open Alert Toggle (iteration 24).

Verifies POST /api/shows persists alert_on_open and that the first
GET /api/shows/{code} succeeds regardless of the toggle value.
Uses fake .invalid recipients so the Resend send fails silently.
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


def _payload():
    return {
        "app": "hotlive95",
        "kind": "studio",
        "tracks": [{"refId": 1, "id": "t1", "name": "TEST_alert_toggle", "audio": ""}],
        "playlists": [{"name": "TEST_alert_toggle_show", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


class TestAlertToggle:
    def test_create_with_alert_on_open_false(self, client):
        r = client.post(
            f"{BASE_URL}/api/shows",
            json={
                "payload": _payload(),
                "email": "fake-off@example.invalid",
                "alert_on_open": False,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data and len(data["code"]) == 6
        pytest.at_code_off = data["code"]

    def test_first_open_alert_false_no_crash(self, client):
        code = pytest.at_code_off
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        assert r.status_code == 200, r.text
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert s["opens"] == 1

    def test_create_with_alert_on_open_true_default(self, client):
        # alert_on_open not sent → defaults to True per ShareShowBody
        r = client.post(
            f"{BASE_URL}/api/shows",
            json={
                "payload": _payload(),
                "email": "fake-on@example.invalid",
            },
        )
        assert r.status_code == 200, r.text
        pytest.at_code_on = r.json()["code"]

    def test_first_open_alert_true_no_crash(self, client):
        code = pytest.at_code_on
        r = client.get(f"{BASE_URL}/api/shows/{code}")
        # Resend send to .invalid fails, but must be handled → 200.
        assert r.status_code == 200, r.text
        s = client.get(f"{BASE_URL}/api/shows/{code}/stats").json()
        assert s["opens"] == 1

    def test_create_with_alert_on_open_true_explicit(self, client):
        r = client.post(
            f"{BASE_URL}/api/shows",
            json={
                "payload": _payload(),
                "email": "fake-explicit@example.invalid",
                "alert_on_open": True,
            },
        )
        assert r.status_code == 200, r.text
        code = r.json()["code"]
        g = client.get(f"{BASE_URL}/api/shows/{code}")
        assert g.status_code == 200
