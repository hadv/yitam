#!/bin/bash

# Cleanup SSL Certificate Duplicates
# This script consolidates duplicate certbot certificates and ensures clean renewals

# Exit on error
set -e

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

echo "🔍 Checking for duplicate SSL certificates..."

# List all yitam.org certificates
certbot certificates | grep -A 10 "yitam.org"

echo ""
echo "📋 Current certificate directories:"
ls -la /etc/letsencrypt/live/ | grep yitam.org || echo "No certificates found"

echo ""
read -p "Do you want to clean up duplicate certificates? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled"
    exit 0
fi

# Find all yitam.org certificate names
CERT_NAMES=$(certbot certificates 2>/dev/null | grep "Certificate Name:" | grep "yitam.org" | awk '{print $3}')

if [ -z "$CERT_NAMES" ]; then
    echo "❌ No certificates found"
    exit 1
fi

# Count certificates
CERT_COUNT=$(echo "$CERT_NAMES" | wc -l)

if [ "$CERT_COUNT" -eq 1 ]; then
    echo "✅ Only one certificate found. No cleanup needed."
    CERT_NAME=$(echo "$CERT_NAMES" | head -n 1)
    
    # If it has a suffix, rename it to the base name
    if [[ "$CERT_NAME" == *"-"* ]]; then
        echo "📝 Renaming $CERT_NAME to yitam.org..."
        
        # Check if base name exists
        if certbot certificates 2>/dev/null | grep -q "Certificate Name: yitam.org$"; then
            echo "⚠️  Base certificate 'yitam.org' already exists. Deleting it first..."
            certbot delete --cert-name yitam.org --non-interactive
        fi
        
        # Rename the certificate
        certbot rename --cert-name "$CERT_NAME" --new-name yitam.org --non-interactive
        echo "✅ Certificate renamed to yitam.org"
    fi
else
    echo "🗑️  Found $CERT_COUNT certificates. Keeping the newest, deleting others..."
    
    # Get the newest certificate (last in the list)
    NEWEST_CERT=$(echo "$CERT_NAMES" | tail -n 1)
    echo "📌 Keeping: $NEWEST_CERT"
    
    # Delete all others
    for CERT in $CERT_NAMES; do
        if [ "$CERT" != "$NEWEST_CERT" ]; then
            echo "🗑️  Deleting: $CERT"
            certbot delete --cert-name "$CERT" --non-interactive
        fi
    done
    
    # Rename the newest to base name if it has a suffix
    if [[ "$NEWEST_CERT" != "yitam.org" ]]; then
        echo "📝 Renaming $NEWEST_CERT to yitam.org..."
        certbot rename --cert-name "$NEWEST_CERT" --new-name yitam.org --non-interactive
    fi
fi

echo ""
echo "✅ Cleanup completed!"
echo ""
echo "📋 Final certificate status:"
certbot certificates | grep -A 10 "yitam.org"

echo ""
echo "🔄 Next steps:"
echo "1. Update your ssl directory with the correct certificate:"
echo "   sudo cp /etc/letsencrypt/live/yitam.org/fullchain.pem /path/to/yitam/ssl/yitam.org.crt"
echo "   sudo cp /etc/letsencrypt/live/yitam.org/privkey.pem /path/to/yitam/ssl/yitam.org.key"
echo ""
echo "2. Restart your nginx container:"
echo "   cd /path/to/yitam && docker compose restart client"

