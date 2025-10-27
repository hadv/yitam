#!/bin/bash

# SSL Certificate Expiry Check Script
# This script checks the SSL certificate expiry and sends alerts if needed

# Configuration
# Auto-detect project directory (works when script is in /usr/local/bin or project root)
if [ -f "/root/yitam/ssl/yitam.org.crt" ]; then
    PROJECT_DIR="/root/yitam"
elif [ -f "/home/*/yitam/ssl/yitam.org.crt" ]; then
    PROJECT_DIR=$(dirname $(find /home -name "yitam.org.crt" -path "*/yitam/ssl/*" 2>/dev/null | head -n1))
    PROJECT_DIR=$(dirname "$PROJECT_DIR")
else
    PROJECT_DIR="/Users/hadv/yitam"  # Fallback for local testing
fi

SSL_DIR="${PROJECT_DIR}/ssl"
LOG_FILE="${PROJECT_DIR}/ssl-check.log"
CERT_FILE="${SSL_DIR}/yitam.org.crt"
WARNING_DAYS=30  # Alert if certificate expires in less than 30 days
CRITICAL_DAYS=7  # Critical alert if expires in less than 7 days

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if certificate file exists
if [ ! -f "$CERT_FILE" ]; then
    log "ERROR: Certificate file not found: $CERT_FILE"
    exit 1
fi

# Get certificate expiry date
EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$EXPIRY_DATE" +%s 2>/dev/null || date -d "$EXPIRY_DATE" +%s 2>/dev/null)
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

log "Certificate expires on: $EXPIRY_DATE"
log "Days until expiry: $DAYS_UNTIL_EXPIRY"

# Check expiry status
if [ $DAYS_UNTIL_EXPIRY -lt 0 ]; then
    log "🚨 CRITICAL: Certificate has EXPIRED!"
    echo "EXPIRED"
    exit 2
elif [ $DAYS_UNTIL_EXPIRY -lt $CRITICAL_DAYS ]; then
    log "🚨 CRITICAL: Certificate expires in $DAYS_UNTIL_EXPIRY days!"
    echo "CRITICAL"
    exit 1
elif [ $DAYS_UNTIL_EXPIRY -lt $WARNING_DAYS ]; then
    log "⚠️  WARNING: Certificate expires in $DAYS_UNTIL_EXPIRY days"
    echo "WARNING"
    exit 0
else
    log "✅ Certificate is valid for $DAYS_UNTIL_EXPIRY more days"
    echo "OK"
    exit 0
fi

