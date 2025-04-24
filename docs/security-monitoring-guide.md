# Docker Security Monitoring System Guide

This guide explains the security monitoring system implemented for our containerized Nginx server. The system automatically detects and blocks potentially malicious IPs based on various security criteria.

## Overview

The security monitoring system consists of two main components:
1. A monitoring script (`docker-security-monitor.sh`)
2. A systemd service file (`docker-security-monitor.service`)

The system monitors Docker container logs in real-time and automatically blocks suspicious IP addresses by maintaining a blacklist.

## Features

- Real-time monitoring of Nginx container logs
- Automatic detection of:
  - High-frequency requests (potential DDoS)
  - Suspicious HTTP status codes (4xx/5xx errors)
  - Common attack patterns (SQL injection, file inclusion, etc.)
- Automatic IP blocking
- Safe configuration reloading
- Backup and rollback capabilities
- Systemd service integration

## Installation

### Prerequisites

- Docker
- Nginx running in a container
- System with systemd (for service installation)
- User with Docker permissions

### Setup Steps

1. **Configure Nginx**

   Ensure your Nginx configuration includes the blacklist:
   ```nginx
   # In your nginx.conf or site configuration
   include /etc/nginx/conf.d/blacklist.conf;
   ```

2. **Install the Monitoring Script**

   ```bash
   # Copy the script to system bin
   sudo cp docker-security-monitor.sh /usr/local/bin/
   sudo chmod +x /usr/local/bin/docker-security-monitor.sh
   ```

3. **Configure the Script**

   Edit the script configuration if needed:
   ```bash
   # In docker-security-monitor.sh
   NGINX_CONTAINER_NAME="nginx"  # Change to your container name
   MAX_REQUESTS=100             # Max requests per minute
   ERROR_THRESHOLD=10           # 4xx/5xx errors threshold
   SCAN_INTERVAL=60            # Check interval in seconds
   ```

4. **Install the Service**

   ```bash
   # Copy service file
   sudo cp docker-security-monitor.service /etc/systemd/system/
   
   # Update username in service file
   sudo sed -i 's/YOUR_USERNAME/'$USER'/g' /etc/systemd/system/docker-security-monitor.service
   
   # Reload systemd and enable service
   sudo systemctl daemon-reload
   sudo systemctl enable docker-security-monitor
   sudo systemctl start docker-security-monitor
   ```

## Usage

### Running Manually

You can run the monitoring system manually:
```bash
/usr/local/bin/docker-security-monitor.sh
```

### Service Management

```bash
# Start the service
sudo systemctl start docker-security-monitor

# Check status
sudo systemctl status docker-security-monitor

# View logs
sudo journalctl -u docker-security-monitor -f

# Stop the service
sudo systemctl stop docker-security-monitor
```

### Monitoring and Maintenance

1. **View Blocked IPs**
   ```bash
   cat blacklist.conf
   ```

2. **Check Container Logs**
   ```bash
   docker logs nginx
   ```

3. **Manual Blacklist Management**
   - Blacklist file location: `./blacklist.conf`
   - Backup location: `./blacklist.conf.bak`

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| MAX_REQUESTS | 100 | Maximum requests per minute before blocking |
| ERROR_THRESHOLD | 10 | Number of 4xx/5xx errors before blocking |
| SCAN_INTERVAL | 60 | How often to check for suspicious activity (seconds) |
| DOCKER_LOG_OPTS | --since 1m | How far back to check logs |

## Security Considerations

1. **False Positives**: Adjust thresholds if legitimate traffic is being blocked
2. **Resource Usage**: Monitor system resources as log processing can be intensive
3. **Persistence**: Blacklist is maintained in a mounted volume for persistence
4. **Backup**: Original configuration is backed up before modifications

## Troubleshooting

1. **Script won't start**
   - Check Docker permissions
   - Verify container name
   - Ensure Nginx is running

2. **IPs not being blocked**
   - Check log format matches script expectations
   - Verify blacklist.conf is being included
   - Check Nginx configuration syntax

3. **Service issues**
   - Check systemd logs
   - Verify user permissions
   - Check Docker socket access

## Contributing

Feel free to submit issues and enhancement requests. We welcome contributions to improve the security monitoring system.

## License

This security monitoring system is part of the main project and follows the same licensing terms.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review system logs
3. Submit an issue in the project repository
4. Contact the development team 