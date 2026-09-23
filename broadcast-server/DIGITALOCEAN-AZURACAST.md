# Hot Live 95 — DigitalOcean + AzuraCast: exact command sheet

End-to-end copy-paste to get a live 24/7 station. Domain used:
**radio.hotlive95dj.com** (swap for your own subdomain).

---

## 1. Create the Droplet (DigitalOcean web UI)
- Create → Droplets → **Ubuntu 24.04 LTS**
- Plan: **Basic → Regular → 2 GB RAM / 1 CPU** ($12/mo; 1 GB works for a small station)
- Choose a region near your listeners
- Authentication: SSH key (recommended) or password
- Hostname: `hotlive95` → Create

Note the Droplet's **public IP** (e.g. `203.0.113.10`).

## 2. Point your domain
In your DNS provider (where hotlive95dj.com lives) add an **A record**:

    Type: A   Host: radio   Value: 203.0.113.10   TTL: 3600

Wait a few minutes, then verify:

    ping radio.hotlive95dj.com

## 3. SSH in

    ssh root@203.0.113.10

## 4. Firewall (UFW)

    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 8000/tcp
    ufw allow 8005/tcp
    ufw allow 8010/tcp
    ufw allow 8015/tcp
    ufw --force enable
    ufw status

(8000/8005 are the first station's listener/DJ ports; 8010/8015 cover a 2nd station.
AzuraCast shows the exact ports it uses per station.)

## 5. Install AzuraCast (handles Docker for you)

    mkdir -p /var/azuracast && cd /var/azuracast
    curl -fsSL https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/docker.sh > docker.sh
    chmod +x docker.sh
    ./docker.sh install

Accept the prompts (release channel = Stable). When it finishes, open:

    http://radio.hotlive95dj.com

## 6. First-run web setup (browser)
1. Create your admin account.
2. **Enable HTTPS:** Administration → System Settings → General →
   set **Base URL** = `https://radio.hotlive95dj.com`, toggle **"Prefer Browser URL"**
   and **"Use LetsEncrypt"** → Save. AzuraCast fetches the SSL cert automatically.
3. Create a **Station** named "Hot Live 95" (shortcode `hot_live_95`).
4. **Upload music:** Station → Media → upload your MP3/WAV files, then add them to a
   playlist set to "General Rotation" (this is your 24/7 AutoDJ).
5. **Enable live DJs:** Station → Profile → Broadcasting → turn ON
   **"Allow Streamers / DJs"**.
6. **Add a DJ account per DJ:** Station → Streamers/DJs → Add → set username + password.

## 7. Grab the connection info (Station → "Connect / Broadcasting")
AzuraCast shows:
- **Server / Host:** `radio.hotlive95dj.com`
- **DJ/Streamer Port:** e.g. `8005`
- **Listen URL:** e.g. `https://radio.hotlive95dj.com/listen/hot_live_95/radio.mp3`
- **Now-Playing API:** `https://radio.hotlive95dj.com/api/nowplaying/hot_live_95`

## 8. Connect DJ Playout Studio
Go Live → **Own server** →
- Quick way: paste your public URL into **AzuraCast auto-fill** → tap **Auto-fill**
  (host, listen URL, now-playing URL fill in automatically).
- Then set **Port** = DJ/streamer port (e.g. 8005), **DJ username** + **Password** =
  the streamer account, **Mount** = `/`.
- **Test connection** → green → **Go live**.
- In **Share & embed**: save the listen URL, tap **"Is my station live?"** (🟢),
  copy the `<iframe>` to hotlive95dj.com, and grab the **scan-to-listen QR**.

## Updating / maintenance

    cd /var/azuracast && ./docker.sh update      # update AzuraCast
    ./docker.sh restart                          # restart
    docker compose logs -f                        # watch logs

Done — Hot Live 95 is now your own independent 24/7 station with every DJ able to
go live anytime.
