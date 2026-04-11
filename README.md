# trmm-vault

A Vaultwarden credential panel for [TacticalRMM](https://github.com/amidaware/tacticalrmm).

Adds a **🔑 Vault** button to your TacticalRMM web UI that shows credentials from Vaultwarden for the current client — with one-click copy for username, password, and OTP.

![Panel showing credential cards with Copy Username, Copy Password, and Copy OTP buttons]

## How it works

- **vault-proxy** — a small FastAPI service that wraps the Bitwarden CLI (`bw`) and exposes a simple REST API for orgs, credentials, and TOTP codes
- **Tampermonkey userscript** — injects the Vault button and panel into TacticalRMM, auto-matching the current TRMM client to the corresponding Vaultwarden organization

## Structure

```
trmm-vault/
├── tampermonkey/
│   └── trmm-vault.user.js   # Install this in Tampermonkey
├── vault-proxy/
│   ├── main.py              # FastAPI service
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
└── nginx/
    └── trmm-vault-location.conf  # Add to your TRMM nginx config
```

## Prerequisites

- [TacticalRMM](https://github.com/amidaware/tacticalrmm) instance with HTTPS
- [Vaultwarden](https://github.com/dani-garcia/vaultwarden) instance
- Vaultwarden **Organizations** named to match your TRMM clients
- [Tampermonkey](https://www.tampermonkey.net/) browser extension (developer mode enabled in `chrome://extensions`)

## Vaultwarden Setup

Organize your Vaultwarden to mirror your TRMM clients:

- Create one **Organization** per TRMM client (names should match)
- Add **Login** items to each org — name, username, password, and optionally a TOTP key

## Installation

### 1. Deploy vault-proxy

Clone the repo and run with Docker Compose:

```bash
git clone https://github.com/Broshiro/trmm-vault
cd trmm-vault/vault-proxy
```

Edit `docker-compose.yml` and set your values:

```yaml
environment:
  - BW_EMAIL=your-vaultwarden-email@example.com
  - BW_PASSWORD=your-vaultwarden-master-password
  - BW_SERVER=https://your-vaultwarden-domain
  - CORS_ORIGINS=https://your-trmm-domain
```

Then start it:

```bash
docker compose up -d
```

### 2. Add the nginx location block

Add the contents of `nginx/trmm-vault-location.conf` to your TacticalRMM nginx config, **before** the existing `location /` block:

```nginx
location /vault-api/ {
    proxy_pass http://127.0.0.1:8200/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Reload nginx after saving.

> **Using SWAG?** Add the location block to your `trmm.subdomain.conf` file in `proxy-confs/`.

### 3. Install the Tampermonkey userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable **developer mode** in `chrome://extensions`
2. Open Tampermonkey → **Create new script**
3. Paste the contents of `tampermonkey/trmm-vault.user.js`
4. Update the two placeholders at the top:
   ```js
   // @match   https://YOUR-TRMM-DOMAIN/*
   // @connect YOUR-TRMM-DOMAIN
   ...
   const API = 'https://YOUR-TRMM-DOMAIN/vault-api';
   ```
5. Save and refresh TacticalRMM

## Usage

- Click **🔑 Vault** in the bottom-right corner of any TRMM page
- The panel auto-matches the current client to a Vaultwarden organization
- Use the dropdown to manually select a different org
- Click **Copy Username**, **Copy Password**, or **Copy OTP** on any credential card
- Click **↻** to sync new credentials from Vaultwarden

## License

MIT
