#!/bin/bash

# SSL Certificate Renewal Script for yitam.org
# This script is called by certbot after successful renewal

# Configuration
# Auto-detect project directory (works when script is in /usr/local/bin or project root)
if [ -d "/root/yitam" ]; then
    PROJECT_DIR="/root/yitam"
elif [ -d "/home/*/yitam" ]; then
    PROJECT_DIR=$(find /home -type d -name "yitam" 2>/dev/null | head -n1)
else
    PROJECT_DIR="/Users/hadv/yitam"  # Fallback for local testing
fi

SSL_DIR="${PROJECT_DIR}/ssl"
LOG_FILE="${PROJECT_DIR}/ssl-renewal.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
set -e
trap 'log "ERROR: Script failed at line $LINENO"' ERR

log "=== Starting SSL certificate renewal process ==="

# Find the correct certificate path
# First try the base name, then fall back to finding any yitam.org* directory
if [ -d "/etc/letsencrypt/live/yitam.org" ]; then
    CERT_PATH="/etc/letsencrypt/live/yitam.org"
else
    # Find the latest yitam.org* directory (handles -0001, -0002, etc.)
    CERT_PATH=$(find /etc/letsencrypt/live -name "yitam.org*" -type d 2>/dev/null | sort -V | tail -n 1)

    if [ -n "$CERT_PATH" ]; then
        log "WARNING: Using non-standard certificate path: ${CERT_PATH}"
        log "WARNING: Consider running cleanup-ssl-duplicates.sh to fix this"
    fi
fi

log "Using certificate path: ${CERT_PATH}"

# Check if certificates exist
if [ -z "$CERT_PATH" ] || [ ! -f "${CERT_PATH}/fullchain.pem" ] || [ ! -f "${CERT_PATH}/privkey.pem" ]; then
    log "ERROR: Certificate files not found in ${CERT_PATH}"
    exit 1
fi

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Backup old certificates
if [ -f "${SSL_DIR}/yitam.org.crt" ]; then
    log "Backing up old certificates..."
    cp "${SSL_DIR}/yitam.org.crt" "${SSL_DIR}/yitam.org.crt.bak"
    cp "${SSL_DIR}/yitam.org.key" "${SSL_DIR}/yitam.org.key.bak"
fi

# Copy renewed certificates
log "Copying renewed certificates to ${SSL_DIR}..."
cp "${CERT_PATH}/fullchain.pem" "${SSL_DIR}/yitam.org.crt"
cp "${CERT_PATH}/privkey.pem" "${SSL_DIR}/yitam.org.key"

# Set proper permissions
log "Setting proper permissions..."
chmod 644 "${SSL_DIR}/yitam.org.crt"
chmod 640 "${SSL_DIR}/yitam.org.key"

# Verify certificate validity
log "Verifying certificate..."
EXPIRY_DATE=$(openssl x509 -in "${SSL_DIR}/yitam.org.crt" -noout -enddate | cut -d= -f2)
log "New certificate expires on: $EXPIRY_DATE"

# Restart nginx container
log "Restarting nginx container..."
cd "$PROJECT_DIR"

if docker-compose ps | grep -q "client.*Up"; then
    docker-compose restart client
    if [ $? -eq 0 ]; then
        log "✅ Nginx container restarted successfully"
    else
        log "ERROR: Failed to restart nginx container"
        # Restore backup if restart failed
        if [ -f "${SSL_DIR}/yitam.org.crt.bak" ]; then
            log "Restoring backup certificates..."
            cp "${SSL_DIR}/yitam.org.crt.bak" "${SSL_DIR}/yitam.org.crt"
            cp "${SSL_DIR}/yitam.org.key.bak" "${SSL_DIR}/yitam.org.key"
            docker-compose restart client
        fi
        exit 1
    fi
else
    log "WARNING: Client container is not running. Starting it..."
    docker-compose up -d client
fi

# Clean up old backups (keep last 5)
log "Cleaning up old backup certificates..."
cd "$SSL_DIR"
ls -t yitam.org.crt.bak.* 2>/dev/null | tail -n +6 | xargs -r rm

# Send notification (optional - can be extended)
log "Sending notification..."
# Uncomment and configure if you want email notifications
# echo "SSL certificate renewed successfully for yitam.org. Expires: $EXPIRY_DATE" | mail -s "SSL Certificate Renewed" admin@yitam.org

log "=== SSL certificate renewal completed successfully ==="
log ""

exit 0

