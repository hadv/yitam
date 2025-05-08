# Deployment Guide

This guide provides instructions for deploying the application in a production environment using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed on your server
- Git access to the repository
- A valid SSL certificate for HTTPS
- Node.js LTS version (for local development only)

## Deployment Steps

### 1. Clone the Repository

```bash
# Clone the repository
git clone https://github.com/hadv/yitam.git
cd yitam

# Checkout the desired branch
git checkout feature/domain-specific-search  # or main, or any specific release branch
```

### 2. Environment Configuration

Create or modify the environment files:

```bash
# Copy the sample environment file (if needed)
cp prod.env.sample prod.env

# Edit the production environment variables
nano prod.env
```

Important environment variables to configure:

```
# API keys
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODERATION_API_KEY=your_moderation_api_key

# SSL configuration
SSL_CERT_PATH=/path/to/ssl/certificate
SSL_KEY_PATH=/path/to/ssl/key

# Domain configuration
APP_DOMAIN=your-domain.com

# Database configuration (if applicable)
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
```

### 3. SSL Certificate Setup

If you don't have an SSL certificate yet, you can generate one using Let's Encrypt:

```bash
# Use the included script to get a certificate from Let's Encrypt
chmod +x get-ssl-cert.sh
./get-ssl-cert.sh your-domain.com
```

Make sure to update the SSL certificate paths in your environment file.

### 4. Build and Deploy

Use Docker Compose to build and deploy the application:

```bash
# Pull the latest changes
git pull

# Build and start the containers in detached mode
docker-compose -f docker-compose.yml --env-file prod.env up -d --build
```

### 5. Verify Deployment

Check that all containers are running:

```bash
docker-compose ps
```

Test the application by accessing it in a browser at https://your-domain.com

### 6. Log Monitoring

You can monitor the logs of the running containers:

```bash
# View logs from all containers
docker-compose logs -f

# View logs from a specific service
docker-compose logs -f server
docker-compose logs -f client
```

### 7. Updating the Application

To update the application with new changes:

```bash
# Pull the latest changes
git pull

# Checkout the desired branch if needed
git checkout feature/domain-specific-search

# Rebuild and restart containers with new changes
docker-compose -f docker-compose.yml --env-file prod.env up -d --build
```

### 8. Troubleshooting

If you encounter issues:

1. Check container logs: `docker-compose logs -f`
2. Verify environment variables are correctly set
3. Check container status: `docker-compose ps`
4. Inspect network connectivity: `docker network inspect yitam_default`
5. Verify SSL certificate validity and paths

### 9. Security Considerations

1. Never commit sensitive environment variables to git
2. Regularly update Docker images for security patches
3. Consider using Docker security monitoring tools
4. Implement proper firewall rules on your server
5. Set up regular backups of your data

### 10. Common Commands

```bash
# Start services
docker-compose -f docker-compose.yml --env-file prod.env up -d

# Stop services
docker-compose down

# Restart specific service
docker-compose restart server

# View logs
docker-compose logs -f

# Check container status
docker-compose ps

# Remove all containers and volumes (caution!)
docker-compose down -v
```

## Domain-specific Search Configuration

The application now includes improved domain-specific search for traditional Eastern medicine and philosophy knowledge domains. These domains are configured in `server/src/constants/Domains.ts` and include:

- Traditional Eastern medicine domains like 'nội kinh', 'đông y', 'y học cổ truyền'
- Philosophy domains like 'lão tử', 'dịch lý'
- Spiritual practice domains like 'đạo phật', 'thích nhất hạnh'

The application automatically detects which domain(s) a user's query relates to and restricts database searches to those specific domains, improving the relevance of search results.

## Production Best Practices

1. **Environment Variables**: Keep sensitive information in environment variables, not in code.
2. **Logging**: Set up proper log rotation to prevent disk space issues.
3. **Monitoring**: Implement health checks and monitoring for your containers.
4. **Backups**: Regularly back up your database and important configuration.
5. **Auto-restart**: Configure containers to restart automatically on failure.
6. **Resource Limits**: Set appropriate CPU and memory limits for containers.
7. **Updates**: Regularly update base Docker images for security fixes. 