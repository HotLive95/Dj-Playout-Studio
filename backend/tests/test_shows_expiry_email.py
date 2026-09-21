"""Backend tests for cloud handoff expiry email endpoint + process_show_expiry.

Covers:
- POST /api/shows accepts optional `email` field and still returns a share code.
- POST /api/admin/run-show-expiry with X-Admin-Token returns {status:'ok', show_reminders:N}.
- Same endpoint without / with a bad admin token returns 401.
- process_show_expiry() picks up docs whose expires_at is within
  SHOW_EXPIRY_ALERT_DAYS and flips expiry_reminded=True (delivery is mocked
  so we NEVER hit the live Resend key).
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dj-playout-studio.preview.emergentagent.com").rstrip("/")
ADMIN_TOKEN = "1972Hotlive95dj1108**"


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
        "playlists": [{"name": "TEST_ExpiryShow", "trackRefs": [1]}],
        "jingles": [],
        "vault": [],
    }


# --- HTTP-level tests -------------------------------------------------------
class TestShowsCreateWithEmail:
    def test_create_show_with_email_returns_code(self, client):
        r = client.post(
            f"{BASE_URL}/api/shows",
            json={"payload": _payload(), "email": "test-fake@example.invalid"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data and len(data["code"]) == 6
        assert "expires_at" in data
        # email is stored server-side; response is intentionally unchanged
        assert "email" not in data or data.get("email") is None or isinstance(data.get("email"), str)


class TestAdminRunShowExpiry:
    def test_missing_token_401(self, client):
        r = requests.post(f"{BASE_URL}/api/admin/run-show-expiry")
        assert r.status_code == 401

    def test_bad_token_401(self, client):
        r = requests.post(
            f"{BASE_URL}/api/admin/run-show-expiry",
            headers={"X-Admin-Token": "wrong"},
        )
        assert r.status_code == 401

    def test_good_token_returns_ok(self, client):
        r = requests.post(
            f"{BASE_URL}/api/admin/run-show-expiry",
            headers={"X-Admin-Token": ADMIN_TOKEN},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert "show_reminders" in data
        assert isinstance(data["show_reminders"], int)


# --- process_show_expiry unit test (with mocked email sender) --------------
class TestProcessShowExpiryUnit:
    def test_process_show_expiry_flags_reminded(self):
        """Insert a fake shared_shows doc expiring in 2 days and confirm
        process_show_expiry marks it reminded exactly once when email sender
        returns True."""
        import sys
        sys.path.insert(0, "/app/backend")
        import server  # noqa: E402

        # Rebind server.db to a Motor client on THIS event loop, otherwise the
        # module-level client (created at import time) is attached to a
        # different loop and Motor raises "attached to a different loop".
        from motor.motor_asyncio import AsyncIOMotorClient
        fresh_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        server.db = fresh_client[os.environ["DB_NAME"]]

        async def _run():
            code = "TSTX99"
            # Clean any stale doc
            await server.db.shared_shows.delete_many({"code": code})
            doc = {
                "code": code,
                "file_id": None,
                "size": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
                "protected": False,
                "email": "fake-test-recipient@example.invalid",
                "expiry_reminded": False,
            }
            await server.db.shared_shows.insert_one(doc)
            try:
                with patch.object(server, "send_show_expiry_email", new=AsyncMock(return_value=True)) as mocked:
                    res = await server.process_show_expiry()
                    assert res["show_reminders"] >= 1
                    mocked.assert_awaited()  # ensure sender was called (mocked, no real email)

                after = await server.db.shared_shows.find_one({"code": code})
                assert after["expiry_reminded"] is True

                # Second pass should NOT resend
                with patch.object(server, "send_show_expiry_email", new=AsyncMock(return_value=True)) as mocked2:
                    await server.process_show_expiry()
                    # our specific doc should not be re-emailed
                    calls = [c for c in mocked2.await_args_list if c.args and c.args[0].get("code") == code]
                    assert calls == []
            finally:
                await server.db.shared_shows.delete_many({"code": code})

        asyncio.get_event_loop().run_until_complete(_run()) if False else asyncio.run(_run())
