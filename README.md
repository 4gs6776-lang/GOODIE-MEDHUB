# GOODIE-MEDHUB Local Server: Complete Beginner Guide (Phase 0)

This guide takes you from "I have a folder of files" to "two devices on the hospital Wi-Fi are talking to the same local server, with the internet switched off."
Do the steps IN ORDER. Do not skip ahead. After each step there is a "How to know it worked" line. If it did not work, stop and read the Troubleshooting section at the end.

**Important:** this is a TEST. Do not type real patient data into it yet. Use made-up names.

---

## PART 0. The big picture (read this once)

Today your hospital app saves data on the internet (Supabase). If the internet drops, computers cannot share data.

We are testing a different design:

```
Phone / PC / Tablet  --->  LOCAL SERVER (one PC in the hospital)  --->  PostgreSQL (the filing cabinet)
        (hospital Wi-Fi, no internet needed)                                 |
                                                                  later, when internet returns:
                                                                        sends changes to the cloud
```

Everything in this test is **FREE and open source**. Nothing here costs money.

### Words you will meet

| Word | Simple meaning |
|---|---|
| Server | A computer that other devices ask for information |
| Node.js | The engine that runs our server program |
| PostgreSQL ("Postgres") | The database: a very organised filing cabinet |
| Database / table | The cabinet / one drawer in it (patients, users...) |
| API | The "front desk" of the server: the screens send requests to it |
| WebSocket | A live line that lets the server push news to screens instantly |
| Argon2id | A way of scrambling passwords so nobody can read them back |
| HTTPS / certificate | The padlock in the browser. Needed for some browser features |
| IP address | The server's number on the Wi-Fi, e.g. 192.168.1.50 |
| Terminal / PowerShell | The text window where you type commands |
| Backup / restore | Copy the data to a file / put that copy back |

---

## PART 1. What is in the folder (the files, in the order they are used)

```
phase0-spike/
  README.md                  <- this guide
  server/
    package.json             1. Shopping list of free tools the server needs
    .env.example             2. Template for your private settings
    schema.sql               3. Builds the empty drawers (tables) in the database
    seed.js                  4. Puts in one demo hospital and one demo admin
    index.js                 5. THE SERVER: login, patients, live updates, health check
    public/index.html        6. A simple test page you open in the browser
  scripts/
    make-local-ca.sh         7. Makes the HTTPS padlock (optional step)
    backup.sh / backup.ps1   8. Saves a copy of the database and checks it
    restore.sh               9. Puts a backup copy back (Linux; Windows command is in Step 15)
  tls/                       Certificates go here (starts empty)
```

---

## PART 2. What you need

| Item | Cost |
|---|---|
| One Windows or Linux PC that can stay switched on (the "test server") | You already have one |
| Node.js version 22 or newer | FREE |
| PostgreSQL version 16 or newer | FREE |
| The hospital Wi-Fi/router | Already there |
| A phone or second PC on the same Wi-Fi | You already have one |

You need internet ONCE, to download the programs and run `npm install`. After that, the test must work with the internet off.

---

## PART 3. Step by step (Windows). Linux differences are in Part 4.

### Step 1. Put the folder on the server PC
1. Download the `phase0-spike` folder and unzip it.
2. Move it to a simple place, for example `C:\goodie-spike` so the files are at `C:\goodie-spike\server\index.js`.

*How to know it worked:* you can open `C:\goodie-spike\server` and see `index.js`.

### Step 2. Install Node.js
1. Go to **nodejs.org** and download the **LTS** version (22 or newer).
2. Run it. Click Next/Install, accept defaults, click Yes if Windows asks permission.
3. Open **PowerShell** (Start menu, type PowerShell). Type: `node -v`

*How to know it worked:* it prints a number like `v22.12.0`.

### Step 3. Install PostgreSQL
1. Go to **postgresql.org/download/windows** and download the installer (version 16 or newer).
2. Run it and accept the defaults, but:
   - When it asks for the **"postgres" superuser password**, choose one and **write it down**.
   - Keep the port **5432**.
   - You can untick "Stack Builder" at the end.

*How to know it worked:* "SQL Shell (psql)" appears in your Start menu.

### Step 4. Create the hospital database and its user
1. Open **SQL Shell (psql)** from the Start menu.
2. It asks four questions (Server, Database, Port, Username). Press **Enter** four times to accept the defaults, then type the postgres password from Step 3.
3. Type these two lines, pressing Enter after each (change `pick-a-password`; use only letters and numbers, no symbols):
   ```
   CREATE USER medhub WITH PASSWORD 'pick-a-password';
   CREATE DATABASE medhub OWNER medhub;
   ```
4. Type `\q` and press Enter to leave.

*How to know it worked:* the two lines reply `CREATE ROLE` and `CREATE DATABASE`.

### Step 5. Build the empty tables
This must be done as the **medhub** user (not postgres), otherwise the server will not be allowed to use them.
1. Open **SQL Shell (psql)** again.
2. This time answer: Server = Enter, **Database = `medhub`**, Port = Enter, **Username = `medhub`**, then the medhub password.
3. Type this (note the forward slashes and quotes; adjust the path if yours differs):
   ```
   \i 'C:/goodie-spike/server/schema.sql'
   ```
4. Type `\q` to leave.

*How to know it worked:* you see several `CREATE TABLE` lines and no `ERROR`.

### Step 6. Make your private settings file
1. In PowerShell:
   ```
   cd C:\goodie-spike\server
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   The last command prints a long random text. **Copy it.**
2. Open the settings file: `notepad .env`
3. Fill it like this:
   ```
   DATABASE_URL=postgres://medhub:pick-a-password@localhost:5432/medhub
   SESSION_SECRET=paste-the-long-random-text-here
   PORT=3000
   TLS_KEY=
   TLS_CERT=
   CLOUD_URL=
   ```
4. Save and close Notepad.

Why: `.env` holds secrets (passwords). It is never shared and never goes into your app code.

*How to know it worked:* the file `.env` exists next to `index.js`.

### Step 7. Install the server's free tools
In the same PowerShell window (still in `server`):
```
npm install
```
This downloads Fastify, the WebSocket tool, the Postgres connector and Argon2. It needs internet and may take a minute.

*How to know it worked:* it ends without red `ERR!` lines, and a `node_modules` folder appears.

### Step 8. Create the demo hospital and admin
```
npm run seed
```
*How to know it worked:* it prints `Seeded. Log in with admin@demo.local / ChangeMe-Now-123`.

### Step 9. Start the server
```
npm start
```
Leave this window OPEN. The server runs as long as it is open.

*How to know it worked:* you see log lines ending with something like `Server listening at http://0.0.0.0:3000`.

### Step 10. Test on the same PC
1. Open a browser and go to `http://localhost:3000`
2. You should see the test page with three badges at the top. "Local server: connected" should be green.
3. Log in with `admin@demo.local` and `ChangeMe-Now-123`.
4. Type a made-up patient name and click **Register patient**.

*How to know it worked:* the patient appears in the list with a number like `DEMO-000001`.
*What you just proved:* page, then server, then PostgreSQL, then back to the page. Login with a scrambled (Argon2id) password also works.

### Step 11. Let other devices reach the server
1. **Find the server's address.** In a new PowerShell window type `ipconfig` and find **IPv4 Address**, e.g. `192.168.1.50`.
2. **Allow it through the firewall.** The first time the server ran, Windows may have asked about Node.js. You must tick **Private networks** and click Allow. If you missed it: Start, "Windows Defender Firewall", "Allow an app through firewall", find Node.js, tick Private.
3. On a **phone connected to the same Wi-Fi**, open `http://192.168.1.50:3000` (use YOUR address).

*How to know it worked:* the phone shows the same test page.

### Step 12. The live-update test (the exciting one)
1. Log in on the phone AND on the server PC (or a second PC).
2. On the phone register a patient called "Test Live One".
3. Watch the other screen.

*How to know it worked:* the other screen shows the new patient and a log line starting with `LIVE:` **without you refreshing**. That is "local realtime", and it needed no internet.

### Step 13. The internet-off test
1. Switch off the internet but keep the Wi-Fi network itself on. (Easiest: unplug the router's internet cable, or turn off mobile data on the server PC's hotspot if that is what you use.)
2. Register another patient on the phone.
3. Check the other device updates.

*How to know it worked:* everything keeps working. The "Cloud" badge may say "not configured" or "internet offline". That is expected: it just reports the state.

### Step 14. The stop-and-restart test
1. In the PowerShell window running the server, press **Ctrl + C**. It should say it is shutting down cleanly.
2. Run `npm start` again. Log in again.

*How to know it worked:* all the patients you registered are still there. The data lives in PostgreSQL, not in the server program.

### Step 15. Backup and restore test
**Backup.** Make sure PostgreSQL's tools are available. In PowerShell:
```
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
$env:DATABASE_URL = "postgres://medhub:pick-a-password@localhost:5432/medhub"
cd C:\goodie-spike\scripts
Set-ExecutionPolicy -Scope Process Bypass
.\backup.ps1
```
*How to know it worked:* it prints `Backup OK and readable: .\backups\medhub-....dump`.

**Restore into a new empty database** (this simulates a replacement server):
1. In SQL Shell (psql), logged in as **postgres**: `CREATE DATABASE medhub_restore OWNER medhub;` then `\q`
2. In PowerShell (use your real file name):
   ```
   pg_restore --clean --if-exists --no-owner --dbname="postgres://medhub:pick-a-password@localhost:5432/medhub_restore" .\backups\medhub-YYYYMMDD-HHMMSS.dump
   ```
3. Check it: in SQL Shell, connect to database `medhub_restore` as `medhub` and run `SELECT count(*) FROM patients;`

*How to know it worked:* the count equals the number of patients you registered.

### Step 16 (optional for now). Turn on HTTPS
Some browser features (like installing the app as a phone app) need the padlock. This uses a free private certificate authority (CA). It was tested and works.
1. Install **Git for Windows** (free); it includes OpenSSL and "Git Bash".
2. Open Git Bash, then:
   ```
   cd /c/goodie-spike/scripts
   bash make-local-ca.sh goodie-medhub.local 192.168.1.50
   ```
   (use your own IP). It creates files in the `tls` folder.
3. In `server\.env` set:
   ```
   TLS_KEY=../tls/server.key
   TLS_CERT=../tls/server.crt
   ```
4. Install `tls\hospital-ca.crt` on each device ONCE:
   - **Windows PC:** double-click it, Install Certificate, Local Machine, "Trusted Root Certification Authorities".
   - **Android:** Settings, Security, Install a certificate, CA certificate.
   - **iPhone:** send it to the phone, install the profile, then Settings, General, About, Certificate Trust Settings, switch it on.
5. Restart the server and open `https://192.168.1.50:3000`.

**NEVER share `hospital-ca.key`.** Whoever has it can create fake certificates for your hospital.

---

## PART 4. If the server is Linux (differences only)

| Task | Linux command |
|---|---|
| Install Node 22 | Use the official NodeSource or `nvm` instructions at nodejs.org |
| Install PostgreSQL | `sudo apt install postgresql` |
| Create user/database | `sudo -u postgres psql` then the same two CREATE lines as Step 4 |
| Build tables | `psql "postgres://medhub:PASSWORD@localhost/medhub" -f server/schema.sql` |
| Open the firewall | `sudo ufw allow 3000/tcp` |
| Find the IP | `ip a` |
| Backup | `DATABASE_URL=... bash scripts/backup.sh` (schedule with `cron`) |
| Restore | `DATABASE_URL=... bash scripts/restore.sh backups/file.dump` |

Everything else (Steps 6 to 14) is identical.

---

## PART 5. Troubleshooting

| Problem | Likely reason and fix |
|---|---|
| `node` is not recognised | Close and reopen PowerShell after installing Node. |
| `npm install` errors on `argon2` | Needs internet; or Node is too old. Check `node -v` is 22+. |
| Server says "Set DATABASE_URL and a real SESSION_SECRET" | `.env` missing or still has CHANGE_ME. Redo Step 6. |
| `password authentication failed` | The password in `.env` differs from the one in Step 4. |
| `permission denied for table` | Tables were built as postgres. Redo Step 5 logged in as `medhub`. |
| Phone cannot open the page | Same Wi-Fi? Correct IP? Firewall Private box ticked (Step 11)? Phone is not on mobile data? |
| "Too many attempts" at login | Limit is 5 tries per minute. Wait a minute. |
| Port 3000 already in use | Change `PORT=3001` in `.env` and use that port everywhere. |
| `pg_dump` not recognised | Add PostgreSQL's `bin` folder to the path (first line of Step 15). |
| `backup.ps1` blocked | Run `Set-ExecutionPolicy -Scope Process Bypass` first. |

---

## PART 6. Send me these results

Copy this and fill it in:

```
Step 2  Node version shown:
Step 8  Seed message shown? yes/no
Step 9  Server started? yes/no
Step 10 Login + register works on same PC? yes/no
Step 11 Phone opened the page? yes/no
Step 12 Live update on other screen? yes/no
Step 13 Works with internet off? yes/no
Step 14 Data still there after restart? yes/no
Step 15 Backup ok? yes/no   Restore count matches? yes/no
Step 16 HTTPS tried? yes/no  Which devices worked?
Any error text (copy exactly):
```

With this I will fix anything that failed and write the official **Phase 0 report** for your approval.

---

## PART 7. Safety notes

1. Change the demo password `ChangeMe-Now-123` if the server stays on.
2. Never put the Supabase **service-role key** anywhere in this folder or in your React code.
3. Keep `.env` and `hospital-ca.key` private.
4. This is a test. It is not ready for real patient data.
5. Short-cuts in this spike that Phase 1 will fix: login sessions cannot be cancelled by the server yet; there is no cloud-sync worker yet (changes just wait in the `sync_outbox` table); the login limiter resets if the server restarts.

---

## PART 8. What happens after Phase 0

1. You approve the Phase 0 report.
2. **Phase 1, first job:** export your live Supabase tables (the base schema files in your repo are empty) so the local database matches your real one.
3. Move login and one module at a time onto the local server, keeping your existing offline code as a safety layer.
4. Build the cloud-sync worker, server registration, the 30-day subscription lease, automatic encrypted backups and server replacement.

## PART 9. Cost of everything

| Part | Cost |
|---|---|
| Node.js, Fastify, WebSocket tool | FREE / OPEN SOURCE |
| PostgreSQL | FREE / OPEN SOURCE |
| Argon2id | FREE / OPEN SOURCE |
| OpenSSL (certificates) | FREE / OPEN SOURCE |
| Git for Windows (for Step 16 only) | FREE / OPEN SOURCE |
| Existing PC and Wi-Fi | NOT REQUIRED to buy anything |
| A custom domain name (only if you later want it) | OPTIONAL PAID |
