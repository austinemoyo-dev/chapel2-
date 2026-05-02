# Chapel Attendance System — Hostinger VPS Deployment Guide

This guide takes you from a **fresh Hostinger VPS** to a fully live, HTTPS-secured
production deployment. Follow the steps in order.

---

## Prerequisites

- A Hostinger VPS running **Ubuntu 22.04** (recommended plan: VPS 2 or higher — DeepFace
  needs at least 2 GB RAM)
- A domain name pointed at your VPS (A record set in Hostinger DNS)
- Your project code pushed to a Git repository (GitHub, GitLab, etc.)
- SSH access to your VPS

---

## STEP 1 — Connect to Your VPS & Initial Setup

```bash
# From your local machine — replace with your VPS IP
ssh root@YOUR_VPS_IP

# Update the system
apt update && apt upgrade -y

# Create a deploy user (safer than running everything as root)
adduser deploy
usermod -aG sudo deploy

# Copy your SSH key to the deploy user so you can log in without a password
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Switch to the deploy user for all remaining steps
su - deploy
```

---

## STEP 2 — Install Docker & Docker Compose

```bash
# Install Docker using the official script
curl -fsSL https://get.docker.com | sudo bash

# Add your user to the docker group (so you don't need sudo for every docker command)
sudo usermod -aG docker $USER

# Apply the group change without logging out
newgrp docker

# Verify Docker is running
docker --version
docker compose version
```

---

## STEP 3 — Install Nginx & Certbot (on the host, not in Docker)

Nginx runs on the host so Certbot can manage SSL certificate renewal easily.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Stop nginx temporarily so certbot can bind to port 80
sudo systemctl stop nginx
```

---

## STEP 4 — Point Your Domain to the VPS

In your **Hostinger DNS panel**:

1. Go to **Domains → Manage → DNS / Nameservers**
2. Add or edit the **A record**:
   - **Host**: `@` (for the root domain) and `www`
   - **Points to**: your VPS IP address
   - **TTL**: 300

Wait 5–15 minutes for DNS to propagate. You can check with:
```bash
# Run this from your local machine
nslookup YOUR_DOMAIN
# It should return your VPS IP
```

---

## STEP 5 — Get Your SSL Certificate

```bash
# Replace YOUR_DOMAIN with your actual domain
sudo certbot certonly --standalone -d YOUR_DOMAIN -d www.YOUR_DOMAIN \
  --email YOUR_EMAIL --agree-tos --no-eff-email

# Verify the certificate was issued
sudo ls /etc/letsencrypt/live/YOUR_DOMAIN/
# You should see: cert.pem  chain.pem  fullchain.pem  privkey.pem
```

Auto-renewal is set up automatically. Verify it works:
```bash
sudo certbot renew --dry-run
```

---

## STEP 6 — Upload the Project to the VPS

```bash
# On the VPS — clone your repository
cd /home/deploy
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git chapel1
cd chapel1
```

---

## STEP 7 — Create Your .env File

```bash
# Copy the template
cp .env.example .env

# Open it for editing
nano .env
```

Fill in every `<CHANGE_THIS>` value:

| Variable | How to generate / what to put |
|---|---|
| `DJANGO_SECRET_KEY` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_ALLOWED_HOSTS` | `vuchapel.com.ng,www.vuchapel.com.ng` |
| `CORS_ALLOWED_ORIGINS` | `https://vuchapel.com.ng,https://www.vuchapel.com.ng` |
| `DB_PASSWORD` | Run: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_DOMAIN` | `vuchapel.com.ng` |
| `NEXT_PUBLIC_API_URL` | `https://vuchapel.com.ng` |

Save with `Ctrl+O`, exit with `Ctrl+X`.

```bash
# Lock down the .env file — only your user can read it
chmod 600 .env
```

---

## STEP 8 — Configure Nginx on the Host

```bash
# Copy the project's nginx config to the nginx sites directory
sudo cp nginx/nginx.conf /etc/nginx/sites-available/chapel1

# Edit it — replace placeholders with your actual values
sudo nano /etc/nginx/sites-available/chapel1
```

Make these replacements inside the file:

| Placeholder | Replace with |
|---|---|
| `YOUR_DOMAIN` | Your actual domain (e.g. `chapel.youruniversity.edu`) |
| `YOUR_ADMIN_IP` | Your home/office IP — find it with: `curl ifconfig.me` |

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/chapel1 /etc/nginx/sites-enabled/chapel1

# Remove the default nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Test the configuration — must say "syntax is ok"
sudo nginx -t

# Start nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## STEP 9 — Build and Start the Application

```bash
# From the chapel directory
cd /home/deploy/chapel

# Build Docker images and start all containers in the background
# This step downloads all dependencies and builds the app — it will take
# 5-15 minutes on first run (DeepFace model weights are ~90 MB)
docker compose up -d --build

# Watch the build progress
docker compose logs -f
# Press Ctrl+C when you see "Gunicorn booted" and "Next.js ready"
```

---

## STEP 10 — First-Run Database Setup

Run these once after the first deploy:

```bash
# Run database migrations
docker compose exec backend python manage.py migrate

# Create the Superadmin account
# Replace the values below with your real admin details
docker compose exec backend python manage.py create_superadmin \
  --email austineakinmoyo@gmail.com \
  --name "austinemoyo" \
  --password "akinmoyo" \
  --noinput

# Collect static files (in case collectstatic didn't run during build)
docker compose exec backend python manage.py collectstatic --noinput
```

---

## STEP 11 — Verify Everything Is Live

Run these verification checks:

```bash
# 1. HTTPS working and security headers present
curl -I https://YOUR_DOMAIN
# Expect: HTTP/2 200, Strict-Transport-Security header

# 2. Face samples are blocked (biometric data protection)
curl -I https://vuchapel.com.ng/media/face_samples/
# Expect: 403 Forbidden

# 3. API is responding
curl https://vuchapel.com.ng/api/registration/status/
# Expect: {"registration_open": false, ...}

# 4. HTTP redirects to HTTPS
curl -I http://vuchapel.com.ng
# Expect: 301 redirect to https://

# 5. Check all containers are running
docker compose ps
# Expect: db, backend, frontend — all "running"

# 6. Check application logs for errors
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
```

Then open `https://YOUR_DOMAIN` in a browser and:
- Log in as Superadmin
- Open registration
- Register a test student
- Upload face samples

---

## Post-Deployment: First Admin Steps

After going live, do these in the dashboard before announcing the system:

1. **Set up the geo-fence** — Go to Settings → Geo-fence and enter the chapel GPS coordinates and radius. Attendance marking is blocked until this is configured.
2. **Create a semester** — Go to Services → Semesters → New Semester.
3. **Add services** — Add the first week of midweek and Sunday services.
4. **Set service capacities** — Configure S1/S2/S3 student caps per service.
5. **Open registration** — Go to Settings → Open registration window.
6. **Create Protocol Member accounts** — Add accounts for your protocol team and bind their devices.

---

## Ongoing Operations

### Update the app (after a code change)

```bash
cd /home/deploy/chapel
git pull origin main
docker compose up -d --build
docker compose exec backend python manage.py migrate --noinput # use this whenever there is a change in the models.py file
```

### Restart a single service

```bash
docker compose restart backend
docker compose restart frontend
sudo nginx -s reload  #reloads nginx

```

### View live logs

```bash
# All services
docker compose logs -f

# Django only
docker compose logs -f backend

# Application log file (inside the container)
docker compose exec backend tail -f /var/log/chapel/django.log
```

### Backup the database

```bash
# Creates a timestamped SQL dump in your home directory
docker compose exec db pg_dump -U $DB_USER $DB_NAME \
  > ~/chapel_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore a backup

```bash
cat chapel_backup_YYYYMMDD_HHMMSS.sql | \
  docker compose exec -T db psql -U $DB_USER $DB_NAME
```

### SSL certificate renewal (automatic, but you can test it)

```bash
sudo certbot renew --dry-run
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `DJANGO_SECRET_KEY environment variable is not set` | Check your `.env` file — the variable must be present and non-empty |
| `DB_PASSWORD environment variable is not set` | Same — fill in DB_PASSWORD in `.env` |
| Containers keep restarting | Run `docker compose logs backend` to see the error |
| 502 Bad Gateway from nginx | Backend container hasn't started yet — wait and retry, or check `docker compose ps` |
| Face upload returns 403 | Registration window is closed. Open it in the admin dashboard |
| Attendance returns "Geo-fence not configured" | Set chapel GPS coordinates in Settings → Geo-fence |
| Can't reach `/admin/` | Your IP address isn't in the nginx `allow` list — update `YOUR_ADMIN_IP` in nginx.conf and reload: `sudo nginx -s reload` |
| DeepFace model download fails | Run manually: `docker compose exec backend python manage.py shell -c "from deepface import DeepFace; DeepFace.build_model('Facenet512')"` |
