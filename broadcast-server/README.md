# Hot Live 95 — Independent 24/7 Radio Server

This turns Hot Live 95 into its **own radio station**, independent of radio.co:

- **Icecast** — the public stream your listeners tune into.
- **Liquidsoap** — runs your music library 24/7 (AutoDJ) and hands off to a live
  DJ the moment one connects, then resumes automation. Never goes silent.
- **DJ Playout Studio** — your DJs' live studio; it connects into this server as
  the live source (using the "Own server" settings in the Go Live panel).

The web app (DJ Playout Studio) is a *client*. This server is the always‑on part,
so it must run on a **dedicated VPS** — not inside the app hosting.

---

## 1. Get a VPS
Any small Linux box works (Ubuntu 22.04+, 1 GB RAM). Providers: Hetzner (~€4/mo),
DigitalOcean, Vultr, Linode, AWS Lightsail.

Open these ports in the provider firewall (and `ufw`):
- **8000/tcp** — listeners
- **8005/tcp** — live DJ input (DJ Playout Studio)

```bash
sudo ufw allow 8000/tcp && sudo ufw allow 8005/tcp
```

## 2. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Copy this folder to the server
Upload the `broadcast-server/` folder (scp, git, or rsync), then:
```bash
cd broadcast-server
cp .env.example .env
nano .env          # set strong passwords + PUBLIC_HOSTNAME + DJS
mkdir -p music recordings
# put your MP3 files into ./music  (this is the AutoDJ library)
```

## 4. Start it
```bash
docker compose up -d
docker compose logs -f liquidsoap   # watch it connect to Icecast
```

- **Listener stream:** `http://YOUR_HOST:8000/stream`
  (put this URL in your website player, TuneIn, apps, etc.)
- **Icecast status/admin:** `http://YOUR_HOST:8000/` (admin login: `admin` /
  your `ICECAST_ADMIN_PASSWORD`).

## 5. Go live from DJ Playout Studio
In the studio → **Go Live** → open **"Own server (Icecast / AzuraCast / Liquidsoap)"**:

| Field        | Value                                             |
|--------------|---------------------------------------------------|
| Server host  | `YOUR_HOST` (PUBLIC_HOSTNAME / IP)                |
| Source port  | `8005`                                            |
| DJ username  | any name, or a user from `DJS` (e.g. `nova`)      |
| Password     | `HARBOR_PASSWORD` (or that DJ's password in `DJS`)|
| Mount        | `/live`                                           |

Click **Test connection** (should go green), then **Go live now**. Your live audio
replaces AutoDJ instantly; when you stop, AutoDJ resumes. Every DJ can go live
**any time** — no scheduling required (schedule from the lineup if you want
hands‑free start times).

## Multiple DJs, each with their own login
Set `DJS` in `.env`, e.g.:
```
DJS=nova:novapass,rick:rickpass,dee:deepass
```
Each DJ uses their own username + password (mount stays `/live`). The shared
`HARBOR_PASSWORD` also keeps working as a fallback.

## Notes
- **Now playing**: metadata sent by DJ Playout Studio flows through to the stream.
- **Recordings**: `./recordings` is mounted for future use.
- **HTTPS / custom domain**: front Icecast with a reverse proxy (Caddy/Nginx) if
  you want `https://stream.hotlive95dj.com/stream`.
- **AutoDJ library**: add/remove files in `./music` any time — Liquidsoap watches
  the folder and reloads automatically.
