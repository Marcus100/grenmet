#!/bin/bash
# Database backup script for manual execution
# Usage: ./scripts/backup-database.sh [backup_name]

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/github/backups}"
PROD_ENV="${PROD_ENV:-/home/github/.config/barrels-api/production.env}"
PROJECT_NAME="${PROJECT_NAME:-barrels-api}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ]; then
    log_warning "Running as root. Consider running as a non-root user."
fi

# Create backup directory
log_info "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Load environment variables
if [ -f "$PROD_ENV" ]; then
    log_info "Loading production environment from: $PROD_ENV"
    set -a
    source "$PROD_ENV"
    set +a
else
    log_error "Production environment file not found: $PROD_ENV"
    exit 1
fi

# Generate backup filename
if [ -n "${1:-}" ]; then
    BACKUP_NAME="$1"
else
    BACKUP_NAME="manual_$(date +%Y%m%d_%H%M%S)"
fi

BACKUP_FILENAME="barrels_api_backup_${BACKUP_NAME}.sql.gz"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILENAME"

log_info "Starting database backup: $BACKUP_FILENAME"

# Check if database is running
log_info "Checking database connectivity..."
if docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    log_success "Database is ready"
else
    log_error "Database is not ready or not running"
    exit 1
fi

# Create backup
log_info "Creating database backup..."
docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --verbose \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="/tmp/backup.dump"

# Copy backup from container to host
log_info "Copying backup to host..."
docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" cp "${PROJECT_NAME}-db-1:/tmp/backup.dump" "$BACKUP_PATH"

# Verify backup
if [ -f "$BACKUP_PATH" ] && [ -s "$BACKUP_PATH" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
    log_success "Backup created successfully: $BACKUP_FILENAME ($BACKUP_SIZE)"
else
    log_error "Backup creation failed"
    exit 1
fi

# Test backup integrity (optional)
if [ "${TEST_BACKUP:-true}" = "true" ]; then
    log_info "Testing backup integrity..."
    
    TEMP_DB_NAME="test_restore_$(date +%s)"
    
    # Create temporary database
    docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db createdb -U "$POSTGRES_USER" "$TEMP_DB_NAME"
    
    # Restore backup to temporary database
    docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db pg_restore \
        -U "$POSTGRES_USER" \
        -d "$TEMP_DB_NAME" \
        --verbose \
        --no-password \
        --clean \
        --if-exists \
        "/tmp/backup.dump"
    
    # Verify restore
    TABLE_COUNT=$(docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db psql \
        -U "$POSTGRES_USER" \
        -d "$TEMP_DB_NAME" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
    
    # Clean up temporary database
    docker compose -f docker-compose.prod.yml -p "$PROJECT_NAME" exec -T db dropdb -U "$POSTGRES_USER" "$TEMP_DB_NAME"
    
    if [ "$TABLE_COUNT" -gt 0 ]; then
        log_success "Backup integrity test passed ($TABLE_COUNT tables restored)"
    else
        log_error "Backup integrity test failed"
        exit 1
    fi
fi

# Clean up old backups
log_info "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "barrels_api_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# List remaining backups
log_info "Remaining backups:"
ls -lah "$BACKUP_DIR"/barrels_api_backup_*.sql.gz 2>/dev/null || log_warning "No backups found"

# Summary
echo ""
log_success "Backup Summary"
echo "=================="
echo "Backup file: $BACKUP_FILENAME"
echo "Backup size: $(du -h "$BACKUP_PATH" | cut -f1)"
echo "Backup location: $BACKUP_PATH"
echo "Retention: $RETENTION_DAYS days"
echo "Timestamp: $(date)"
echo ""

log_success "Database backup completed successfully!"
