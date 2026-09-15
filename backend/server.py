from fastapi import FastAPI, APIRouter, Header, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'hotlive95admin')

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


def public_view(doc: dict) -> dict:
    return {
        "key": doc.get("key"),
        "dj": doc.get("dj"),
        "max_devices": doc.get("max_devices", 1),
        "expires_at": doc.get("expires_at"),
        "revoked": bool(doc.get("revoked")),
        "devices": doc.get("devices", []),
        "created_at": doc.get("created_at"),
    }


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
        await db.licenses.update_one({"key_norm": kn}, {"$set": {"devices": devices}})
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
        "max_devices": max(1, int(body.max_devices)),
        "expires_at": body.expires_at,
        "revoked": False,
        "devices": [],
        "created_at": now_iso(),
    }
    await db.licenses.insert_one(doc)
    return public_view(doc)


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
