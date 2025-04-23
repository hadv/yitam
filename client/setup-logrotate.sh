#!/bin/bash

# Create log directory if it doesn't exist
sudo mkdir -p /var/log/nginx

# Set proper permissions
sudo chown -R www-data:adm /var/log/nginx
sudo chmod -R 750 /var/log/nginx

# Install logrotate if not already installed
if ! command -v logrotate &> /dev/null; then
    echo "Installing logrotate..."
    sudo apt-get update
    sudo apt-get install -y logrotate
fi

# Copy the logrotate configuration
echo "Setting up Nginx log rotation..."
sudo cp nginx-logrotate.conf /etc/logrotate.d/nginx

# Test the configuration
echo "Testing logrotate configuration..."
sudo logrotate -d /etc/logrotate.d/nginx

# Create a cron job to run logrotate daily
echo "Setting up daily log rotation..."
sudo bash -c 'cat > /etc/cron.daily/logrotate << EOL
#!/bin/sh
/usr/sbin/logrotate /etc/logrotate.conf
EXITVALUE=$?
if [ $EXITVALUE != 0 ]; then
    /usr/bin/logger -t logrotate "ALERT exited abnormally with [$EXITVALUE]"
fi
exit 0
EOL'

sudo chmod +x /etc/cron.daily/logrotate

echo "Log rotation setup complete!"
echo "Logs will be rotated daily and kept for 14 days"
echo "Compressed logs will be stored in the same directory" 