#!/bin/bash

# Database backup and restore utility for YITAM
# Usage: ./backup-restore.sh [backup|restore|list] [backup-name]

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

show_help() {
    echo "🗄️  YITAM Database Backup & Restore Utility"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  backup [name]     Create a backup (optional custom name)"
    echo "  restore <name>    Restore from a specific backup"
    echo "  list             List all available backups"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 backup                    # Create backup with timestamp"
    echo "  $0 backup before-update      # Create backup with custom name"
    echo "  $0 restore 20241216_143022   # Restore specific backup"
    echo "  $0 list                      # List all backups"
}

backup_data() {
    local backup_name="${1:-$TIMESTAMP}"
    local backup_file="$BACKUP_DIR/yitam-backup-$backup_name.tar.gz"
    
    echo "📦 Creating backup: $backup_name"
    
    # Check if containers are running
    if docker-compose ps | grep -q "Up"; then
        echo "⚠️  Containers are running. For consistent backup, consider stopping them first."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Backup cancelled"
            exit 1
        fi
    fi
    
    # Create backup from Docker volumes
    echo "🗄️  Backing up database..."
    docker run --rm \
        -v yitam_server-data:/data:ro \
        -v "$(pwd)/$BACKUP_DIR:/backup" \
        alpine:latest \
        tar czf "/backup/yitam-backup-$backup_name.tar.gz" -C /data .
    
    if [ $? -eq 0 ]; then
        echo "✅ Backup created successfully: $backup_file"
        echo "📊 Backup size: $(du -h "$backup_file" | cut -f1)"
    else
        echo "❌ Backup failed!"
        exit 1
    fi
}

restore_data() {
    local backup_name="$1"
    
    if [ -z "$backup_name" ]; then
        echo "❌ Please specify a backup name to restore"
        echo "💡 Use '$0 list' to see available backups"
        exit 1
    fi
    
    local backup_file="$BACKUP_DIR/yitam-backup-$backup_name.tar.gz"
    
    if [ ! -f "$backup_file" ]; then
        echo "❌ Backup file not found: $backup_file"
        echo "💡 Use '$0 list' to see available backups"
        exit 1
    fi
    
    echo "⚠️  WARNING: This will replace all current database data!"
    echo "📁 Restoring from: $backup_file"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Restore cancelled"
        exit 1
    fi
    
    # Stop containers
    echo "🛑 Stopping containers..."
    docker-compose down
    
    # Restore data
    echo "🔄 Restoring database..."
    docker run --rm \
        -v yitam_server-data:/data \
        -v "$(pwd)/$BACKUP_DIR:/backup:ro" \
        alpine:latest \
        sh -c "rm -rf /data/* && tar xzf /backup/yitam-backup-$backup_name.tar.gz -C /data"
    
    if [ $? -eq 0 ]; then
        echo "✅ Restore completed successfully!"
        echo "🚀 Starting containers..."
        docker-compose up -d
    else
        echo "❌ Restore failed!"
        exit 1
    fi
}

list_backups() {
    echo "📋 Available backups:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "   No backups found in $BACKUP_DIR"
        return
    fi
    
    for backup in "$BACKUP_DIR"/yitam-backup-*.tar.gz; do
        if [ -f "$backup" ]; then
            local filename=$(basename "$backup")
            local backup_name=${filename#yitam-backup-}
            backup_name=${backup_name%.tar.gz}
            local size=$(du -h "$backup" | cut -f1)
            local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d' ' -f1-2)
            
            echo "   📦 $backup_name"
            echo "      Size: $size | Created: $date"
            echo ""
        fi
    done
}

# Main script logic
case "$1" in
    "backup")
        backup_data "$2"
        ;;
    "restore")
        restore_data "$2"
        ;;
    "list")
        list_backups
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
