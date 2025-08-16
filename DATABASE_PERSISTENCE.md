# Database Persistence Setup

## Vấn đề
Trước đây, khi Docker containers bị down và up lại, toàn bộ database sẽ bị reset về trạng thái ban đầu, làm mất hết dữ liệu đã share.

## Giải pháp
Đã cấu hình Docker volumes để persist database và upload files:
- `server-data`: Lưu trữ SQLite database files
- `server-uploads`: Lưu trữ uploaded files

## Cách sử dụng

### 1. Migration dữ liệu hiện tại (chỉ cần làm 1 lần)

```bash
# Cấp quyền thực thi cho script
chmod +x migrate-data.sh

# Chạy migration
./migrate-data.sh
```

Script này sẽ:
- Stop containers hiện tại
- Copy dữ liệu từ `server/data/` và `server/uploads/` vào Docker volumes
- Verify việc migration

### 2. Khởi động lại containers

```bash
docker-compose up -d
```

Từ giờ, dữ liệu sẽ được persist ngay cả khi containers restart.

### 3. Backup và Restore

#### Tạo backup
```bash
# Backup với timestamp tự động
./backup-restore.sh backup

# Backup với tên tùy chỉnh
./backup-restore.sh backup before-update
```

#### Xem danh sách backups
```bash
./backup-restore.sh list
```

#### Restore từ backup
```bash
./backup-restore.sh restore 20241216_143022
```

## Cấu trúc volumes

### Docker volumes được tạo:
- `yitam_server-data`: Chứa database files
  - `shared_conversations.db`: Shared conversations và acupoint data
  - `qigong.db`: Qigong vessel và acupoint management
- `yitam_server-uploads`: Chứa uploaded files

### Mapping trong container:
- Host volume `server-data` → Container `/app/data`
- Host volume `server-uploads` → Container `/app/uploads`

## Kiểm tra dữ liệu

### Xem files trong volume
```bash
# Database files
docker run --rm -v yitam_server-data:/data alpine:latest ls -la /data

# Upload files  
docker run --rm -v yitam_server-uploads:/uploads alpine:latest ls -la /uploads
```

### Truy cập database trực tiếp
```bash
# Vào container đang chạy
docker-compose exec server sh

# Trong container, có thể dùng sqlite3
sqlite3 /app/data/shared_conversations.db
```

## Lưu ý quan trọng

1. **Backup thường xuyên**: Nên tạo backup trước khi update hoặc thay đổi lớn
2. **Kiểm tra dung lượng**: Theo dõi dung lượng volumes để tránh hết disk space
3. **Bảo mật**: Backup files chứa dữ liệu nhạy cảm, cần bảo vệ cẩn thận

## Troubleshooting

### Nếu containers không start được sau migration:
```bash
# Kiểm tra logs
docker-compose logs server

# Restart containers
docker-compose down
docker-compose up -d
```

### Nếu mất dữ liệu:
```bash
# Restore từ backup gần nhất
./backup-restore.sh list
./backup-restore.sh restore <backup-name>
```

### Nếu cần reset hoàn toàn:
```bash
# Xóa volumes (CẢNH BÁO: Sẽ mất hết dữ liệu!)
docker-compose down
docker volume rm yitam_server-data yitam_server-uploads
docker-compose up -d
```

## Monitoring

### Kiểm tra dung lượng volumes:
```bash
docker system df -v
```

### Xem thông tin chi tiết volume:
```bash
docker volume inspect yitam_server-data
docker volume inspect yitam_server-uploads
```
