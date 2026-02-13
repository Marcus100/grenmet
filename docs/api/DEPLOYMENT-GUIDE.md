# Deployment Guide

Simple guide for deploying your FastAPI application to Azure with GitHub Actions.

## Quick Start

### 1. Generate Secrets

```bash
# Generate strong secrets for production
chmod +x scripts/generate-secrets.sh
./scripts/generate-secrets.sh generate /tmp/production-secrets.env

# Review and copy to your server
cat /tmp/production-secrets.env
```

### 2. Setup Server

```bash
# On your Azure VM, create the production environment file
sudo mkdir -p /home/github/.config/barrels-api
sudo nano /home/github/.config/barrels-api/production.env

# Copy the generated secrets and add your configuration:
# SECRET_KEY=your-generated-secret
# POSTGRES_PASSWORD=your-generated-password
# FIRST_SUPERUSER_PASSWORD=your-generated-password
# DOMAIN=api.barrels.gd
# ENVIRONMENT=production
# ... (see DEPLOYMENT.md for full template)
```

### 3. Deploy

```bash
# Create a release to trigger deployment
git tag v1.0.0
git push origin v1.0.0
```

## Workflows Overview

- **CI** (`ci.yml`) - Runs on every push/PR: tests, linting, security scans
- **Deploy Production** (`deploy-production.yml`) - Deploys on release tags
- **Deploy Staging** (`deploy-staging.yml`) - Deploys on master branch
- **Backup Database** (`backup-database.yml`) - Daily automated backups
- **Test Docker** (`test-docker-compose.yml`) - Tests Docker setup

## Security Features

✅ **Implemented:**
- Resource limits on containers
- Vulnerability scanning in CI
- Secure health checks
- Automated backups
- Strong secret validation
- Runner cleanup

## Monitoring

- **Health Check**: `https://api.barrels.gd/api/v1/utils/health-check/`
- **API Docs**: `https://api.barrels.gd/docs`
- **Backups**: Stored in `/home/github/backups/` (30-day retention)

## Troubleshooting

### Common Issues

1. **Deployment fails**: Check GitHub Actions logs
2. **Health check fails**: Check container logs with `docker compose logs api`
3. **Database issues**: Check with `docker compose logs db`
4. **Secrets missing**: Verify `/home/github/.config/barrels-api/production.env` exists

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

## Next Steps

1. Set up monitoring (Azure Monitor, Sentry)
2. Configure email service (Resend/SMTP)
3. Set up log aggregation
4. Implement rate limiting
5. Configure CDN (Cloudflare)

For detailed setup instructions, see `DEPLOYMENT.md`.
