#!/bin/bash
# Simple Secret Generation Script
# Generates strong secrets for production deployment

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to generate strong secrets
generate_secret() {
    local length="${1:-32}"
    
    # Generate a strong random secret
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
    else
        # Fallback to /dev/urandom
        head -c "$length" /dev/urandom | base64 | tr -d "=+/" | cut -c1-"$length"
    fi
}

# Main script logic
case "${1:-help}" in
    generate)
        output_file="${2:-/tmp/generated-secrets.env}"
        
        log_info "Generating new strong secrets..."
        
        cat > "$output_file" << EOF
# Generated secrets - $(date)
# Copy these to your production .env file and store securely

# Application secrets
SECRET_KEY=$(generate_secret 64)
POSTGRES_PASSWORD=$(generate_secret 32)
FIRST_SUPERUSER_PASSWORD=$(generate_secret 24)

# Email service (if using Resend)
RESEND_API_KEY=$(generate_secret 32)

# Optional: Generate additional secrets as needed
# SMTP_PASSWORD=$(generate_secret 24)
# JWT_SECRET=$(generate_secret 32)
EOF
        
        log_success "New secrets generated in: $output_file"
        echo ""
        echo "📋 Next steps:"
        echo "1. Review the generated secrets"
        echo "2. Copy them to your production .env file"
        echo "3. Store the .env file securely on your server"
        echo "4. Remove this temporary file: rm $output_file"
        ;;
    help|*)
        echo "Simple Secret Generation Script"
        echo "==============================="
        echo ""
        echo "Usage: $0 <command> [arguments]"
        echo ""
        echo "Commands:"
        echo "  generate [output_file]  - Generate new strong secrets"
        echo "  help                   - Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 generate"
        echo "  $0 generate /tmp/my-secrets.env"
        echo ""
        echo "Generated secrets include:"
        echo "  - SECRET_KEY (64 chars)"
        echo "  - POSTGRES_PASSWORD (32 chars)"
        echo "  - FIRST_SUPERUSER_PASSWORD (24 chars)"
        echo "  - RESEND_API_KEY (32 chars)"
        ;;
esac
