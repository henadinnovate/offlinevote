# DNS Configuration for offlinevote.falhen.com

This document outlines the exact DNS records and cloud configuration required to route **`offlinevote.falhen.com`** to the live Render deployment.

---

## 🌐 Domain Overview

| Property | Value |
|---|---|
| **Root Domain** | `falhen.com` |
| **Subdomain** | `offlinevote.falhen.com` |
| **Registrar** | Namecheap |
| **Active DNS Authority** | Cloudflare (`josh.ns.cloudflare.com`, `stephane.ns.cloudflare.com`) |
| **Hosting Platform** | Render Web Service (`offlinevote`) |
| **Default Render Target** | `offlinevote.onrender.com` |
| **Protocols Supported** | HTTPS (`https://offlinevote.falhen.com`), WSS (`wss://offlinevote.falhen.com`) |

---

## 📡 Cloudflare DNS Record Specifications

Since `falhen.com` nameservers are delegated to Cloudflare, the CNAME record must be entered into the Cloudflare DNS dashboard:

| Type | Name / Host | Target / Content | Proxy Status | TTL |
|---|---|---|---|---|
| **CNAME** | `offlinevote` | `offlinevote.onrender.com` | **DNS Only** (Grey Cloud) during initial SSL issuance; can switch to **Proxied** (Orange Cloud) afterwards | Auto |

> [!TIP]
> Setting **DNS Only** (Grey Cloud) initially allows Render's automated Let's Encrypt certificate challenge to verify and provision your custom domain certificate instantly.

---

## 🔒 Render Custom Domain Binding

In `render.yaml`, the custom domain is declared as:

```yaml
services:
  - type: web
    name: offlinevote
    runtime: node
    domains:
      - offlinevote.falhen.com
```

When Render deploys this service:
1. Render validates the CNAME record for `offlinevote.falhen.com`.
2. Automatically generates an auto-renewing TLS/SSL certificate.
3. Automatically routes WebSocket connections (`wss://offlinevote.falhen.com`) and HTTP traffic to Node port `10000`.

---

## 🧪 Verification Commands

Check DNS resolution after record creation:

```bash
# Check CNAME record
dig CNAME offlinevote.falhen.com +short

# Verify HTTPS response
curl -I https://offlinevote.falhen.com

# Verify WebSocket endpoint handshake
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Host: offlinevote.falhen.com" -H "Origin: https://offlinevote.falhen.com" https://offlinevote.falhen.com
```
