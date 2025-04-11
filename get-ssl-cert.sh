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

# Install certbot
apt-get install -y certbot

# Stop nginx container temporarily
docker-compose stop client

# Get SSL certificate
certbot certonly --standalone \
    -d yitam.org \
    -d www.yitam.org \
    --agree-tos \
    --non-interactive \
    --preferred-challenges http \
    --email admin@yitam.org \
    --rsa-key-size 4096

# Create SSL directory if it doesn't exist
mkdir -p ./ssl

# Copy certificates to the SSL directory
cp /etc/letsencrypt/live/yitam.org/fullchain.pem ./ssl/yitam.org.crt
cp /etc/letsencrypt/live/yitam.org/privkey.pem ./ssl/yitam.org.key

# Set proper permissions
chmod 644 ./ssl/yitam.org.crt
chmod 640 ./ssl/yitam.org.key

# Start nginx container
docker-compose start client

# Create renewal script
cat > /usr/local/bin/renew-ssl-certs.sh << 'EOF'
#!/bin/bash
# Copy renewed certificates
cp /etc/letsencrypt/live/yitam.org/fullchain.pem /yitam/ssl/yitam.org.crt
cp /etc/letsencrypt/live/yitam.org/privkey.pem /yitam/ssl/yitam.org.key
# Set proper permissions
chmod 644 /yitam/ssl/yitam.org.crt
chmod 640 /yitam/ssl/yitam.org.key
# Restart nginx container
cd /yitam && docker-compose restart client
EOF

# Make renewal script executable
chmod +x /usr/local/bin/renew-ssl-certs.sh

# Setup auto renewal
echo "0 0 1 * * root certbot renew --quiet --deploy-hook '/usr/local/bin/renew-ssl-certs.sh'" > /etc/cron.d/certbot-renew

echo "SSL certificate has been obtained and configured successfully!"
echo "Certificate will auto-renew monthly" 