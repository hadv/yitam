#!/bin/bash

# Configuration
NGINX_CONTAINER_NAME="client"  # Our nginx container name from docker-compose
DOCKER_LOG_OPTS="--since 1m"  # Only check logs from the last minute
BLACKLIST_FILE="./blacklist.conf"  # Store blacklist in the mounted volume
TEMP_IP_LIST="/tmp/malicious_ips.txt"
MAX_REQUESTS=100  # Maximum requests per minute
ERROR_THRESHOLD=10  # Number of 4xx/5xx errors before considering IP suspicious
SCAN_INTERVAL=60  # Check every 60 seconds

# Ensure the blacklist directory exists
mkdir -p "$(dirname "$BLACKLIST_FILE")"

# Create backup of original blacklist
backup_blacklist() {
    if [ -f "$BLACKLIST_FILE" ]; then
        cp "$BLACKLIST_FILE" "${BLACKLIST_FILE}.bak"
    fi
}

# Initialize blacklist file
initialize_blacklist() {
    echo "# Blacklist configuration - Auto-generated" > "$BLACKLIST_FILE"
    echo "# Last updated: $(date)" >> "$BLACKLIST_FILE"
    echo "" >> "$BLACKLIST_FILE"
}

# Check if IP is already blacklisted
is_ip_blacklisted() {
    local ip=$1
    grep -q "deny $ip;" "$BLACKLIST_FILE"
    return $?
}

# Add IP to blacklist
add_to_blacklist() {
    local ip=$1
    local reason=$2
    
    if ! is_ip_blacklisted "$ip"; then
        echo "deny $ip; # Blocked on $(date) - Reason: $reason" >> "$BLACKLIST_FILE"
        logger -t docker_security_monitor "Blocked IP $ip - Reason: $reason"
        echo "Blocked IP: $ip - Reason: $reason"
    fi
}

# Get Nginx container logs
get_nginx_logs() {
    docker logs $DOCKER_LOG_OPTS "$NGINX_CONTAINER_NAME" 2>/dev/null
}

# Monitor for suspicious activity
monitor_suspicious_activity() {
    # Get recent logs from the container
    get_nginx_logs > "$TEMP_IP_LIST.raw"

    # Check for high frequency requests
    echo "Checking for high frequency requests..."
    awk '{print $1}' "$TEMP_IP_LIST.raw" | \
        sort | uniq -c | sort -nr | \
        awk -v threshold=$MAX_REQUESTS '$1 > threshold {print $2}' > "$TEMP_IP_LIST"

    # Check for suspicious HTTP status codes (4xx, 5xx)
    echo "Checking for suspicious HTTP status codes..."
    awk '$9 ~ /^[45]/ {print $1}' "$TEMP_IP_LIST.raw" | \
        sort | uniq -c | sort -nr | \
        awk -v threshold=$ERROR_THRESHOLD '$1 > threshold {print $2}' >> "$TEMP_IP_LIST"

    # Check for common attack patterns
    echo "Checking for common attack patterns..."
    grep -i "union select\|/etc/passwd\|eval(\|system(\|' OR '1'='1" "$TEMP_IP_LIST.raw" | \
        awk '{print $1}' | sort | uniq >> "$TEMP_IP_LIST"

    # Process identified IPs
    if [ -f "$TEMP_IP_LIST" ]; then
        sort "$TEMP_IP_LIST" | uniq | while read -r ip; do
            if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                add_to_blacklist "$ip" "Suspicious activity detected"
            fi
        done
        rm "$TEMP_IP_LIST" "$TEMP_IP_LIST.raw"
    fi
}

# Reload nginx configuration in Docker container
reload_nginx() {
    # Copy the blacklist to the container
    docker cp "$BLACKLIST_FILE" "${NGINX_CONTAINER_NAME}:/etc/nginx/conf.d/blacklist.conf"
    
    # Test and reload nginx configuration
    if docker exec "$NGINX_CONTAINER_NAME" nginx -t &>/dev/null; then
        docker exec "$NGINX_CONTAINER_NAME" nginx -s reload
        echo "Nginx configuration reloaded successfully in container"
    else
        echo "Error in nginx configuration. Rolling back..."
        if [ -f "${BLACKLIST_FILE}.bak" ]; then
            cp "${BLACKLIST_FILE}.bak" "$BLACKLIST_FILE"
            docker cp "$BLACKLIST_FILE" "${NGINX_CONTAINER_NAME}:/etc/nginx/conf.d/blacklist.conf"
            docker exec "$NGINX_CONTAINER_NAME" nginx -s reload
        fi
    fi
}

# Check if nginx container exists and is running
check_nginx_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER_NAME}$"; then
        echo "Error: Nginx container '${NGINX_CONTAINER_NAME}' not found or not running"
        exit 1
    fi
}

# Main monitoring loop
main() {
    echo "Starting Docker security monitoring..."
    check_nginx_container
    backup_blacklist
    initialize_blacklist

    while true; do
        check_nginx_container
        monitor_suspicious_activity
        reload_nginx
        sleep "$SCAN_INTERVAL"
    done
}

# Handle script termination
trap 'echo "Stopping security monitor..."; exit 0' SIGTERM SIGINT

# Start the monitor
main 