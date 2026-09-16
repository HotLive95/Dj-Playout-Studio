"""Backend regression tests for Hot Live 95 licensing endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = "hotlive95admin"
HDR = {"X-Admin-Token": ADMIN, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_key():
    """Create a key via admin, yield it, then delete."""
    r = requests.post(f"{API}/admin/keys", json={
        "dj": "TEST_DJ_Regression",
        "email": "delivered@resend.dev",
        "max_devices": 2,
    }, headers=HDR)
    assert r.status_code == 200, r.text
    data = r.json()
    key = data["key"]
    yield data
    requests.delete(f"{API}/admin/keys/{key}", headers=HDR)


class TestRoot:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert "Hot Live 95" in r.json().get("message", "")


class TestAdminAuth:
    def test_admin_requires_token(self):
        r = requests.get(f"{API}/admin/keys")
        assert r.status_code == 401

    def test_admin_wrong_token(self):
        r = requests.get(f"{API}/admin/keys", headers={"X-Admin-Token": "wrong"})
        assert r.status_code == 401


class TestKeyCreateList:
    def test_create_with_email_returns_email_sent(self, created_key):
        # email_sent flag exists (True or False acceptable per playbook)
        assert "email_sent" in created_key
        assert isinstance(created_key["email_sent"], bool)
        assert created_key["dj"] == "TEST_DJ_Regression"
        assert created_key["max_devices"] == 2
        assert created_key["active_devices"] == 0
        # key format XXXXX-XXXXX-XXXXX-XXXXX
        parts = created_key["key"].split("-")
        assert len(parts) == 4 and all(len(p) == 5 for p in parts)

    def test_list_contains_key_with_fields(self, created_key):
        r = requests.get(f"{API}/admin/keys", headers=HDR)
        assert r.status_code == 200
        keys = r.json()
        assert isinstance(keys, list)
        match = next((k for k in keys if k["key"] == created_key["key"]), None)
        assert match is not None
        for f in ["active_devices", "days_left", "expired", "auto_renew", "auto_renew_days", "email_sent_at"]:
            assert f in match, f"missing field {f}"


class TestActivateValidate:
    def test_activate_ok_and_cap_exceeded(self, created_key):
        key = created_key["key"]
        d1 = f"dev-{uuid.uuid4()}"
        d2 = f"dev-{uuid.uuid4()}"
        d3 = f"dev-{uuid.uuid4()}"
        r1 = requests.post(f"{API}/activate", json={"key": key, "device_id": d1})
        assert r1.status_code == 200 and r1.json()["status"] == "ok"
        r2 = requests.post(f"{API}/activate", json={"key": key, "device_id": d2})
        assert r2.json()["status"] == "ok"
        # third device should exceed cap of 2
        r3 = requests.post(f"{API}/activate", json={"key": key, "device_id": d3})
        assert r3.json()["status"] == "cap_exceeded"
        # validate ok for a registered device
        v = requests.post(f"{API}/validate", json={"key": key, "device_id": d1})
        assert v.json()["status"] == "ok"
        # validate not_registered for random device
        v2 = requests.post(f"{API}/validate", json={"key": key, "device_id": "no-such"})
        assert v2.json()["status"] == "not_registered"

    def test_activate_unknown_key(self):
        r = requests.post(f"{API}/activate", json={"key": "AAAAA-AAAAA-AAAAA-AAAAA", "device_id": "d1"})
        assert r.json()["status"] == "unknown"


class TestPublicStatus:
    def test_status_unknown(self):
        r = requests.post(f"{API}/status", json={"key": "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ"})
        assert r.status_code == 200
        assert r.json()["status"] == "unknown"

    def test_status_returns_summary(self, created_key):
        r = requests.post(f"{API}/status", json={"key": created_key["key"]})
        assert r.status_code == 200
        j = r.json()
        for f in ["status", "dj", "expires_at", "days_left", "active_devices", "devices", "max_devices"]:
            assert f in j
        assert j["dj"] == "TEST_DJ_Regression"


class TestRenewAutoRenew:
    def test_renew_days_variants(self, created_key):
        key = created_key["key"]
        for days in [30, 90, 365]:
            r = requests.post(f"{API}/admin/keys/{key}/renew", json={"days": days}, headers=HDR)
            assert r.status_code == 200, r.text
            assert r.json()["days"] == days
            assert r.json()["expires_at"]

    def test_auto_renew_toggle(self, created_key):
        key = created_key["key"]
        r = requests.post(f"{API}/admin/keys/{key}/auto-renew", json={"enabled": True, "days": 60}, headers=HDR)
        assert r.status_code == 200
        assert r.json()["auto_renew"] is True
        # verify persisted
        listed = requests.get(f"{API}/admin/keys", headers=HDR).json()
        m = next(k for k in listed if k["key"] == key)
        assert m["auto_renew"] is True
        assert m["auto_renew_days"] == 60
        # toggle off
        r2 = requests.post(f"{API}/admin/keys/{key}/auto-renew", json={"enabled": False}, headers=HDR)
        assert r2.json()["auto_renew"] is False

    def test_revoke_toggle_and_reflected_in_validate(self, created_key):
        key = created_key["key"]
        # ensure a device
        did = f"dev-{uuid.uuid4()}"
        requests.post(f"{API}/activate", json={"key": key, "device_id": did})
        r = requests.post(f"{API}/admin/keys/{key}/revoke", json={"revoked": True}, headers=HDR)
        assert r.json()["revoked"] is True
        v = requests.post(f"{API}/validate", json={"key": key, "device_id": did})
        assert v.json()["status"] == "revoked"
        # renew un-revokes
        rn = requests.post(f"{API}/admin/keys/{key}/renew", json={"days": 30}, headers=HDR)
        assert rn.status_code == 200
        v2 = requests.post(f"{API}/validate", json={"key": key, "device_id": did})
        assert v2.json()["status"] == "ok"


class TestSettingsAndExpiryCheck:
    def test_settings_persist(self):
        for d in [7, 14, 30]:
            r = requests.post(f"{API}/admin/settings", json={"alert_lead_days": d}, headers=HDR)
            assert r.status_code == 200
            assert r.json()["alert_lead_days"] == d
            g = requests.get(f"{API}/admin/settings", headers=HDR)
            assert g.json()["alert_lead_days"] == d

    def test_run_expiry_check(self):
        r = requests.post(f"{API}/admin/run-expiry-check", headers=HDR)
        assert r.status_code == 200
        j = r.json()
        for f in ["alerts_sent", "auto_renewed", "owner_email"]:
            assert f in j
        # OWNER_EMAIL is intentionally empty
        assert j["owner_email"] is None
        assert j["alerts_sent"] == 0


class TestDelete:
    def test_delete_key(self):
        # create separate key to delete
        r = requests.post(f"{API}/admin/keys", json={"dj": "TEST_ToDelete"}, headers=HDR)
        key = r.json()["key"]
        d = requests.delete(f"{API}/admin/keys/{key}", headers=HDR)
        assert d.status_code == 200
        # verify gone via status
        s = requests.post(f"{API}/status", json={"key": key})
        assert s.json()["status"] == "unknown"
