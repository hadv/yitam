#!/bin/sh

# Create log directory if it doesn't exist already (though we do this in Dockerfile too)
mkdir -p /var/log/nginx

# Set proper permissions - using nginx user instead of www-data (Alpine uses nginx)
chown -R nginx:nginx /var/log/nginx
chmod -R 750 /var/log/nginx

# logrotate should already be installed in the Dockerfile

# Copy the logrotate configuration - should already be done in Dockerfile
echo "Setting up Nginx log rotation..."

# Test the configuration
echo "Testing logrotate configuration..."
logrotate -d /etc/logrotate.d/nginx

# Create a cron job to run logrotate daily
echo "Setting up daily log rotation..."
cat > /etc/periodic/daily/logrotate << EOL
#!/bin/sh
/usr/sbin/logrotate /etc/logrotate.conf
EXITVALUE=\$?
if [ \$EXITVALUE != 0 ]; then
    logger -t logrotate "ALERT exited abnormally with [\$EXITVALUE]"
fi
exit 0
EOL

chmod +x /etc/periodic/daily/logrotate

echo "Log rotation setup complete!"
echo "Logs will be rotated daily and kept for 14 days"
echo "Compressed logs will be stored in the same directory" 