#!/bin/bash

# Setup SSL Auto-Renewal for yitam.org
# This script configures automatic SSL certificate renewal with Let's Encrypt

# Exit on error
set -e

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration
# Auto-detect project directory
# First, try to get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the yitam directory
if [ -f "$SCRIPT_DIR/package.json" ] && grep -q "yitam" "$SCRIPT_DIR/package.json" 2>/dev/null; then
    PROJECT_DIR="$SCRIPT_DIR"
# Try common locations
elif [ -d "/root/yitam" ]; then
    PROJECT_DIR="/root/yitam"
else
    # Search in /home and /Users directories
    PROJECT_DIR=$(find /home /Users -maxdepth 2 -type d -name "yitam" 2>/dev/null | head -n1)

    if [ -z "$PROJECT_DIR" ]; then
        echo "ERROR: Cannot find yitam project directory"
        echo "Please edit this script and set PROJECT_DIR manually"
        echo "Tried: $SCRIPT_DIR, /root/yitam, /home/*/yitam, /Users/*/yitam"
        exit 1
    fi
fi

RENEWAL_SCRIPT="${PROJECT_DIR}/renew-ssl-certs.sh"
CHECK_SCRIPT="${PROJECT_DIR}/check-ssl-expiry.sh"
CLEANUP_SCRIPT="${PROJECT_DIR}/cleanup-ssl-duplicates.sh"

echo "🔧 Setting up SSL auto-renewal for yitam.org..."

# First, check for duplicate certificates
echo ""
echo "🔍 Checking for duplicate certificates..."
CERT_COUNT=$(certbot certificates 2>/dev/null | grep "Certificate Name:" | grep -c "yitam.org" || echo "0")

if [ "$CERT_COUNT" -gt 1 ]; then
    echo "⚠️  WARNING: Found $CERT_COUNT certificates for yitam.org"
    echo "This can cause renewal issues. Running cleanup..."

    if [ -f "$CLEANUP_SCRIPT" ]; then
        bash "$CLEANUP_SCRIPT"
    else
        echo "❌ Cleanup script not found. Please run cleanup-ssl-duplicates.sh manually"
        exit 1
    fi
elif [ "$CERT_COUNT" -eq 1 ]; then
    # Get the actual certificate name (might have a suffix)
    CERT_NAME=$(certbot certificates 2>/dev/null | grep "Certificate Name:" | grep "yitam.org" | awk '{print $3}')
    if [[ "$CERT_NAME" != "yitam.org" ]]; then
        echo "⚠️  Certificate has suffix: $CERT_NAME"
        echo "Note: Certificate will be used as-is. Certbot will handle renewal automatically."
    fi
    echo "✅ Found certificate: $CERT_NAME"
fi

echo ""

# Ensure certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    apt-get update
    apt-get install -y certbot
fi

# Copy renewal script to system location
echo "📝 Installing renewal script..."
cp "$RENEWAL_SCRIPT" /usr/local/bin/renew-ssl-certs.sh
chmod +x /usr/local/bin/renew-ssl-certs.sh

# Copy check script to system location
echo "📝 Installing certificate check script..."
cp "$CHECK_SCRIPT" /usr/local/bin/check-ssl-expiry.sh
chmod +x /usr/local/bin/check-ssl-expiry.sh

# Setup certbot auto-renewal with deploy hook
# Certbot will automatically attempt renewal twice daily
echo "⚙️  Configuring certbot auto-renewal..."

# Create certbot renewal configuration
cat > /etc/letsencrypt/renewal-hooks/deploy/yitam-deploy.sh << 'EOF'
#!/bin/bash
# This hook is called after successful renewal
/usr/local/bin/renew-ssl-certs.sh
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/yitam-deploy.sh

# Create systemd timer for certbot (more reliable than cron)
echo "⏰ Setting up systemd timer for certbot..."

# Create certbot renewal service
cat > /etc/systemd/system/certbot-renewal.service << 'EOF'
[Unit]
Description=Certbot Renewal
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook /usr/local/bin/renew-ssl-certs.sh
EOF

# Create certbot renewal timer (runs twice daily)
cat > /etc/systemd/system/certbot-renewal.timer << 'EOF'
[Unit]
Description=Certbot Renewal Timer
After=network.target

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Enable and start the timer
systemctl daemon-reload
systemctl enable certbot-renewal.timer
systemctl start certbot-renewal.timer

# Also setup a daily certificate check (for monitoring)
echo "📊 Setting up daily certificate expiry check..."

cat > /etc/systemd/system/ssl-expiry-check.service << 'EOF'
[Unit]
Description=SSL Certificate Expiry Check
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/check-ssl-expiry.sh
EOF

cat > /etc/systemd/system/ssl-expiry-check.timer << 'EOF'
[Unit]
Description=SSL Certificate Expiry Check Timer
After=network.target

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable ssl-expiry-check.timer
systemctl start ssl-expiry-check.timer

# Test the renewal process (dry run)
echo "🧪 Testing renewal process (dry run)..."
certbot renew --dry-run

# Display status
echo ""
echo "✅ SSL auto-renewal setup completed successfully!"
echo ""
echo "📋 Summary:"
echo "  - Certbot will check for renewal twice daily (00:00 and 12:00)"
echo "  - Certificate expiry is checked daily"
echo "  - Renewal script: /usr/local/bin/renew-ssl-certs.sh"
echo "  - Check script: /usr/local/bin/check-ssl-expiry.sh"
echo "  - Logs: ${PROJECT_DIR}/ssl-renewal.log"
echo ""
echo "🔍 Check timer status:"
echo "  sudo systemctl status certbot-renewal.timer"
echo "  sudo systemctl status ssl-expiry-check.timer"
echo ""
echo "📝 View logs:"
echo "  tail -f ${PROJECT_DIR}/ssl-renewal.log"
echo "  tail -f ${PROJECT_DIR}/ssl-check.log"
echo ""
echo "🧪 Test renewal manually:"
echo "  sudo certbot renew --dry-run"
echo "  sudo certbot renew --force-renewal"
echo ""

