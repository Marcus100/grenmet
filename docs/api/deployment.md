# API Deployment Guide

> **Note**: This documentation is for the FastAPI backend located at `apps/api/fastapi/`

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

### 2. Start Traefik

See `apps/api/fastapi/docker-compose.traefik.yml` for the Traefik configuration.

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

Create `/home/github/.config/barrels-api/production.env` on your server with the appropriate values.

## 🚀 Deploy Application

### Quick Start

```bash
# Generate strong secrets for production
cd apps/api/fastapi
chmod +x scripts/generate-secrets.sh
./scripts/generate-secrets.sh generate /tmp/production-secrets.env

# Review and copy to your server
cat /tmp/production-secrets.env
```

### Deploy via GitHub Actions

1. Create a release to trigger deployment:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## 🔄 CI/CD with GitHub Actions

### Workflows Overview

- **CI** (`.github/workflows/api/ci.yml`) - Runs on every push/PR: tests, linting, security scans
- **Deploy Production** (`.github/workflows/api/deploy-production.yml`) - Deploys on release tags
- **Deploy Staging** (`.github/workflows/api/deploy-staging.yml`) - Deploys on master branch
- **Backup Database** (`.github/workflows/api/backup-database.yml`) - Daily automated backups
- **Test Docker** (`.github/workflows/api/test-docker-compose.yml`) - Tests Docker setup

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

### Useful Commands

```bash
# Check running containers
docker compose -p barrels-api ps

# View logs
docker compose -p barrels-api logs api
docker compose -p barrels-api logs db

# Manual backup
./scripts/backup-database.sh

# Generate new secrets
./scripts/generate-secrets.sh generate
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

🚀 **Ready to deploy!**
