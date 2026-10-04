# Offline clinic runbook (local LAN server)

Use this guide when the clinic has **no reliable internet** but can run ClinicSys on a **local network** (Wi‑Fi or router). A Windows laptop or small PC acts as the server; phones and other PCs connect to it by IP address.

This is **not** cloud hosting (Railway/VPS). Internet is only needed **once** to install Docker and download images, or to copy the project from USB.

---

## What you get

| Works on LAN | Does not work without LAN |
|--------------|---------------------------|
| Register patient → queue → consult → Rx → bill | Access from home or another town |
| Multiple devices on clinic Wi‑Fi | Automatic cloud backup (unless you add it) |
| Full web app (same as online) | Mobile app unless configured for your LAN IP |

Offline **device cache** (vitals/notes when Wi‑Fi drops briefly) is a bonus. The main model here is: **server always reachable on local Wi‑Fi**.

---

## Checklist overview

### Before clinic day (one-time)

- [ ] Windows laptop/PC (8 GB+ RAM, SSD, plugged in)
- [ ] Docker Desktop installed and running
- [ ] ClinicSys folder on the machine (e.g. `C:\clinicsys`)
- [ ] `.env` created with strong passwords
- [ ] Backend stack running (`docker compose up`)
- [ ] Web app built once (`npm run build`)
- [ ] Health check passes on the server machine
- [ ] Laptop has a **fixed LAN IP** (e.g. `192.168.1.10`)
- [ ] Clinic Wi‑Fi or router connects all devices
- [ ] Operator setup done (clinic, branch, doctor, roles)
- [ ] Test patient walk-through completed
- [ ] Bookmark `http://192.168.1.10:3000` on every device
- [ ] Backup folder created (USB or `C:\clinicsys\backups`)
- [ ] Power: sleep disabled while clinic is open

### Every clinic day

- [ ] Turn on laptop server and wait ~2 minutes for Docker
- [ ] Confirm health: `http://localhost:8000/api/v1/health/`
- [ ] Open app on reception + doctor devices
- [ ] Select correct **branch** in the sidebar
- [ ] End of day: run database backup to USB

### After software update (occasional)

- [ ] Pull/copy new ClinicSys version
- [ ] `docker compose up --build -d`
- [ ] `cd web && npm run build`
- [ ] Restart web process
- [ ] Smoke-test one patient flow

---

## Phase 1 — Prepare the server laptop (needs internet once)

### 1.1 Hardware

| Item | Recommendation |
|------|----------------|
| Machine | Dedicated Windows 10/11 laptop or mini PC |
| RAM | 8 GB minimum, 16 GB better |
| Disk | 50 GB+ free on SSD |
| Power | Mains power all day; optional small UPS |
| Network | Wi‑Fi or Ethernet to clinic router |

### 1.2 Install Docker Desktop

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. Install with **WSL 2** enabled.
3. Restart the computer.
4. Open Docker Desktop → wait until status is **Running**.
5. Settings → General → **Start Docker Desktop when you log in**.

### 1.3 Copy ClinicSys

Either clone with Git (if internet available) or copy the whole project folder from USB to:

```
C:\clinicsys
```

### 1.4 Create environment file

PowerShell:

```powershell
cd C:\clinicsys
copy .env.example .env
notepad .env
```

Set at minimum:

```env
DJANGO_SECRET_KEY=<at-least-32-random-characters>
DJANGO_DEBUG=True
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=clinicsys
POSTGRES_USER=clinicsys
```

You will add the LAN IP in Phase 2 after you know it.

---

## Phase 2 — Start the backend (database + API)

PowerShell:

```powershell
cd C:\clinicsys\infra
docker compose -f docker-compose.yml up --build -d
```

Wait 2–5 minutes on first run (downloads images).

**Verify on the laptop:**

| URL | Expected |
|-----|----------|
| http://localhost:8000/api/v1/health/ | `{"status":"ok",...}` |
| http://localhost:8080/api/v1/health/ | Same (via nginx) |

**Useful commands:**

```powershell
# See running containers
docker compose -f docker-compose.yml ps

# View logs
docker compose -f docker-compose.yml logs -f backend

# Stop (end of maintenance only)
docker compose -f docker-compose.yml down
```

> Do **not** run `down -v` unless you intend to wipe the database.

---

## Phase 3 — Start the web app (clinic UI)

The dev Docker stack serves the **API** only. Run the **web UI** on the laptop:

```powershell
cd C:\clinicsys\web
npm install
npm run build
$env:API_PROXY_TARGET="http://127.0.0.1:8000"
$env:HOSTNAME="0.0.0.0"
$env:PORT="3000"
npm start
```

Leave this window open during clinic hours (or run as a Windows scheduled task at login).

**First time only:** `npm run build` takes a few minutes. You do **not** rebuild every day.

**Verify on the laptop:** http://localhost:3000 — login page loads.

---

## Phase 4 — Network setup

### 4.1 Find the laptop IP

PowerShell:

```powershell
ipconfig
```

Note **IPv4 Address**, e.g. `192.168.1.10`.

### 4.2 Set a fixed IP (recommended)

Windows → Settings → Network → your adapter → IP assignment → **Manual**:

- IP: `192.168.1.10`
- Subnet: `255.255.255.0`
- Gateway: your router IP (e.g. `192.168.1.1`)

So the address does not change after reboot.

### 4.3 Allow the LAN IP in Django

Edit `C:\clinicsys\.env`:

```env
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.10
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.10:3000
```

Restart backend:

```powershell
cd C:\clinicsys\infra
docker compose -f docker-compose.yml restart backend
```

### 4.4 Windows Firewall

Allow inbound **TCP 3000** (web) on private networks:

PowerShell (admin):

```powershell
New-NetFirewallRule -DisplayName "ClinicSys Web" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 4.5 Connect clinic Wi‑Fi

**Option A — Router (best):** Laptop + tablets + reception PC on same router. Internet cable not required.

**Option B — Laptop hotspot:** Settings → Mobile hotspot. Fine for 2–4 devices; a router is more stable for a busy clinic.

### 4.6 Test from another device

On a phone/tablet on the same Wi‑Fi, open:

```
http://192.168.1.10:3000
```

Bookmark this on every clinic device.

---

## Phase 5 — First-time clinic setup (operator)

Do this once on the **server laptop** (or any device that can reach the app).

1. Create a Django superuser (PowerShell):

   ```powershell
   cd C:\clinicsys\infra
   docker compose exec backend python manage.py createsuperuser
   ```

2. Open **http://localhost:3000/operator** and sign in as superuser.

3. Provision in order:

   | Step | Action |
   |------|--------|
   | 1 | Create clinic (name, code, timezone, currency e.g. MMK) |
   | 2 | Create **one branch** |
   | 3 | Install permission catalog |
   | 4 | Install default roles |
   | 5 | Create doctor staff user + password |
   | 6 | Create doctor profile + schedule |
   | 7 | Assign **Solo Practitioner** (or appropriate role) to the doctor |

4. Sign out superuser. Sign in as the **doctor** user.

5. Select **branch** in the sidebar if prompted.

6. **Test walk-through:**

   ```
   Register patient → Walk-in / appointment → Check in → Queue
   → Start encounter → Note + vitals → Prescription → Invoice → Issue → Payment
   ```

7. Open **Reports** and confirm numbers look reasonable.

---

## Phase 6 — Daily clinic workflow

### Opening (5 minutes)

1. Power on server laptop; log in to Windows.
2. Confirm Docker Desktop is running (whale icon in tray).
3. If web is not auto-started, run `npm start` (see Phase 3).
4. On each device, open `http://192.168.1.10:3000`.
5. Each user signs in and confirms **branch** is selected.

### During the day

| Role | Screens |
|------|---------|
| Reception | Patients, Walk-in, Queue |
| Doctor | Queue, Consultation, Prescriptions |
| Cashier | Billing, Reports |

Sync badge (**Online / Offline / Syncing**) matters only if Wi‑Fi drops briefly. With a healthy LAN, you stay **Online**.

### Closing (5 minutes)

1. Finish open queue entries or note them for tomorrow.
2. Run backup (Phase 7).
3. Optional: close web terminal; leave Docker running for next day.
4. Do not shut down the laptop mid-backup.

---

## Phase 7 — Backups (no internet)

### Manual backup to file

PowerShell:

```powershell
cd C:\clinicsys\infra
docker compose exec -T postgres pg_dump -U clinicsys -d clinicsys > C:\clinicsys\backups\clinic-backup.sql
```

Copy `clinic-backup.sql` to a **USB drive** weekly (or daily if busy).

### Restore (if database corrupted)

```powershell
docker compose exec -T postgres psql -U clinicsys -d clinicsys < C:\clinicsys\backups\clinic-backup.sql
```

Test restore on a spare machine once before you depend on backups.

---

## Phase 8 — Windows settings (important)

| Setting | Value |
|---------|--------|
| Sleep | **Never** while plugged in (PC sleep stops the clinic) |
| Screen | Can turn off after 10–15 min |
| Docker | Start at login |
| Windows Update | Run after hours, not during clinic |
| Antivirus | Allow Docker; exclude `C:\clinicsys` if scans are slow |

---

## Phase 9 — Troubleshooting

| Problem | Fix |
|---------|-----|
| Phone cannot open app | Same Wi‑Fi as laptop? Correct IP? Firewall rule for port 3000? |
| `DisallowedHost` error | Add laptop IP to `DJANGO_ALLOWED_HOSTS` in `.env`; restart backend |
| Login works on laptop, not phone | Add `http://192.168.x.x:3000` to `CORS_ALLOWED_ORIGINS` |
| Blank page after update | Re-run `npm run build` and restart `npm start` |
| API error / empty lists | Check http://localhost:8000/api/v1/health/ ; `docker compose logs backend` |
| Docker won't start | Restart Docker Desktop; reboot Windows |
| Slow after months | Restart Docker; check disk space; run backup and archive old data |

---

## Optional — Production Docker stack (advanced)

For a single command that runs web + API together, use `infra/docker-compose.prod.yml`. It expects TLS certificates in `infra/certs/`. For a **private LAN without internet**, generate a self-signed certificate or use HTTP-only nginx config. See `docs/SOLO_CLINIC_GO_LIVE.md` for production details.

For most offline clinics, **dev Docker + `npm start`** (this guide) is simpler to maintain.

---

## What staff should never do

- Run `npm run build` daily (only IT/update time)
- Run `docker compose down -v` (deletes database)
- Change the laptop IP without updating `.env` and device bookmarks
- Use the server laptop for heavy personal use during clinic hours

---

## Quick reference card (print for desk)

```
ClinicSys LAN
─────────────
App URL:     http://192.168.1.10:3000
Server:      Windows laptop (always plugged in)
Wi‑Fi:       Same network as all clinic devices
Backup:      End of day → USB
Support:     Health check http://192.168.1.10:8000/api/v1/health/
Rebuild:     Only after software update
```

Replace `192.168.1.10` with your actual fixed IP.
