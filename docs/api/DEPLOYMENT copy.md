# Deployment Guide

Complete deployment guide for deploying your FastAPI application to production with CI/CD, monitoring, and best practices.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [DNS Configuration](#dns-configuration)
4. [Traefik Setup](#traefik-setup)
5. [Environment Variables](#environment-variables)
6. [Deploy Application](#deploy-application)
7. [CI/CD with GitHub Actions](#cicd-with-github-actions)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

## 🎯 Prerequisites

### What You Need

- ✅ A remote server (VPS) with:
  - Ubuntu 22.04 LTS or similar
  - Minimum 2GB RAM
  - 2 CPU cores
  - 20GB storage
  - Root or sudo access

- ✅ Domain: `barrels.gd`
  - API will be at: `api.barrels.gd`
  - Traefik dashboard: `traefik.barrels.gd`
  - Staging API: `api.staging.barrels.gd`
  - Adminer (DB admin): `adminer.barrels.gd`

- ✅ Tools installed locally:
  - Docker & Docker Compose
  - Git
  - SSH client
  - Python 3.11+

## 🖥️ Server Setup

### 1. Initial Server Configuration

SSH into your server:

```bash
ssh root@your-server-ip
```

### 2. Update System

```bash
apt update && apt upgrade -y
```

### 3. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify installation
docker --version
docker compose version
```

### 4. Create Project Directory

```bash
mkdir -p /root/code/barrels-api
mkdir -p /root/code/traefik-public
```

### 5. Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 🌐 DNS Configuration

Configure your DNS records at your domain registrar:

### Required DNS Records

```
Type    Name        Value               TTL
A       @           YOUR_SERVER_IP      3600
A       api         YOUR_SERVER_IP      3600
A       traefik     YOUR_SERVER_IP      3600
A       adminer     YOUR_SERVER_IP      3600
A       *.staging   YOUR_SERVER_IP      3600
CNAME   www         barrels.gd          3600
```

### Verify DNS

Wait 5-10 minutes for DNS propagation, then verify:

```bash
# From your local machine
dig api.barrels.gd
dig traefik.barrels.gd
```

## 🔄 Traefik Setup

Traefik handles:
- Reverse proxy
- HTTPS certificates (Let's Encrypt)
- Load balancing
- Dashboard

### 1. Create Traefik Docker Network

```bash
docker network create traefik-public
```

### 2. Create Traefik Docker Compose File

Create `/root/code/traefik-public/docker-compose.traefik.yml`:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certificates:/certificates
    command:
      # Enable Docker provider
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=traefik-public
      
      # Entry points
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      
      # Redirect HTTP to HTTPS
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      
      # Let's Encrypt
      - --certificatesresolvers.le.acme.email=${EMAIL}
      - --certificatesresolvers.le.acme.storage=/certificates/acme.json
      - --certificatesresolvers.le.acme.tlschallenge=true
      
      # Dashboard
      - --api.dashboard=true
      
      # Logging
      - --log.level=INFO
      - --accesslog=true
    
    labels:
      - traefik.enable=true
      
      # Dashboard
      - traefik.http.routers.traefik-dashboard.rule=Host(`traefik.${DOMAIN}`)
      - traefik.http.routers.traefik-dashboard.entrypoints=websecure
      - traefik.http.routers.traefik-dashboard.tls.certresolver=le
      - traefik.http.routers.traefik-dashboard.service=api@internal
      - traefik.http.routers.traefik-dashboard.middlewares=admin-auth
      
      # Basic Auth for Dashboard
      - traefik.http.middlewares.admin-auth.basicauth.users=${USERNAME}:${HASHED_PASSWORD}
    
    networks:
      - traefik-public
    
    restart: unless-stopped

networks:
  traefik-public:
    external: true

volumes:
  traefik-certificates:
```

### 3. Set Traefik Environment Variables

```bash
# Set your domain
export DOMAIN=barrels.gd

# Set your email for Let's Encrypt
export EMAIL=admin@barrels.gd

# Set dashboard username
export USERNAME=admin

# Set dashboard password
export PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Generate hashed password
export HASHED_PASSWORD=$(openssl passwd -apr1 $PASSWORD)

# Save credentials (IMPORTANT: Save these securely!)
echo "Traefik Dashboard Credentials:" > /root/traefik-credentials.txt
echo "URL: https://traefik.barrels.gd" >> /root/traefik-credentials.txt
echo "Username: $USERNAME" >> /root/traefik-credentials.txt
echo "Password: $PASSWORD" >> /root/traefik-credentials.txt
chmod 600 /root/traefik-credentials.txt
```

### 4. Start Traefik

```bash
cd /root/code/traefik-public
docker compose -f docker-compose.traefik.yml up -d

# Check logs
docker compose -f docker-compose.traefik.yml logs -f
```

### 5. Verify Traefik

Visit `https://traefik.barrels.gd` - you should see the Traefik dashboard (use the credentials you saved).

## 🔐 Environment Variables

### 1. Generate Secret Keys

```bash
# Generate SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Generate POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Generate FIRST_SUPERUSER_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Create Production .env File

Create `/root/code/barrels-api/.env`:

```bash
# Environment
ENVIRONMENT=production
DOMAIN=barrels.gd
STACK_NAME=barrels-api-prod

# Project
PROJECT_NAME="Barrels API"

# Backend
BACKEND_CORS_ORIGINS=["https://barrels.gd","https://www.barrels.gd","https://api.barrels.gd"]

# Security
SECRET_KEY=YOUR_GENERATED_SECRET_KEY_HERE
FIRST_SUPERUSER=admin@barrels.gd
FIRST_SUPERUSER_PASSWORD=YOUR_GENERATED_PASSWORD_HERE

# Database
POSTGRES_SERVER=db
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_GENERATED_DB_PASSWORD_HERE

# Email (Optional - configure if you have SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_TLS=True
EMAILS_FROM_EMAIL=noreply@barrels.gd
EMAILS_FROM_NAME="Barrels API"

# Sentry (Optional - for error tracking)
SENTRY_DSN=

# API
API_V1_STR=/api/v1
```

### 3. Create Staging .env File (Optional)

Create `/root/code/barrels-api/.env.staging`:

```bash
# Environment
ENVIRONMENT=staging
DOMAIN=staging.barrels.gd
STACK_NAME=barrels-api-staging

# ... (same as production but with staging values)
```

## 🚀 Deploy Application

### 1. Create Production Docker Compose

Create `/root/code/barrels-api/docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:16
    volumes:
      - app-db-data:/var/lib/postgresql/data
    env_file:
      - .env
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-app}
    networks:
      - default
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: ghcr.io/yourusername/barrels-api:latest  # Update with your registry
    depends_on:
      db:
        condition: service_healthy
    env_file:
      - .env
    environment:
      - DOMAIN=${DOMAIN}
      - ENVIRONMENT=${ENVIRONMENT}
      - BACKEND_CORS_ORIGINS=${BACKEND_CORS_ORIGINS}
      - SECRET_KEY=${SECRET_KEY}
      - FIRST_SUPERUSER=${FIRST_SUPERUSER}
      - FIRST_SUPERUSER_PASSWORD=${FIRST_SUPERUSER_PASSWORD}
      - POSTGRES_SERVER=db
      - POSTGRES_PORT=${POSTGRES_PORT}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik-public
      - traefik.constraint-label=traefik-public
      
      # HTTP Router
      - traefik.http.routers.${STACK_NAME}-api-http.rule=Host(`api.${DOMAIN}`)
      - traefik.http.routers.${STACK_NAME}-api-http.entrypoints=web
      
      # HTTPS Router
      - traefik.http.routers.${STACK_NAME}-api-https.rule=Host(`api.${DOMAIN}`)
      - traefik.http.routers.${STACK_NAME}-api-https.entrypoints=websecure
      - traefik.http.routers.${STACK_NAME}-api-https.tls=true
      - traefik.http.routers.${STACK_NAME}-api-https.tls.certresolver=le
      
      # Service
      - traefik.http.services.${STACK_NAME}-api.loadbalancer.server.port=8000
    
    networks:
      - traefik-public
      - default
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/utils/health-check/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  adminer:
    image: adminer:latest
    depends_on:
      - db
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik-public
      - traefik.constraint-label=traefik-public
      
      # HTTPS Router
      - traefik.http.routers.${STACK_NAME}-adminer-https.rule=Host(`adminer.${DOMAIN}`)
      - traefik.http.routers.${STACK_NAME}-adminer-https.entrypoints=websecure
      - traefik.http.routers.${STACK_NAME}-adminer-https.tls=true
      - traefik.http.routers.${STACK_NAME}-adminer-https.tls.certresolver=le
      
      # Service
      - traefik.http.services.${STACK_NAME}-adminer.loadbalancer.server.port=8080
    
    networks:
      - traefik-public
      - default
    restart: unless-stopped

volumes:
  app-db-data:

networks:
  traefik-public:
    external: true
  default:
    driver: bridge
```

### 2. Copy Files to Server

From your local machine:

```bash
# Copy docker compose file
scp docker-compose.prod.yml root@your-server-ip:/root/code/barrels-api/

# Copy .env file (after creating it locally with production values)
scp .env.production root@your-server-ip:/root/code/barrels-api/.env
```

### 3. Deploy

On your server:

```bash
cd /root/code/barrels-api

# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check logs
docker compose -f docker-compose.prod.yml logs -f api

# Run migrations
docker compose -f docker-compose.prod.yml exec api uv run alembic upgrade head

# Create initial superuser (if needed)
docker compose -f docker-compose.prod.yml exec api uv run python -c "from sqlmodel import Session; from src.database import engine, init_db; session = Session(engine); init_db(session)"
```

### 4. Verify Deployment

```bash
# Check services are running
docker compose -f docker-compose.prod.yml ps

# Test API
curl https://api.barrels.gd/api/v1/utils/health-check/

# Test docs
curl https://api.barrels.gd/docs
```

## 🔄 CI/CD with GitHub Actions

### 1. Create GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

```
SERVER_HOST=your-server-ip
SERVER_USER=root
SSH_PRIVATE_KEY=your-ssh-private-key
DOCKER_USERNAME=your-docker-username
DOCKER_TOKEN=your-docker-token
```

### 2. Create Deployment Workflow

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Build and test
        run: |
          docker compose build
          docker compose up -d
          docker compose exec -T api uv run pytest tests/ -v
      
      - name: Run pre-deployment checks
        run: |
          chmod +x scripts/pre-deploy.sh
          ./scripts/pre-deploy.sh

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /root/code/barrels-api
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
            docker compose -f docker-compose.prod.yml exec -T api uv run alembic upgrade head
            docker compose -f docker-compose.prod.yml logs --tail=50 api
```

### 3. Create Staging Workflow

Create `.github/workflows/deploy-staging.yml` (similar to production but with staging environment).

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# API health
curl https://api.barrels.gd/api/v1/utils/health-check/

# Check all services
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f db
```

### Backup Database

```bash
# Create backup
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres app > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres app < backup_file.sql
```

### Update Application

```bash
cd /root/code/barrels-api
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api uv run alembic upgrade head
```

### View Metrics

```bash
# Container stats
docker stats

# Disk usage
df -h

# Memory usage
free -h
```

## 🛠️ Troubleshooting

### API Not Responding

```bash
# Check if container is running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs api

# Restart service
docker compose -f docker-compose.prod.yml restart api
```

### Database Connection Issues

```bash
# Check database is running
docker compose -f docker-compose.prod.yml ps db

# Check database logs
docker compose -f docker-compose.prod.yml logs db

# Test connection
docker compose -f docker-compose.prod.yml exec db psql -U postgres -c "SELECT 1"
```

### SSL Certificate Issues

```bash
# Check Traefik logs
cd /root/code/traefik-public
docker compose -f docker-compose.traefik.yml logs traefik

# Verify certificates
docker compose -f docker-compose.traefik.yml exec traefik cat /certificates/acme.json
```

### Clear Everything and Redeploy

```bash
cd /root/code/barrels-api
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

## 🔒 Security Best Practices

1. ✅ **Change all default passwords**
2. ✅ **Use strong SECRET_KEY**
3. ✅ **Enable firewall (ufw)**
4. ✅ **Keep Docker updated**
5. ✅ **Regular backups**
6. ✅ **Monitor logs**
7. ✅ **Use HTTPS only**
8. ✅ **Limit SSH access**
9. ✅ **Enable fail2ban**
10. ✅ **Regular security updates**

## 🌐 URLs After Deployment

- 🌐 **API**: https://api.barrels.gd
- 📚 **API Docs**: https://api.barrels.gd/docs
- 📊 **Traefik Dashboard**: https://traefik.barrels.gd
- 🗄️ **Adminer**: https://adminer.barrels.gd
- 🧪 **Staging API**: https://api.staging.barrels.gd

## 🎯 Next Steps

1. ✅ Set up monitoring (Sentry, Datadog, etc.)
2. ✅ Configure email service
3. ✅ Set up automated backups
4. ✅ Configure CDN (Cloudflare)
5. ✅ Set up log aggregation
6. ✅ Enable rate limiting
7. ✅ Configure alerts

## 📋 Deployment Checklist

- [ ] Server provisioned
- [ ] DNS configured
- [ ] Traefik running
- [ ] Environment variables set
- [ ] Application deployed
- [ ] Migrations applied
- [ ] Superuser created
- [ ] HTTPS working
- [ ] Health checks passing
- [ ] Backups configured
- [ ] Monitoring enabled
- [ ] CI/CD configured

🚀 **Ready to deploy!**