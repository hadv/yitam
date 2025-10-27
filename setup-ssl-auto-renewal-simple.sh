#!/bin/bash

# Setup SSL Auto-Renewal for yitam.org (Simple Version)
# This script configures automatic SSL certificate renewal with Let's Encrypt
# It stops/starts the nginx container during renewal to free port 80

# Exit on error
set -e

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Auto-detect project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/package.json" ] && grep -q "yitam" "$SCRIPT_DIR/package.json" 2>/dev/null; then
    PROJECT_DIR="$SCRIPT_DIR"
elif [ -d "/root/yitam" ]; then
    PROJECT_DIR="/root/yitam"
else
    PROJECT_DIR=$(find /home /Users -maxdepth 2 -type d -name "yitam" 2>/dev/null | head -n1)
    
    if [ -z "$PROJECT_DIR" ]; then
        echo "ERROR: Cannot find yitam project directory"
        exit 1
    fi
fi

RENEWAL_SCRIPT="${PROJECT_DIR}/renew-ssl-certs.sh"
CHECK_SCRIPT="${PROJECT_DIR}/check-ssl-expiry.sh"

echo "🔧 Setting up SSL auto-renewal for yitam.org..."
echo "Project directory: $PROJECT_DIR"

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

# Create certbot renewal service with pre/post hooks to stop/start nginx
echo "⚙️  Configuring certbot auto-renewal..."

cat > /etc/systemd/system/certbot-renewal.service << EOF
[Unit]
Description=Certbot Renewal
After=network.target

[Service]
Type=oneshot
WorkingDirectory=${PROJECT_DIR}
# Stop nginx container, renew certificate, start nginx container
ExecStart=/bin/bash -c 'cd ${PROJECT_DIR} && docker-compose stop client && certbot renew --quiet --deploy-hook /usr/local/bin/renew-ssl-certs.sh; EXIT_CODE=\$?; docker-compose start client; exit \$EXIT_CODE'
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

# Setup daily certificate check (for monitoring)
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

# Display status
echo ""
echo "✅ SSL auto-renewal setup completed successfully!"
echo ""
echo "📋 Summary:"
echo "  - Certbot will check for renewal twice daily (00:00 and 12:00)"
echo "  - During renewal, nginx container will be stopped temporarily"
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
echo "🧪 To test renewal manually (will stop/start nginx):"
echo "  sudo systemctl start certbot-renewal.service"
echo ""

