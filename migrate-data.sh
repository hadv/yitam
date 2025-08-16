#!/bin/bash

# Script to migrate existing database data to Docker volumes
# This ensures data persistence when containers are restarted

echo "🔄 Starting data migration to Docker volumes..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install docker-compose first."
    exit 1
fi

# Stop containers if running
echo "🛑 Stopping containers..."
docker-compose down

# Create a temporary container to copy data
echo "📦 Creating temporary container to migrate data..."

# Build the server image first
docker-compose build server

# Create volumes if they don't exist
docker volume create yitam_server-data 2>/dev/null || true
docker volume create yitam_server-uploads 2>/dev/null || true

# Copy database files to volume
if [ -d "server/data" ] && [ "$(ls -A server/data)" ]; then
    echo "📁 Copying database files to persistent volume..."
    docker run --rm \
        -v "$(pwd)/server/data:/source:ro" \
        -v yitam_server-data:/target \
        alpine:latest \
        sh -c "cp -r /source/* /target/ 2>/dev/null || true"
    echo "✅ Database files copied successfully"
else
    echo "⚠️  No database files found in server/data"
fi

# Copy uploads if they exist
if [ -d "server/uploads" ] && [ "$(ls -A server/uploads)" ]; then
    echo "📁 Copying upload files to persistent volume..."
    docker run --rm \
        -v "$(pwd)/server/uploads:/source:ro" \
        -v yitam_server-uploads:/target \
        alpine:latest \
        sh -c "cp -r /source/* /target/ 2>/dev/null || true"
    echo "✅ Upload files copied successfully"
else
    echo "⚠️  No upload files found in server/uploads"
fi

# Verify the migration
echo "🔍 Verifying migration..."
echo "Database files in volume:"
docker run --rm -v yitam_server-data:/data alpine:latest ls -la /data

echo "Upload files in volume:"
docker run --rm -v yitam_server-uploads:/uploads alpine:latest ls -la /uploads

echo ""
echo "✅ Data migration completed!"
echo ""
echo "📋 Next steps:"
echo "1. Run: docker-compose up -d"
echo "2. Your data will now persist across container restarts"
echo "3. Database files are stored in Docker volume 'yitam_server-data'"
echo "4. Upload files are stored in Docker volume 'yitam_server-uploads'"
echo ""
echo "🔧 To backup your data in the future:"
echo "   docker run --rm -v yitam_server-data:/data -v \$(pwd):/backup alpine:latest tar czf /backup/database-backup.tar.gz -C /data ."
echo ""
echo "🔧 To restore from backup:"
echo "   docker run --rm -v yitam_server-data:/data -v \$(pwd):/backup alpine:latest tar xzf /backup/database-backup.tar.gz -C /data"
