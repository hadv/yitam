# Security Guide: IP Blacklisting and Rate Limiting

## Overview
This document outlines the security measures implemented in our Nginx configuration to protect against malicious traffic and DDoS attacks.

## IP Blacklisting

### Configuration Files
- Main configuration: `client/nginx.conf`
- Blacklist file: `client/conf.d/blacklist.conf`

### How to Add IPs to Blacklist
1. Edit `client/conf.d/blacklist.conf`
2. Add IP addresses to block using the format:
   ```nginx
   deny IP_ADDRESS;
   ```
3. For IP ranges, use CIDR notation:
   ```nginx
   deny 192.168.0.0/16;
   ```

### Example Blacklist Entries
```nginx
# Block individual IPs
deny 1.2.3.4;
deny 5.6.7.8;

# Block IP ranges
deny 192.168.0.0/16;
deny 10.0.0.0/8;
```

### How to Identify Malicious IPs
1. Check Nginx access logs:
   ```bash
   # Find most frequent IPs
   awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -n 20

   # Find failed login attempts
   grep "POST /api/auth/login" /var/log/nginx/ssl_access.log | grep " 401 " | awk '{print $1}' | sort | uniq -c | sort -nr
   ```

2. Monitor rate-limited requests:
   ```bash
   grep "Rate-Limited: PASS" /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -nr
   ```

## Rate Limiting

### Configuration
Rate limits are defined in `client/nginx.conf`:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;    # General site
limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;     # API endpoints
limit_req_zone $binary_remote_addr zone=login:10m rate=2r/s;   # Login attempts
```

### Current Limits
1. General site access: 10 requests per second
2. API endpoints: 5 requests per second
3. Login attempts: 2 requests per second

### Burst Settings
- General site: 20 requests burst
- API endpoints: 10 requests burst
- Login attempts: 5 requests burst

## Log Management

### Log Files
- Access logs: `/var/log/nginx/access.log`
- SSL access logs: `/var/log/nginx/ssl_access.log`
- Error logs: `/var/log/nginx/error.log`

### Log Rotation
- Logs are rotated daily
- Kept for 14 days
- Compressed after rotation
- Managed by logrotate

## Best Practices

### Adding IPs to Blacklist
1. Verify the IP is actually malicious
2. Check if it's part of a legitimate service
3. Consider using IP ranges for known bad networks
4. Document the reason for blocking

### Monitoring
1. Regularly check access logs for suspicious patterns
2. Monitor rate-limited requests
3. Review failed login attempts
4. Check for unusual user agents

### Maintenance
1. Review blacklist quarterly
2. Update rate limits based on traffic patterns
3. Monitor server performance
4. Keep logs for required retention period

## Troubleshooting

### Common Issues
1. **Legitimate traffic blocked**
   - Check if IP is incorrectly blacklisted
   - Verify rate limits are appropriate

2. **High number of rate-limited requests**
   - Consider adjusting rate limits
   - Check for potential DDoS attacks

3. **Log files growing too large**
   - Verify log rotation is working
   - Check disk space

### Commands for Investigation
```bash
# Check blacklist effectiveness
grep "denied" /var/log/nginx/error.log

# Monitor rate limiting
grep "Rate-Limited" /var/log/nginx/access.log

# Check disk usage
df -h /var/log/nginx
```

## Security Considerations

1. **IP Spoofing**
   - Consider using `$http_x_real_ip` or `$http_x_forwarded_for` if behind a proxy
   - Verify client IP headers

2. **DDoS Protection**
   - Rate limiting helps prevent DDoS
   - Consider additional DDoS protection services

3. **Monitoring**
   - Set up alerts for unusual traffic patterns
   - Monitor server resources

## Updates and Maintenance

### Adding New Security Measures
1. Test in staging environment
2. Document changes
3. Update this guide
4. Monitor effectiveness

### Regular Maintenance
1. Review security logs weekly
2. Update blacklist monthly
3. Review rate limits quarterly
4. Test security measures annually 