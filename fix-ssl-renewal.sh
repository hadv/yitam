#!/bin/bash

# Fix SSL Renewal for yitam.org
# This script updates the certbot renewal configuration to work with Docker nginx

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

echo "🔧 Fixing SSL renewal configuration for yitam.org..."
echo "Project directory: $PROJECT_DIR"

# Update the certbot renewal service to stop/start nginx container
echo "⚙️  Updating certbot renewal service..."

cat > /etc/systemd/system/certbot-renewal.service << EOF
[Unit]
Description=Certbot Renewal
After=network.target

[Service]
Type=oneshot
WorkingDirectory=${PROJECT_DIR}
ExecStart=/bin/bash -c 'cd ${PROJECT_DIR} && docker-compose stop client && certbot renew --quiet --deploy-hook /usr/local/bin/renew-ssl-certs.sh && docker-compose start client'
EOF

# Reload systemd
systemctl daemon-reload

echo ""
echo "✅ SSL renewal configuration updated successfully!"
echo ""
echo "📋 How it works:"
echo "  1. Stops the nginx container (frees port 80)"
echo "  2. Runs certbot renewal (uses standalone mode on port 80)"
echo "  3. Starts the nginx container"
echo "  4. Copies renewed certificates and restarts nginx (via deploy hook)"
echo ""
echo "🧪 Test the renewal now:"
echo "  sudo certbot renew --dry-run --pre-hook 'cd ${PROJECT_DIR} && docker-compose stop client' --post-hook 'cd ${PROJECT_DIR} && docker-compose start client'"
echo ""
echo "🔍 Check timer status:"
echo "  sudo systemctl status certbot-renewal.timer"
echo ""

