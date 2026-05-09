# Deploy for planote.ru

## 1) DNS

Create DNS records:

- A `planote.ru` -> `SERVER_IP`
- A `www.planote.ru` -> `SERVER_IP` (optional)

Wait until records propagate.

## 2) Upload project and install dependencies

```bash
cd /var/www/planote
npm ci
```

Create `.env.production` from `.env.production.example`, set a secure `JWT_SECRET`, and keep `DATA_DIR` on a persistent disk (example: `/var/lib/planote/data`).

Create the directory once:

```bash
sudo mkdir -p /var/lib/planote/data
sudo chown -R $USER:$USER /var/lib/planote/data
```

## 3) Start app with PM2

```bash
npm i -g pm2
cd /var/www/planote
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 4) Install and configure Nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo cp deploy/nginx/planote.ru.conf /etc/nginx/sites-available/planote.ru
sudo ln -sf /etc/nginx/sites-available/planote.ru /etc/nginx/sites-enabled/planote.ru
sudo nginx -t
sudo systemctl reload nginx
```

Now `http://planote.ru` should open.

## 5) Install certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d planote.ru -d www.planote.ru
```

If cert was issued but not installed before, run:

```bash
sudo certbot install --cert-name planote.ru
```

## 6) Auto-renew check

```bash
sudo certbot renew --dry-run
```

## 7) Quick troubleshooting

Verify Nginx has exact domain mapping:

```bash
sudo nginx -T | rg "server_name|listen"
```

If Certbot says no matching server block, verify `server_name planote.ru www.planote.ru;` in active config and reload Nginx.

## 8) If running in Docker

Always mount a persistent volume for app data, otherwise users and notes are lost after container recreation/reboot:

```bash
docker run -d \
  --name planote \
  -p 3002:3000 \
  --env-file .env.production \
  -v /var/lib/planote/data:/var/lib/planote/data \
  planote:latest
```
