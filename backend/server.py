from fastapi import FastAPI, APIRouter, Header, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import random
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'hotlive95admin')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
RENEW_DAYS = int(os.environ.get('RENEW_DAYS', '90'))
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
        "created_at": doc.get("created_at"),
    }


def welcome_html(dj: str, key: str, expires_at: Optional[str]) -> str:
    exp_line = ""
    if expires_at:
        exp_line = f'<tr><td style="padding:4px 0;color:#9aa0a6;font-size:13px;">Valid through</td><td style="padding:4px 0;color:#ff6a2b;font-size:13px;text-align:right;">{str(expires_at)[:10]}</td></tr>'
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
            <div style="background:#0a0a0c;border:1px dashed #ff5a1f;border-radius:10px;padding:16px;text-align:center;margin:0 0 20px;">
              <div style="color:#9aa0a6;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Your activation key</div>
              <div style="color:#ffb020;font-size:22px;font-weight:700;letter-spacing:4px;font-family:monospace;">{key}</div>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{exp_line}</table>
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
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logging.getLogger(__name__).error(f"Resend email failed: {e}")
        return False


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
    sent = await send_welcome_email(doc["email"], doc["dj"], key, doc["expires_at"])
    if sent:
        doc["email_sent_at"] = now_iso()
    await db.licenses.insert_one(doc)
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
    now = datetime.now(timezone.utc)
    base = now
    cur = doc.get("expires_at")
    if cur:
        try:
            exp = datetime.fromisoformat(cur)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now:
                base = exp
        except Exception:
            base = now
    new_exp = (base + timedelta(days=days)).isoformat()
    await db.licenses.update_one(
        {"key_norm": normalize_key(key)},
        {"$set": {"expires_at": new_exp, "revoked": False}},
    )
    return {"status": "ok", "expires_at": new_exp, "days": days}


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


@api_router.get("/")
async def root():
    return {"message": "Hot Live 95 licensing service"}


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
