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

Create `.env.production` from `.env.production.example` and set a secure `JWT_SECRET`.

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
