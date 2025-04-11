#!/bin/bash

# Exit on error
set -e

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Update package list
apt-get update

# Install certbot and nginx plugin
apt-get install -y certbot python3-certbot-nginx

# Stop nginx temporarily
systemctl stop nginx

# Get SSL certificate
certbot certonly --standalone \
    -d yitam.org \
    -d www.yitam.org \
    --agree-tos \
    --non-interactive \
    --preferred-challenges http \
    --email admin@yitam.org \
    --rsa-key-size 4096

# Update nginx configuration paths
CERT_PATH="/etc/letsencrypt/live/yitam.org/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/yitam.org/privkey.pem"

# Create symbolic links for nginx
ln -sf $CERT_PATH /etc/nginx/ssl/yitam.org.crt
ln -sf $KEY_PATH /etc/nginx/ssl/yitam.org.key

# Ensure SSL directory exists
mkdir -p /etc/nginx/ssl

# Set proper permissions
chmod 755 /etc/nginx/ssl
chmod 644 /etc/nginx/ssl/yitam.org.crt
chmod 640 /etc/nginx/ssl/yitam.org.key

# Start nginx
systemctl start nginx

# Setup auto renewal
echo "0 0 1 * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew

echo "SSL certificate has been obtained and configured successfully!"
echo "Certificate will auto-renew monthly" 