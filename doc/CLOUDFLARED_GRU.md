# Cloudflare Tunnel for the Recommender on `gru`

Goal: expose the recommender API running on `gru` at `localhost:8100` as
`https://recommender.timkolesnichenko.me` so Firebase Functions can reach it
over public IPv4 + HTTPS without depending on Tailscale Funnel.

Prerequisites:

- `timkolesnichenko.me` is active in Cloudflare DNS.
- You have SSH access to `gru`.
- The backend stack is already healthy on `gru`:

```sh
cd /opt/drp03-backend
docker compose ps
curl -fsS http://localhost:8100/health
```

## 1. Install `cloudflared` on `gru`

For Debian/Ubuntu, use Cloudflare's package repository:

```sh
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg |
  sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" |
  sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version
```

## 2. Authenticate and create the tunnel

Run this from your SSH session on `gru`:

```sh
cloudflared tunnel login
cloudflared tunnel create drp03-recommender-gru
cloudflared tunnel list
```

`cloudflared tunnel login` prints a browser URL. Open it locally, choose the
`timkolesnichenko.me` zone, then return to the SSH session.

## 3. Configure ingress

Find the tunnel UUID:

```sh
cloudflared tunnel list
```

Create `~/.cloudflared/config.yml` on `gru`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/<USER>/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: recommender.timkolesnichenko.me
    service: http://localhost:8100
  - service: http_status:404
```

Replace `<USER>` and `<TUNNEL-UUID>` with the actual values on `gru`.

## 4. Create the DNS route

```sh
cloudflared tunnel route dns drp03-recommender-gru recommender.timkolesnichenko.me
```

This creates the Cloudflare DNS record that points the hostname at the tunnel.

## 5. Run it as a system service

```sh
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

After changing `~/.cloudflared/config.yml`, reload with:

```sh
sudo systemctl restart cloudflared
```

## 6. Validate the public endpoint

From a machine outside the tailnet:

```sh
curl -i https://recommender.timkolesnichenko.me/health
curl -i https://recommender.timkolesnichenko.me/docs
```

The health endpoint should return `{"status":"ok"}`. Application endpoints
should still require `X-Deadline-Food-API-Key` because the FastAPI app enforces
that header.

## 7. Point Firebase Functions at the tunnel

```sh
firebase functions:secrets:set RECOMMENDER_API_URL --project drp03-50059
# Enter: https://recommender.timkolesnichenko.me

firebase deploy --only functions --project drp03-50059
```

Useful checks after deployment:

```sh
firebase functions:log --project drp03-50059 --only deadlineFoodRecommendations
journalctl -u cloudflared -f
```
