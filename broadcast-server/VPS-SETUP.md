# Hot Live 95 — VPS setup walkthrough (tailored)

Domain used below: **hotlive95dj.com** → the stream will live at
**https://stream.hotlive95dj.com/stream**. Swap in a different subdomain if you like.

Pick one host. Both are fine; DigitalOcean is the most beginner‑friendly.

---

## ⭐ EASIEST OF ALL: AzuraCast (all‑in‑one, multi‑DJ, 24/7)

AzuraCast bundles Icecast + Liquidsoap + AutoDJ + per‑DJ accounts + a web player.
Every DJ can go live anytime. DJ Playout Studio already supports it.

1. Create the VPS (Ubuntu 24.04, 2 GB RAM recommended), point DNS
   `radio.hotlive95dj.com → server IP`, open ports 22/80/443 (+ the stream/DJ
   ports AzuraCast assigns, usually 8000 & 8005 — it tells you).
2. Install (one command):
   ```
   curl -fsSL https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/docker.sh > docker.sh
   bash docker.sh install
   ```
3. Open `https://radio.hotlive95dj.com`, finish setup, create your station
   ("Hot Live 95"), upload music, and turn ON **Enable Streamers/DJs**.
4. Add a **Streamer/DJ account** per DJ (Station → Streamers/DJs) — username + password.
5. In **Station → "Connection Information"**, note: DJ/streamer **port**, the
   public **listen URL**, and the **now‑playing API URL**
   (`https://radio.hotlive95dj.com/api/nowplaying/hot_live_95`).
6. In DJ Playout Studio → Go Live → **Own server**:
   - Host `radio.hotlive95dj.com`, Port = the DJ/streamer port, DJ username +
     password = that streamer account, Mount `/` (as shown by AzuraCast).
   - Paste the **now‑playing API URL** into the "AzuraCast now‑playing URL" field
     (lights up the live badge + listener count).
   - **Test connection** → green → **Go live**.
7. In "Share & embed": stream URL = AzuraCast **listen URL**, tap
   **"Is my station live?"** to confirm 🟢, paste the embed on your website.

No hand‑editing of Icecast/Liquidsoap files needed — AzuraCast manages it all.

---

## ⚡ Fastest path: ICECAST‑ONLY (recommended to start)

This gets you on air today. The studio is the live source; listeners play the
same server. No 24/7 AutoDJ yet — add Liquidsoap later with `docker-compose.yml`.

1. Create the VPS + point DNS + open firewall (see host steps below). For
   Icecast‑only you only need ports **22, 80, 443, 8000**.
2. `cp .env.example .env` and set `ICECAST_SOURCE_PASSWORD`,
   `ICECAST_ADMIN_PASSWORD`, `PUBLIC_HOSTNAME=stream.hotlive95dj.com`.
3. Launch just Icecast:
   `docker compose -f docker-compose.icecast-only.yml up -d`
4. (For website embedding) run Caddy for HTTPS — see the Caddy step below.
5. In DJ Playout Studio → Go Live → **Own server**:
   - Host `stream.hotlive95dj.com`, Port `8000`, DJ username `source`,
     Password = `ICECAST_SOURCE_PASSWORD`, Mount `/stream`, Listener port `8000`.
   - **Test connection** → should go green → **Go live**.
6. In "Share & embed": save stream URL `https://stream.hotlive95dj.com/stream`,
   tap **"Is my station live?"** to confirm 🟢, then paste the embed on your site.

Upgrade to 24/7 AutoDJ anytime by switching to `docker-compose.yml` (Liquidsoap).

---

## A) DigitalOcean (recommended)

1. **Create a Droplet**: Ubuntu 24.04, Basic / Regular, **$6/mo (1 GB)**. Region
   closest to most listeners (e.g. New York for Detroit). Add your SSH key.
2. **DNS**: In your domain registrar (or DigitalOcean → Networking → Domains) add an
   **A record**: `stream` → your Droplet's IP. (host = `stream`, value = the IP.)
3. **Firewall** (DigitalOcean → Networking → Firewalls, attach to the Droplet), allow
   inbound TCP: **22, 80, 443, 8000, 8005**.
4. SSH in and install Docker:
   ```bash
   ssh root@YOUR_DROPLET_IP
   curl -fsSL https://get.docker.com | sh
   ```

## B) Hetzner Cloud

1. **Create a Server**: Ubuntu 24.04, **CX22 (~€4/mo)**. Add SSH key.
2. **DNS**: add A record `stream.hotlive95dj.com` → server IP.
3. **Firewall** (Hetzner → Firewalls): allow inbound TCP **22, 80, 443, 8000, 8005**.
4. SSH in and install Docker (same command as above).

---

## Deploy the station (both hosts)

```bash
# 1. Get the broadcast-server folder onto the box (scp, git clone, or rsync).
#    e.g. from your computer:
#    scp -r broadcast-server root@YOUR_IP:/root/
cd /root/broadcast-server

# 2. Also enable the firewall on the box itself:
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 8000 && ufw allow 8005 && ufw --force enable

# 3. Configure
cp .env.example .env
nano .env      # set PUBLIC_HOSTNAME=stream.hotlive95dj.com and STRONG passwords
mkdir -p music recordings
#    Upload your MP3s into ./music  (this is the 24/7 AutoDJ library)

# 4. Start it
docker compose up -d
docker compose logs -f liquidsoap     # should show it connecting to Icecast
```

- **Plain listener URL:** `http://stream.hotlive95dj.com:8000/stream`
- **Icecast admin:** `http://stream.hotlive95dj.com:8000/` (user `admin`, your admin pw)

## Add HTTPS + clean URL (recommended for websites/apps)

This gives `https://stream.hotlive95dj.com/stream` (no port, valid SSL). Add a Caddy
service that auto‑gets a certificate:

```bash
# append a caddy service to the running stack
cat >> docker-compose.yml <<'YAML'

  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on: [icecast]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
YAML

# Edit Caddyfile if you used a different subdomain, then:
docker compose up -d
```
Now use **https://stream.hotlive95dj.com/stream** everywhere.

---

## Point DJ Playout Studio at it (each DJ)

Go Live → open **"Own server (Icecast / AzuraCast / Liquidsoap)"**:

| Field        | Value                                                    |
|--------------|----------------------------------------------------------|
| Server host  | `stream.hotlive95dj.com`                                 |
| Source port  | `8005`                                                   |
| DJ username  | `nova` (or any name / a user from `DJS`)                 |
| Password     | your `HARBOR_PASSWORD` (or that DJ's password in `DJS`)  |
| Mount        | `/live`                                                  |
| Listener port| `8000` (or `443` if using the HTTPS/Caddy option)        |

Click **Test connection** → **Go live now**. Save it as a **profile** (Save button)
so it's one tap next time.

## Your branded web player
Point people at **`/live`** on your app (e.g. `https://your-app/live`), or embed it
on hotlive95dj.com. Set the stream via the app env `REACT_APP_STATION_STREAM_URL`,
or open `/live?stream=https://stream.hotlive95dj.com/stream` to point it anywhere.
