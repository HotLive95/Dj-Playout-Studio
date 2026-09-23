from fastapi import FastAPI, APIRouter, Header, HTTPException, UploadFile, File, Request, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo import ReturnDocument
import os
import asyncio
import logging
import random
import json
import secrets
import hashlib
import hmac
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

import resend
import qrcode
import io
import base64
import urllib.parse
import urllib.request

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '1972Hotlive95dj1108**')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
RENEW_DAYS = int(os.environ.get('RENEW_DAYS', '90'))
OWNER_EMAIL = os.environ.get('OWNER_EMAIL', '')
EXPIRY_ALERT_DAYS = int(os.environ.get('EXPIRY_ALERT_DAYS', '7'))
PUBLIC_APP_URL = os.environ.get('PUBLIC_APP_URL', '').rstrip('/')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- License key algorithm (matches frontend/src/lib/license.js) ----------
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
SECRET = "HotLive95::Detroit::AIRadio::v1::Sig"


def _fnv(s: str) -> int:
    x = 0x811c9dc5
    for ch in s:
        x ^= ord(ch)
        x = (x * 0x01000193) & 0xFFFFFFFF
    return x


def _enc5(n: int) -> str:
    out = ""
    for _ in range(5):
        out = ALPHABET[n & 31] + out
        n //= 32
    return out


def _checksum5(body: str) -> str:
    a = _fnv(SECRET + "|" + body)
    b = _fnv(body + "|" + SECRET)
    return _enc5((a ^ (b >> 7)) & 0xFFFFFFFF)


def normalize_key(raw: str) -> str:
    up = (raw or "").upper()
    up = up.replace("O", "0").replace("I", "1").replace("L", "1").replace("U", "V")
    return "".join(c for c in up if c in ALPHABET)


def generate_key() -> str:
    body = "".join(random.choice(ALPHABET) for _ in range(15))
    full = body + _checksum5(body)
    return "-".join(full[i:i + 5] for i in range(0, 20, 5))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_expired(expires_at: Optional[str]) -> bool:
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > exp
    except Exception:
        return False


def days_left(expires_at: Optional[str]):
    if not expires_at:
        return None
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        delta = exp - datetime.now(timezone.utc)
        return int(delta.total_seconds() // 86400)
    except Exception:
        return None


def extend_expiry(current: Optional[str], days: int) -> str:
    now = datetime.now(timezone.utc)
    base = now
    if current:
        try:
            exp = datetime.fromisoformat(current)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now:
                base = exp
        except Exception:
            base = now
    return (base + timedelta(days=days)).isoformat()


SETTINGS_ID = "license_settings"


async def get_alert_lead_days() -> int:
    doc = await db.settings.find_one({"_id": SETTINGS_ID})
    if doc and doc.get("alert_lead_days"):
        return int(doc["alert_lead_days"])
    return EXPIRY_ALERT_DAYS


def public_view(doc: dict) -> dict:
    devices = doc.get("devices", [])
    return {
        "key": doc.get("key"),
        "dj": doc.get("dj"),
        "email": doc.get("email"),
        "max_devices": doc.get("max_devices", 1),
        "expires_at": doc.get("expires_at"),
        "revoked": bool(doc.get("revoked")),
        "devices": devices,
        "active_devices": len(devices),
        "days_left": days_left(doc.get("expires_at")),
        "expired": is_expired(doc.get("expires_at")),
        "email_sent_at": doc.get("email_sent_at"),
        "last_activated_at": doc.get("last_activated_at"),
        "auto_renew": bool(doc.get("auto_renew")),
        "auto_renew_days": doc.get("auto_renew_days") or RENEW_DAYS,
        "created_at": doc.get("created_at"),
    }


def status_url(key: str) -> str:
    if not PUBLIC_APP_URL:
        return ""
    return f"{PUBLIC_APP_URL}/license?key={urllib.parse.quote(key)}"


def make_qr_png_b64(data: str) -> str:
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0a0a0c", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def welcome_html(dj: str, key: str, expires_at: Optional[str]) -> str:
    exp_line = ""
    if expires_at:
        exp_line = f'<tr><td style="padding:4px 0;color:#9aa0a6;font-size:13px;">Valid through</td><td style="padding:4px 0;color:#ff6a2b;font-size:13px;text-align:right;">{str(expires_at)[:10]}</td></tr>'
    url = status_url(key)
    qr_block = ""
    if url:
        qr_block = f"""
            <div style="text-align:center;margin:20px 0 4px;">
              <div style="color:#9aa0a6;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Scan to check your license anytime</div>
              <img src="cid:licenseqr" alt="License QR" width="150" height="150" style="border-radius:12px;background:#fff;padding:8px;" />
              <div style="margin-top:14px;">
                <a href="{url}" style="display:inline-block;background:linear-gradient(135deg,#ff5a1f,#ff1744);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;">Open my license page</a>
              </div>
              <div style="color:#6b7280;font-size:11px;margin-top:10px;word-break:break-all;">{url}</div>
            </div>
        """
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#121216;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
          <tr><td style="background:linear-gradient(90deg,#ff5a1f,#ff1744);padding:22px 28px;">
            <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">HOT LIVE 95</div>
            <div style="color:#ffe;opacity:.85;font-size:11px;letter-spacing:3px;">DETROIT · A.I. RADIO</div>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="color:#f4f4f5;font-size:16px;margin:0 0 12px;">Welcome to the booth, <b>{dj}</b>! 🎙️</p>
            <p style="color:#c9ccd1;font-size:14px;line-height:1.6;margin:0 0 20px;">Your DJ Playout Studio license is ready. Open the app, enter the key below on the activation screen, and you're live.</p>
            <div style="background:#0a0a0c;border:1px dashed #ff5a1f;border-radius:10px;padding:16px;text-align:center;margin:0 0 8px;">
              <div style="color:#9aa0a6;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Your activation key</div>
              <div style="color:#ffb020;font-size:22px;font-weight:700;letter-spacing:4px;font-family:monospace;">{key}</div>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{exp_line}</table>
            {qr_block}
            <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:20px 0 0;">Keep this key private — it's tied to your account and can be capped to a limited number of computers. Questions? Just reply to this email.</p>
          </td></tr>
          <tr><td style="background:#0a0a0c;padding:16px 28px;border-top:1px solid #26262e;">
            <div style="color:#6b7280;font-size:11px;">© Hot Live 95 Detroit · A.I. Radio</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """


async def send_welcome_email(email: str, dj: str, key: str, expires_at: Optional[str]) -> bool:
    if not RESEND_API_KEY or not email:
        return False
    params = {
        "from": SENDER_EMAIL,
        "to": [email],
        "subject": f"🎙️ Your Hot Live 95 DJ license is ready, {dj}",
        "html": welcome_html(dj, key, expires_at),
    }
    url = status_url(key)
    if url:
        params["attachments"] = [{
            "filename": "license-qr.png",
            "content": make_qr_png_b64(url),
            "content_id": "licenseqr",
            "content_type": "image/png",
        }]
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Resend email failed: {e}")
        return False


def expiry_alert_html(dj: str, key: str, expires_at: Optional[str], dl: int) -> str:
    when = "today" if dl <= 0 else (f"in {dl} day" + ("" if dl == 1 else "s"))
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#121216;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
          <tr><td style="background:linear-gradient(90deg,#ff5a1f,#ff1744);padding:22px 28px;">
            <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">HOT LIVE 95</div>
            <div style="color:#ffe;opacity:.85;font-size:11px;letter-spacing:3px;">LICENSE EXPIRY ALERT</div>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="color:#f4f4f5;font-size:16px;margin:0 0 12px;">Heads up — a DJ license expires <b style="color:#ffb020;">{when}</b>.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
              <tr><td style="padding:4px 0;color:#9aa0a6;font-size:13px;">DJ</td><td style="padding:4px 0;color:#f4f4f5;font-size:13px;text-align:right;">{dj}</td></tr>
              <tr><td style="padding:4px 0;color:#9aa0a6;font-size:13px;">Key</td><td style="padding:4px 0;color:#ffb020;font-size:13px;text-align:right;font-family:monospace;">{key}</td></tr>
              <tr><td style="padding:4px 0;color:#9aa0a6;font-size:13px;">Expires</td><td style="padding:4px 0;color:#ff6a2b;font-size:13px;text-align:right;">{str(expires_at)[:10]}</td></tr>
            </table>
            <p style="color:#c9ccd1;font-size:14px;line-height:1.6;margin:0;">Open the Key Manager and tap the renew (↻) button to extend it another season so this DJ never drops off-air mid-show.</p>
          </td></tr>
          <tr><td style="background:#0a0a0c;padding:16px 28px;border-top:1px solid #26262e;">
            <div style="color:#6b7280;font-size:11px;">© Hot Live 95 Detroit · A.I. Radio</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """


async def send_owner_expiry_alert(doc: dict, dl: int) -> bool:
    if not RESEND_API_KEY or not OWNER_EMAIL:
        return False
    params = {
        "from": SENDER_EMAIL,
        "to": [OWNER_EMAIL],
        "subject": f"⏳ {doc.get('dj')}'s Hot Live 95 key expires in {dl} day(s)",
        "html": expiry_alert_html(doc.get("dj"), doc.get("key"), doc.get("expires_at"), dl),
    }
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Expiry alert email failed: {e}")
        return False


async def send_owner_autorenew(doc: dict, days: int, new_exp: str) -> bool:
    if not RESEND_API_KEY or not OWNER_EMAIL:
        return False
    html = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#121216;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#ff5a1f,#ff1744);padding:22px 28px;"><div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">HOT LIVE 95</div><div style="color:#ffe;opacity:.85;font-size:11px;letter-spacing:3px;">AUTO-RENEWED</div></td></tr>
        <tr><td style="padding:28px;"><p style="color:#f4f4f5;font-size:16px;margin:0 0 12px;"><b>{doc.get('dj')}</b>'s license auto-renewed for another <b style="color:#ffb020;">{days} days</b>.</p>
        <p style="color:#c9ccd1;font-size:14px;line-height:1.6;margin:0;">New expiry: <b style="color:#ff6a2b;">{str(new_exp)[:10]}</b>. No action needed — this DJ stays on-air.</p></td></tr>
        <tr><td style="background:#0a0a0c;padding:16px 28px;border-top:1px solid #26262e;"><div style="color:#6b7280;font-size:11px;">© Hot Live 95 Detroit · A.I. Radio</div></td></tr>
      </table></td></tr></table>
    """
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL, "to": [OWNER_EMAIL],
            "subject": f"♻️ {doc.get('dj')}'s Hot Live 95 key auto-renewed {days} days",
            "html": html,
        })
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Auto-renew email failed: {e}")
        return False


async def process_expiry() -> dict:
    """Daily pass: auto-renew flagged keys nearing expiry; email owner for the rest."""
    lead = await get_alert_lead_days()
    alerts = 0
    renews = 0
    # Materialize the matching docs first: process_expiry mutates expires_at, and
    # iterating a live cursor while updating matched docs risks re-yielding a moved
    # document (double auto-renew).
    docs = await db.licenses.find({"revoked": {"$ne": True}, "expires_at": {"$nin": [None, ""]}}).to_list(length=1000)
    for doc in docs:
        dl = days_left(doc.get("expires_at"))
        if dl is None or dl > lead:
            continue
        if doc.get("auto_renew"):
            days = int(doc.get("auto_renew_days") or RENEW_DAYS)
            new_exp = extend_expiry(doc.get("expires_at"), days)
            await db.licenses.update_one(
                {"key_norm": doc["key_norm"]},
                {"$set": {"expires_at": new_exp, "expiry_alert_for": None}},
            )
            await send_owner_autorenew(doc, days, new_exp)
            renews += 1
            continue
        if dl < 0:
            continue
        if doc.get("expiry_alert_for") == doc.get("expires_at"):
            continue
        if OWNER_EMAIL and RESEND_API_KEY and await send_owner_expiry_alert(doc, dl):
            await db.licenses.update_one(
                {"key_norm": doc["key_norm"]},
                {"$set": {"expiry_alert_for": doc.get("expires_at")}},
            )
            alerts += 1
    return {"alerts": alerts, "renews": renews}


# ---------- Public activation endpoints ----------
class ActivateBody(BaseModel):
    key: str
    device_id: str
    dj: Optional[str] = None


@api_router.post("/activate")
async def activate(body: ActivateBody):
    kn = normalize_key(body.key)
    doc = await db.licenses.find_one({"key_norm": kn})
    if not doc:
        return {"status": "unknown"}
    if doc.get("revoked"):
        return {"status": "revoked"}
    if is_expired(doc.get("expires_at")):
        return {"status": "expired"}
    devices = doc.get("devices", [])
    known = next((d for d in devices if d["device_id"] == body.device_id), None)
    if not known:
        if len(devices) >= int(doc.get("max_devices", 1)):
            return {"status": "cap_exceeded", "max_devices": doc.get("max_devices", 1)}
        devices.append({"device_id": body.device_id, "activated_at": now_iso()})
        await db.licenses.update_one({"key_norm": kn}, {"$set": {"devices": devices, "last_activated_at": now_iso()}})
    else:
        await db.licenses.update_one({"key_norm": kn}, {"$set": {"last_activated_at": now_iso()}})
    return {"status": "ok", "dj": doc.get("dj"), "expires_at": doc.get("expires_at")}


class ValidateBody(BaseModel):
    key: str
    device_id: str


class StatusBody(BaseModel):
    key: str
    device_id: Optional[str] = None


@api_router.post("/status")
async def license_status(body: StatusBody):
    """Public DJ self-serve lookup — no admin token; reveals only summary info."""
    kn = normalize_key(body.key)
    doc = await db.licenses.find_one({"key_norm": kn})
    if not doc:
        return {"status": "unknown"}
    devices = doc.get("devices", [])
    return {
        "status": "revoked" if doc.get("revoked") else ("expired" if is_expired(doc.get("expires_at")) else "ok"),
        "dj": doc.get("dj"),
        "revoked": bool(doc.get("revoked")),
        "expired": is_expired(doc.get("expires_at")),
        "expires_at": doc.get("expires_at"),
        "days_left": days_left(doc.get("expires_at")),
        "max_devices": doc.get("max_devices", 1),
        "active_devices": len(devices),
        "devices": [
            {
                "activated_at": d.get("activated_at"),
                "this_device": bool(body.device_id and d.get("device_id") == body.device_id),
            }
            for d in devices
        ],
    }


@api_router.post("/validate")
async def validate(body: ValidateBody):
    kn = normalize_key(body.key)
    doc = await db.licenses.find_one({"key_norm": kn})
    if not doc:
        return {"status": "unknown"}
    if doc.get("revoked"):
        return {"status": "revoked"}
    if is_expired(doc.get("expires_at")):
        return {"status": "expired"}
    known = any(d["device_id"] == body.device_id for d in doc.get("devices", []))
    return {"status": "ok" if known else "not_registered", "expires_at": doc.get("expires_at")}


# ---------- Admin endpoints ----------
def check_admin(token: Optional[str]):
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")


class CreateKeyBody(BaseModel):
    dj: Optional[str] = "Unassigned"
    email: Optional[str] = None
    max_devices: int = 1
    expires_at: Optional[str] = None


@api_router.post("/admin/keys")
async def admin_create_key(body: CreateKeyBody, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    key = generate_key()
    doc = {
        "key": key,
        "key_norm": normalize_key(key),
        "dj": body.dj or "Unassigned",
        "email": (body.email or "").strip() or None,
        "max_devices": max(1, int(body.max_devices)),
        "expires_at": body.expires_at,
        "revoked": False,
        "devices": [],
        "email_sent_at": None,
        "last_activated_at": None,
        "created_at": now_iso(),
    }
    # Persist FIRST so a slow/hanging Resend call never delays or loses the key.
    await db.licenses.insert_one(doc)
    sent = await send_welcome_email(doc["email"], doc["dj"], key, doc["expires_at"])
    if sent:
        await db.licenses.update_one({"key_norm": doc["key_norm"]}, {"$set": {"email_sent_at": now_iso()}})
        doc["email_sent_at"] = now_iso()
    out = public_view(doc)
    out["email_sent"] = sent
    return out


@api_router.get("/admin/keys")
async def admin_list_keys(x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    docs = await db.licenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [public_view(d) for d in docs]


class RevokeBody(BaseModel):
    revoked: bool = True


@api_router.post("/admin/keys/{key}/revoke")
async def admin_revoke(key: str, body: RevokeBody, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    r = await db.licenses.update_one({"key_norm": normalize_key(key)}, {"$set": {"revoked": body.revoked}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"status": "ok", "revoked": body.revoked}


class RenewBody(BaseModel):
    days: Optional[int] = None


@api_router.post("/admin/keys/{key}/renew")
async def admin_renew(key: str, body: RenewBody, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    doc = await db.licenses.find_one({"key_norm": normalize_key(key)})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    days = int(body.days or RENEW_DAYS)
    new_exp = extend_expiry(doc.get("expires_at"), days)
    await db.licenses.update_one(
        {"key_norm": normalize_key(key)},
        {"$set": {"expires_at": new_exp, "revoked": False, "expiry_alert_for": None}},
    )
    return {"status": "ok", "expires_at": new_exp, "days": days}


class AutoRenewBody(BaseModel):
    enabled: bool = True
    days: Optional[int] = None


@api_router.post("/admin/keys/{key}/auto-renew")
async def admin_auto_renew(key: str, body: AutoRenewBody, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    upd = {"auto_renew": bool(body.enabled)}
    if body.days:
        upd["auto_renew_days"] = int(body.days)
    r = await db.licenses.update_one({"key_norm": normalize_key(key)}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"status": "ok", "auto_renew": bool(body.enabled), "auto_renew_days": body.days or RENEW_DAYS}


class SettingsBody(BaseModel):
    alert_lead_days: int = 7


@api_router.get("/admin/settings")
async def admin_get_settings(x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    lead = await get_alert_lead_days()
    return {"alert_lead_days": lead, "renew_days": RENEW_DAYS}


@api_router.post("/admin/settings")
async def admin_set_settings(body: SettingsBody, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$set": {"alert_lead_days": max(1, int(body.alert_lead_days))}},
        upsert=True,
    )
    return {"status": "ok", "alert_lead_days": max(1, int(body.alert_lead_days))}


@api_router.post("/admin/keys/{key}/resend-email")
async def admin_resend_email(key: str, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    doc = await db.licenses.find_one({"key_norm": normalize_key(key)})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    if not doc.get("email"):
        return {"status": "no_email"}
    sent = await send_welcome_email(doc["email"], doc.get("dj"), doc.get("key"), doc.get("expires_at"))
    if sent:
        await db.licenses.update_one({"key_norm": normalize_key(key)}, {"$set": {"email_sent_at": now_iso()}})
    return {"status": "ok" if sent else "failed", "email_sent": sent}


@api_router.delete("/admin/keys/{key}/devices/{device_id}")
async def admin_free_device(key: str, device_id: str, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    doc = await db.licenses.find_one({"key_norm": normalize_key(key)})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    devices = [d for d in doc.get("devices", []) if d["device_id"] != device_id]
    await db.licenses.update_one({"key_norm": normalize_key(key)}, {"$set": {"devices": devices}})
    return {"status": "ok", "devices": devices}


@api_router.delete("/admin/keys/{key}")
async def admin_delete_key(key: str, x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    await db.licenses.delete_one({"key_norm": normalize_key(key)})
    return {"status": "ok"}


@api_router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe a recorded voice take to text (OpenAI whisper-1 via Emergent key)."""
    import tempfile
    from emergentintegrations.llm.openai import OpenAISpeechToText

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Transcription not configured")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio too large (max 25MB)")
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        stt = OpenAISpeechToText(api_key=key)
        with open(tmp_path, "rb") as f:
            resp = await stt.transcribe(file=f, model="whisper-1", response_format="text")
        text = resp if isinstance(resp, str) else getattr(resp, "text", str(resp))
        return {"text": (text or "").strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@api_router.get("/")
async def root():
    return {"message": "Hot Live 95 licensing service"}


class NowPlaying(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    art: Optional[str] = None
    next_title: Optional[str] = None
    next_artist: Optional[str] = None
    next_art: Optional[str] = None


@api_router.get("/nowplaying")
async def get_now_playing():
    doc = await db.nowplaying.find_one({"_id": "current"})
    if not doc:
        return {"title": None, "artist": None, "art": None, "updated_at": None,
                "next_title": None, "next_artist": None, "next_art": None}
    return {
        "title": doc.get("title"),
        "artist": doc.get("artist"),
        "art": doc.get("art"),
        "updated_at": doc.get("updated_at"),
        "next_title": doc.get("next_title"),
        "next_artist": doc.get("next_artist"),
        "next_art": doc.get("next_art"),
    }


@api_router.post("/nowplaying")
async def set_now_playing(payload: NowPlaying):
    doc = {
        "title": payload.title,
        "artist": payload.artist,
        "art": payload.art,
        "next_title": payload.next_title,
        "next_artist": payload.next_artist,
        "next_art": payload.next_art,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.nowplaying.update_one({"_id": "current"}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api_router.post("/admin/run-expiry-check")
async def admin_run_expiry_check(x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    res = await process_expiry()
    return {"status": "ok", "alerts_sent": res["alerts"], "auto_renewed": res["renews"], "owner_email": OWNER_EMAIL or None}


# ---------- Cloud Handoff: share a whole show via a short code/link ----------
SHOW_MAX_BYTES = int(os.environ.get('SHOW_MAX_MB', '500')) * 1024 * 1024  # default 500 MB cap
SHOW_UPLOAD_CHUNK = 5 * 1024 * 1024  # 5 MB chunks for the resumable browser upload
SHOW_TTL_DAYS = 30
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
_shows_fs = AsyncIOMotorGridFSBucket(db, bucket_name="shows")

# Optional per-show PIN (scrypt + server-side pepper). A short PIN is a
# convenience gate, not real auth — pair with online rate-limiting + HTTPS.
_PIN_PEPPER = bytes.fromhex(os.environ.get('SHOW_PIN_PEPPER', secrets.token_hex(32)))
_SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1, "dklen": 32}
PIN_MAX_ATTEMPTS = 6
PIN_WINDOW_SEC = 600


def _gen_code(n: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def _valid_pin(pin: str) -> bool:
    return bool(pin) and pin.isascii() and pin.isdigit() and 4 <= len(pin) <= 6


def _peppered(pin: str) -> bytes:
    return hmac.new(_PIN_PEPPER, pin.encode("ascii"), hashlib.sha256).digest()


def make_pin_record(pin: str) -> dict:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(_peppered(pin), salt=salt, maxmem=128 * 1024 * 1024, **_SCRYPT)
    return {
        "pin_hash": base64.b64encode(derived).decode("ascii"),
        "pin_salt": base64.b64encode(salt).decode("ascii"),
    }


def verify_pin(pin: str, rec: dict) -> bool:
    try:
        if not _valid_pin(pin):
            return False
        salt = base64.b64decode(rec["pin_salt"])
        expected = base64.b64decode(rec["pin_hash"])
        actual = hashlib.scrypt(_peppered(pin), salt=salt, maxmem=128 * 1024 * 1024, **_SCRYPT)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


async def _pin_attempt_ok(code: str, ip: str) -> bool:
    key = f"{code}:{ip}"
    now = datetime.now(timezone.utc)
    doc = await db.pin_attempts.find_one({"_id": key})
    if not doc or is_expired(doc.get("window_ends")):
        await db.pin_attempts.update_one(
            {"_id": key},
            {"$set": {"count": 1, "window_ends": (now + timedelta(seconds=PIN_WINDOW_SEC)).isoformat()}},
            upsert=True,
        )
        return True
    if doc.get("count", 0) >= PIN_MAX_ATTEMPTS:
        return False
    await db.pin_attempts.update_one({"_id": key}, {"$inc": {"count": 1}})
    return True


class ShareShowBody(BaseModel):
    payload: dict
    pin: Optional[str] = None
    email: Optional[str] = None
    alert_on_open: Optional[bool] = True


SHOW_EXPIRY_ALERT_DAYS = int(os.environ.get('SHOW_EXPIRY_ALERT_DAYS', '5'))


async def send_show_expiry_email(doc: dict) -> bool:
    email = doc.get("email")
    if not RESEND_API_KEY or not email:
        return False
    code = doc.get("code")
    dl = days_left(doc.get("expires_at"))
    link = f"{PUBLIC_APP_URL}/show?code={code}" if PUBLIC_APP_URL else f"code {code}"
    html = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#121216;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#ff5a1f,#ff1744);padding:22px 28px;"><div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">HOT LIVE 95</div><div style="color:#ffe;opacity:.85;font-size:11px;letter-spacing:3px;">CLOUD HANDOFF EXPIRING</div></td></tr>
        <tr><td style="padding:28px;"><p style="color:#f4f4f5;font-size:16px;margin:0 0 12px;">Your cloud share link <b style="color:#ffb020;">{code}</b> expires in <b>{dl} day(s)</b>.</p>
        <p style="color:#c9ccd1;font-size:14px;line-height:1.6;margin:0 0 16px;">Re-share it or tap <b>Extend 30 days</b> in the studio to keep it alive.</p>
        <p style="color:#c9ccd1;font-size:13px;margin:0;">Link: <a href="{link}" style="color:#ff6a2b;">{link}</a></p></td></tr>
        <tr><td style="background:#0a0a0c;padding:16px 28px;border-top:1px solid #26262e;"><div style="color:#6b7280;font-size:11px;">© Hot Live 95 Detroit · A.I. Radio</div></td></tr>
      </table></td></tr></table>
    """
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL, "to": [email],
            "subject": f"⏳ Your Hot Live 95 share link {code} expires in {dl} day(s)",
            "html": html,
        })
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Show expiry email failed: {e}")
        return False


async def send_show_open_email(doc: dict) -> bool:
    email = doc.get("email")
    if not RESEND_API_KEY or not email:
        return False
    code = doc.get("code")
    html = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#121216;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#ff5a1f,#ff1744);padding:22px 28px;"><div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">HOT LIVE 95</div><div style="color:#ffe;opacity:.85;font-size:11px;letter-spacing:3px;">HANDOFF OPENED</div></td></tr>
        <tr><td style="padding:28px;"><p style="color:#f4f4f5;font-size:16px;margin:0 0 12px;">Good news — your cloud handoff <b style="color:#3aa0ff;">{code}</b> was just opened by a co-host for the first time. 🎧</p>
        <p style="color:#c9ccd1;font-size:14px;line-height:1.6;margin:0;">They now have your full show loaded in their studio.</p></td></tr>
        <tr><td style="background:#0a0a0c;padding:16px 28px;border-top:1px solid #26262e;"><div style="color:#6b7280;font-size:11px;">© Hot Live 95 Detroit · A.I. Radio</div></td></tr>
      </table></td></tr></table>
    """
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL, "to": [email],
            "subject": f"🎧 Your Hot Live 95 handoff {code} was just opened",
            "html": html,
        })
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Show open email failed: {e}")
        return False


async def process_show_expiry() -> dict:
    """Daily pass: email the sender once when a cloud share link nears expiry."""
    sent = 0
    docs = await db.shared_shows.find({"email": {"$nin": [None, ""]}, "expiry_reminded": {"$ne": True}}).to_list(length=1000)
    for doc in docs:
        dl = days_left(doc.get("expires_at"))
        if dl is None or dl < 0 or dl > SHOW_EXPIRY_ALERT_DAYS:
            continue
        if await send_show_expiry_email(doc):
            await db.shared_shows.update_one({"code": doc["code"]}, {"$set": {"expiry_reminded": True}})
            sent += 1
    return {"show_reminders": sent}


@api_router.post("/shows")
async def create_show(body: ShareShowBody):
    raw = json.dumps(body.payload).encode("utf-8")
    if len(raw) > SHOW_MAX_BYTES:
        mb = len(raw) / (1024 * 1024)
        cap = SHOW_MAX_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Show is too large ({mb:.0f} MB). The cloud link limit is {cap} MB — use Save Playlist to a file instead.")
    pin_rec = None
    if body.pin:
        if not _valid_pin(body.pin):
            raise HTTPException(status_code=422, detail="PIN must be 4-6 digits.")
        pin_rec = await run_in_threadpool(make_pin_record, body.pin)
    code = _gen_code()
    for _ in range(6):
        if not await db.shared_shows.find_one({"code": code}):
            break
        code = _gen_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SHOW_TTL_DAYS)
    file_id = await _shows_fs.upload_from_stream(code, raw)
    doc = {
        "code": code,
        "file_id": file_id,
        "size": len(raw),
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "protected": bool(pin_rec),
        "email": (body.email or "").strip() or None,
        "alert_on_open": bool(body.alert_on_open),
        "expiry_reminded": False,
    }
    if pin_rec:
        doc.update(pin_rec)
    await db.shared_shows.insert_one(doc)
    return {"code": code, "expires_at": expires.isoformat(), "size": len(raw), "protected": bool(pin_rec)}


# ---------- Chunked (resumable) upload so large 500 MB shares go through the browser ----------
class ShowUploadInit(BaseModel):
    total_size: int
    total_chunks: int


class ShowUploadComplete(BaseModel):
    pin: Optional[str] = None
    email: Optional[str] = None
    alert_on_open: Optional[bool] = True


async def _finalize_show(raw: bytes, pin, email, alert_on_open):
    if len(raw) > SHOW_MAX_BYTES:
        mb = len(raw) / (1024 * 1024)
        cap = SHOW_MAX_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Show is too large ({mb:.0f} MB). The cloud link limit is {cap} MB — use Save Playlist to a file instead.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="The uploaded show was corrupt or incomplete. Please try again.")
    pin_rec = None
    if pin:
        if not _valid_pin(pin):
            raise HTTPException(status_code=422, detail="PIN must be 4-6 digits.")
        pin_rec = await run_in_threadpool(make_pin_record, pin)
    code = _gen_code()
    for _ in range(6):
        if not await db.shared_shows.find_one({"code": code}):
            break
        code = _gen_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SHOW_TTL_DAYS)
    file_id = await _shows_fs.upload_from_stream(code, raw)
    doc = {
        "code": code,
        "file_id": file_id,
        "size": len(raw),
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "protected": bool(pin_rec),
        "email": (email or "").strip() or None,
        "alert_on_open": bool(alert_on_open),
        "expiry_reminded": False,
    }
    if pin_rec:
        doc.update(pin_rec)
    await db.shared_shows.insert_one(doc)
    return {"code": code, "expires_at": expires.isoformat(), "size": len(raw), "protected": bool(pin_rec)}


@api_router.post("/shows/upload/init")
async def show_upload_init(body: ShowUploadInit):
    if body.total_size <= 0 or body.total_size > SHOW_MAX_BYTES:
        cap = SHOW_MAX_BYTES // (1024 * 1024)
        mb = max(0, body.total_size) / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Show is too large ({mb:.0f} MB). The cloud link limit is {cap} MB — use Save Playlist to a file instead.")
    upload_id = secrets.token_hex(16)
    await db.show_uploads.insert_one({
        "_id": upload_id,
        "total_size": body.total_size,
        "total_chunks": body.total_chunks,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"upload_id": upload_id, "chunk_size": SHOW_UPLOAD_CHUNK}


@api_router.post("/shows/upload/{upload_id}/chunk")
async def show_upload_chunk(upload_id: str, request: Request, x_chunk_index: int = Header(...)):
    sess = await db.show_uploads.find_one({"_id": upload_id})
    if not sess:
        raise HTTPException(status_code=404, detail="Upload session not found or expired — start the upload again.")
    data = await request.body()
    if len(data) > SHOW_UPLOAD_CHUNK + 1024:
        raise HTTPException(status_code=413, detail="Chunk too large.")
    from bson.binary import Binary
    await db.show_upload_chunks.update_one(
        {"upload_id": upload_id, "index": x_chunk_index},
        {"$set": {"data": Binary(data)}},
        upsert=True,
    )
    return {"ok": True, "index": x_chunk_index}


@api_router.post("/shows/upload/{upload_id}/complete")
async def show_upload_complete(upload_id: str, body: ShowUploadComplete):
    sess = await db.show_uploads.find_one({"_id": upload_id})
    if not sess:
        raise HTTPException(status_code=404, detail="Upload session not found or expired — start the upload again.")
    chunks = await db.show_upload_chunks.find({"upload_id": upload_id}).sort("index", 1).to_list(length=200000)
    raw = b"".join(bytes(c["data"]) for c in chunks)
    try:
        return await _finalize_show(raw, body.pin, body.email, body.alert_on_open)
    finally:
        await db.show_upload_chunks.delete_many({"upload_id": upload_id})
        await db.show_uploads.delete_one({"_id": upload_id})


@api_router.get("/shows/{code}")
async def get_show(code: str, request: Request, x_show_pin: Optional[str] = Header(None)):
    doc = await db.shared_shows.find_one({"code": (code or "").upper()})
    if not doc:
        raise HTTPException(status_code=404, detail="That show code was not found.")
    if is_expired(doc.get("expires_at")):
        raise HTTPException(status_code=410, detail="This share link has expired.")
    if doc.get("pin_hash"):
        ip = request.client.host if request.client else "unknown"
        if not await _pin_attempt_ok(doc["code"], ip):
            raise HTTPException(status_code=429, detail="Too many PIN attempts — wait a few minutes.", headers={"Retry-After": "600"})
        if not x_show_pin:
            raise HTTPException(status_code=401, detail="This show is PIN-protected. Enter the PIN.")
        ok = await run_in_threadpool(verify_pin, x_show_pin, doc)
        if not ok:
            raise HTTPException(status_code=403, detail="That PIN is incorrect.")
    stream = await _shows_fs.open_download_stream(doc["file_id"])
    content = await stream.read()
    payload = json.loads(content.decode("utf-8"))
    updated = await db.shared_shows.find_one_and_update(
        {"code": doc["code"]},
        {"$inc": {"opens": 1}, "$set": {"last_opened_at": datetime.now(timezone.utc).isoformat()}},
        return_document=ReturnDocument.AFTER,
    )
    # Ping the sender the first time their handoff is opened (if opted in).
    if (
        updated
        and updated.get("email")
        and updated.get("alert_on_open", True)
        and not updated.get("open_alert_sent")
        and int(updated.get("opens", 0)) == 1
    ):
        if await send_show_open_email(updated):
            await db.shared_shows.update_one({"code": doc["code"]}, {"$set": {"open_alert_sent": True}})
    return {"payload": payload, "expires_at": doc.get("expires_at")}


@api_router.get("/shows/{code}/stats")
async def show_stats(code: str):
    doc = await db.shared_shows.find_one({"code": (code or "").upper()})
    if not doc:
        raise HTTPException(status_code=404, detail="That show code was not found.")
    return {
        "code": doc["code"],
        "opens": int(doc.get("opens", 0)),
        "last_opened_at": doc.get("last_opened_at"),
        "expires_at": doc.get("expires_at"),
        "protected": bool(doc.get("pin_hash")),
    }


@api_router.post("/shows/{code}/extend")
async def extend_show(code: str, request: Request):
    doc = await db.shared_shows.find_one({"code": (code or "").upper()})
    if not doc:
        raise HTTPException(status_code=404, detail="That show code was not found.")
    # Rate-limit extends per code+ip so a known code can't be griefed indefinitely.
    ip = request.client.host if request.client else "unknown"
    if not await _pin_attempt_ok(f"extend:{doc['code']}", ip):
        raise HTTPException(status_code=429, detail="Too many extend attempts — wait a few minutes.", headers={"Retry-After": "600"})
    expires = datetime.now(timezone.utc) + timedelta(days=SHOW_TTL_DAYS)
    await db.shared_shows.update_one({"code": doc["code"]}, {"$set": {"expires_at": expires.isoformat(), "expiry_reminded": False}})
    return {"code": doc["code"], "expires_at": expires.isoformat()}


@api_router.post("/admin/run-show-expiry")
async def admin_run_show_expiry(x_admin_token: Optional[str] = Header(None)):
    check_admin(x_admin_token)
    res = await process_show_expiry()
    return {"status": "ok", **res}


# ---------- Live broadcast relay: browser (MP3 over WSS) -> radio.co (SHOUTcast v1) ----------
async def _update_shoutcast_meta(host: str, base_port: int, pwd: str, song: str):
    url = f"http://{host}:{base_port}/admin.cgi?" + urllib.parse.urlencode(
        {"pass": pwd, "mode": "updinfo", "song": song[:250]}
    )

    def _do():
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HotLive95"})
            urllib.request.urlopen(req, timeout=6).read()
        except Exception:
            pass

    try:
        await asyncio.get_event_loop().run_in_executor(None, _do)
    except Exception:
        pass


@api_router.get("/broadcast/station-status")
async def broadcast_station_status(station_id: str):
    sid = (station_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="station_id required")
    url = f"https://public.radio.co/stations/{urllib.parse.quote(sid)}/status"

    def _fetch():
        req = urllib.request.Request(url, headers={"User-Agent": "HotLive95"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))

    try:
        data = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except Exception:
        return {"ok": False}
    listeners = None
    lv = data.get("listeners")
    if isinstance(lv, dict):
        listeners = lv.get("total")
    elif isinstance(lv, (int, float)):
        listeners = int(lv)
    ct = data.get("current_track") or {}
    track = None
    if isinstance(ct, dict):
        track = ct.get("title") or (ct.get("artist") and ct.get("artist"))
    return {"ok": True, "status": data.get("status"), "listeners": listeners, "track": track}


async def _try_shoutcast(host, port, pwd, name, genre, br):
    """SHOUTcast v1 source handshake. On success, headers are sent and the
    returned writer is ready to stream MP3 bytes."""
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), 12)
    except Exception:
        return {"ok": False, "reached": False, "raw": ""}
    try:
        writer.write(pwd.encode("utf-8", "ignore") + b"\r\n")
        await writer.drain()
        try:
            resp = await asyncio.wait_for(reader.read(1024), 12)
        except Exception:
            resp = b""
        raw = resp.decode("latin-1", "ignore").strip()[:160]
        if resp.startswith(b"OK2") or resp.startswith(b"OK"):
            headers = (
                f"icy-name:{name}\r\nicy-genre:{genre}\r\nicy-pub:1\r\nicy-br:{br}\r\ncontent-type:audio/mpeg\r\n\r\n"
            ).encode("utf-8", "ignore")
            writer.write(headers)
            await writer.drain()
            return {"ok": True, "reached": True, "mode": "shoutcast", "writer": writer, "raw": raw}
        try:
            writer.close()
        except Exception:
            pass
        return {"ok": False, "reached": True, "raw": raw}
    except Exception:
        try:
            writer.close()
        except Exception:
            pass
        return {"ok": False, "reached": True, "raw": ""}


async def _try_icecast(host, port, pwd, name, genre, br, username="source", mount="/"):
    """Icecast 2 SOURCE handshake (radio.co & AzuraCast are Liquidsoap/Icecast).
    Returns HTTP code so we can tell a wrong password (401) from an
    out-of-slot / forbidden refusal (403)."""
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), 12)
    except Exception:
        return {"ok": False, "reached": False, "raw": "", "code": 0}
    try:
        user = username or "source"
        mnt = mount if (mount or "").startswith("/") else "/" + (mount or "")
        auth = base64.b64encode((user + ":" + pwd).encode("utf-8", "ignore")).decode("ascii")
        req = (
            f"SOURCE {mnt} HTTP/1.0\r\n"
            f"Authorization: Basic {auth}\r\n"
            "User-Agent: HotLive95\r\n"
            "Content-Type: audio/mpeg\r\n"
            f"ice-name: {name}\r\n"
            f"ice-genre: {genre}\r\n"
            f"ice-bitrate: {br}\r\n"
            "ice-public: 1\r\n"
            "\r\n"
        ).encode("utf-8", "ignore")
        writer.write(req)
        await writer.drain()
        try:
            resp = await asyncio.wait_for(reader.read(1024), 12)
        except Exception:
            resp = b""
        raw = resp.decode("latin-1", "ignore").strip()[:160]
        code = 0
        if resp.startswith(b"HTTP/"):
            try:
                code = int(resp.split(b" ", 2)[1])
            except Exception:
                code = 0
        if code == 200 or resp.startswith(b"OK"):
            return {"ok": True, "reached": True, "mode": "icecast", "writer": writer, "raw": raw, "code": 200}
        try:
            writer.close()
        except Exception:
            pass
        return {"ok": False, "reached": True, "raw": raw, "code": code}
    except Exception:
        try:
            writer.close()
        except Exception:
            pass
        return {"ok": False, "reached": True, "raw": "", "code": 0}


async def _radioco_connect(host, port, pwd, name="Live", genre="Various", br="128", username="source", mount="/"):
    """Try SHOUTcast v1 first, then Icecast SOURCE. On ok, result['writer'] is
    ready to receive MP3 bytes and must be closed by the caller."""
    sc = await _try_shoutcast(host, port, pwd, name, genre, br)
    if sc.get("ok"):
        return sc
    ic = await _try_icecast(host, port, pwd, name, genre, br, username, mount)
    if ic.get("ok"):
        return ic
    return {
        "ok": False,
        "reached": bool(sc.get("reached") or ic.get("reached")),
        "code": ic.get("code", 0),
        "raw": ic.get("raw") or sc.get("raw") or "",
    }


async def _update_icecast_meta(host, port, user, pwd, mount, song):
    mnt = mount if (mount or "").startswith("/") else "/" + (mount or "")
    q = urllib.parse.urlencode({"mode": "updinfo", "mount": mnt, "song": song[:250]})
    url = f"http://{host}:{port}/admin/metadata?{q}"
    auth = base64.b64encode(f"{user or 'source'}:{pwd}".encode("utf-8", "ignore")).decode("ascii")

    def _do():
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HotLive95", "Authorization": f"Basic {auth}"})
            urllib.request.urlopen(req, timeout=6).read()
        except Exception:
            pass

    try:
        await asyncio.get_event_loop().run_in_executor(None, _do)
    except Exception:
        pass


@api_router.get("/broadcast/icecast-status")
async def icecast_status(host: str = "", port: int = 0, mount: str = "", stream: str = ""):
    """Live listener count from an Icecast server's status-json.xsl. Accepts
    either host/port/mount or a full stream URL."""
    if stream:
        parsed = urllib.parse.urlparse(stream)
        base = f"{parsed.scheme or 'http'}://{parsed.netloc}"
        mnt = parsed.path or "/"
    elif host:
        base = f"http://{host}:{port or 8000}"
        mnt = mount if (mount or '').startswith('/') else '/' + (mount or '')
    else:
        return {"ok": False}
    url = base.rstrip("/") + "/status-json.xsl"

    def _fetch():
        req = urllib.request.Request(url, headers={"User-Agent": "HotLive95"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))

    try:
        data = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except Exception:
        return {"ok": False}
    src = (data.get("icestats") or {}).get("source")
    sources = src if isinstance(src, list) else ([src] if isinstance(src, dict) else [])
    total = 0
    picked = None
    live = False
    matched = False
    for s in sources:
        if not isinstance(s, dict):
            continue
        listenurl = str(s.get("listenurl") or "")
        n = s.get("listeners")
        n = int(n) if isinstance(n, (int, float)) else 0
        is_this = bool(mnt and mnt != "/" and listenurl.endswith(mnt))
        if is_this:
            picked = n
            matched = True
        total += n
    # A source only appears in status-json while it's actively connected, so
    # its presence = the station is live.
    if mnt and mnt != "/":
        live = matched
    else:
        live = len(sources) > 0
    listeners = picked if picked is not None else total
    return {"ok": True, "live": live, "listeners": listeners}


@api_router.get("/broadcast/azuracast-status")
async def azuracast_status(url: str = "", base: str = "", station: str = ""):
    """Live status from an AzuraCast station's now-playing API.
    Pass the full now-playing URL, or base + station shortcode."""
    npurl = url.strip()
    if not npurl and base:
        npurl = base.rstrip("/") + "/api/nowplaying/" + station.strip()
    if not npurl:
        return {"ok": False}

    def _fetch():
        req = urllib.request.Request(npurl, headers={"User-Agent": "HotLive95"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))

    try:
        data = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except Exception:
        return {"ok": False}
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        return {"ok": False}
    live = bool(data.get("is_online"))
    listeners = 0
    l = data.get("listeners")
    if isinstance(l, dict):
        try:
            listeners = int(l.get("current") or 0)
        except Exception:
            listeners = 0
    song = ""
    npd = data.get("now_playing")
    if isinstance(npd, dict):
        s = npd.get("song")
        if isinstance(s, dict):
            song = str(s.get("text") or "").strip()
    return {"ok": True, "live": live, "listeners": listeners, "nowPlaying": song}


@api_router.post("/broadcast/test")
async def broadcast_test(request: Request):
    """Verify a radio.co source login (SHOUTcast v1 or Icecast) without streaming."""
    try:
        cfg = await request.json()
    except Exception:
        cfg = {}
    host = str(cfg.get("host") or "").strip()
    pwd = str(cfg.get("password") or "")
    try:
        port = int(cfg.get("port"))
    except Exception:
        return {"ok": False, "message": "Enter a valid source port."}
    if not host or not port or not pwd:
        return {"ok": False, "message": "Fill in the host, source port and password first."}
    username = (str(cfg.get("username") or "").strip()) or "source"
    mount = (str(cfg.get("mount") or "").strip()) or "/"
    res = await _radioco_connect(host, port, pwd, username=username, mount=mount)
    # Close the probe connection; a real go-live opens a fresh one.
    w = res.get("writer")
    if w:
        try:
            w.close()
        except Exception:
            pass
    if res.get("ok"):
        return {"ok": True, "reachable": True, "status": "ready", "message": "radio.co accepted your login — you're clear to go live."}
    if not res.get("reached"):
        return {"ok": False, "reachable": False, "status": "unreachable", "message": f"Couldn't reach {host}:{port}. Check the host and source port."}
    code = res.get("code", 0)
    raw = res.get("raw") or ""
    if code == 401:
        return {"ok": False, "reachable": True, "status": "bad_password", "message": "radio.co rejected the broadcast password (401 Unauthorized). Use your Live/DJ broadcasting password from the radio.co dashboard (Settings → Advanced → Live Broadcasting Details) — it's separate from your Studio login." + (f" (server: {raw})" if raw else "")}
    msg = (
        f"Reached radio.co at {host}:{port}, so your host and source port are correct. "
        "It isn't accepting a live source right now. On radio.co only the station OWNER can go live anytime — every other DJ must have a SCHEDULED live event, and the slot has to be open. "
        "Add your show on radio.co's calendar (or turn on Live Anytime if you're the owner), then it will connect at that time. If it still refuses inside your slot, re-check the broadcast password."
    )
    if raw:
        msg += f" (server: {raw})"
    return {"ok": False, "reachable": True, "status": "not_in_slot", "message": msg}


@api_router.websocket("/broadcast/ws")
async def broadcast_ws(ws: WebSocket):
    await ws.accept()
    writer = None
    host = None
    base_port = None
    pwd = None
    try:
        cfg = json.loads(await asyncio.wait_for(ws.receive_text(), 30))
        host = str(cfg["host"]).strip()
        port = int(cfg["port"])
        pwd = str(cfg["password"])
        name = str(cfg.get("name") or "Live")
        genre = str(cfg.get("genre") or "Various")
        br = str(cfg.get("bitrate") or 128)
        username = (str(cfg.get("username") or "").strip()) or "source"
        mount = (str(cfg.get("mount") or "").strip()) or "/"
        base_port = port - 1
        res = await _radioco_connect(host, port, pwd, name=name, genre=genre, br=br, username=username, mount=mount)
        if not res.get("ok"):
            if not res.get("reached"):
                err = f"Couldn't reach {host}:{port}. Check the host and source port."
            elif res.get("code") == 401:
                err = "The broadcast server rejected the password (401). Use the Live/DJ broadcasting password for this account — it's separate from your Studio login."
            else:
                raw = res.get("raw") or ""
                err = "The broadcast server won't accept a live source right now. On radio.co only the owner can go live anytime; other DJs need a scheduled event with the slot open. On your own server, check the DJ account/mount is enabled. Then reconnect." + (f" (server: {raw})" if raw else "")
            await ws.send_json({"type": "error", "error": err})
            await ws.close()
            return
        writer = res["writer"]
        bc_mode = res.get("mode")
        await ws.send_json({"type": "live"})
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data:
                writer.write(data)
                await writer.drain()
                continue
            txt = msg.get("text")
            if txt:
                try:
                    m = json.loads(txt)
                    if m.get("type") == "meta" and m.get("title"):
                        if bc_mode == "icecast":
                            asyncio.create_task(_update_icecast_meta(host, port, username, pwd, mount, str(m["title"])))
                        elif base_port:
                            asyncio.create_task(_update_shoutcast_meta(host, base_port, pwd, str(m["title"])))
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "error": str(e)[:200]})
        except Exception:
            pass
    finally:
        if writer:
            try:
                writer.close()
            except Exception:
                pass
        try:
            await ws.close()
        except Exception:
            pass


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


_scheduler_task = None


@app.on_event("startup")
async def _start_expiry_scheduler():
    async def loop():
        await asyncio.sleep(15)
        while True:
            try:
                res = await process_expiry()
                if res["alerts"] or res["renews"]:
                    logger.info(f"Expiry pass: {res['alerts']} alert(s), {res['renews']} auto-renew(s)")
            except Exception as e:
                logger.error(f"Expiry pass failed: {e}")
            try:
                sres = await process_show_expiry()
                if sres["show_reminders"]:
                    logger.info(f"Show expiry pass: {sres['show_reminders']} reminder(s)")
            except Exception as e:
                logger.error(f"Show expiry pass failed: {e}")
            await asyncio.sleep(12 * 3600)
    global _scheduler_task
    # Keep a strong reference so the background loop is not garbage-collected mid-flight.
    _scheduler_task = asyncio.create_task(loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    global _scheduler_task
    if _scheduler_task:
        _scheduler_task.cancel()
    client.close()
