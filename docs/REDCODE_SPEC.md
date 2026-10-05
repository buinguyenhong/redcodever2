# REDCODE HOSPITAL — SYSTEM SPECIFICATION

**Version:** 1.0  
**Status:** Implementation baseline  
**Target repository:** `buinguyenhong/redcodever2`  
**Purpose:** This document is the source of truth for the coding agent implementing the production Redcode system.

---

## 1. Mục tiêu

Xây dựng hệ thống Redcode nội bộ bệnh viện có độ ổn định cao, hoạt động lâu dài trên LAN, phục vụ khoảng 50 thiết bị và có khả năng mở rộng khoảng 100 thiết bị.

Hệ thống phải tập trung vào:

1. Phát cảnh báo realtime.
2. Phát âm thanh tại đúng các thiết bị được cấu hình.
3. Hiển thị cảnh báo trực quan, nghiêm trọng và không thể nhầm lẫn.
4. Theo dõi kết nối của từng client.
5. Ghi log/audit đầy đủ, không giới hạn thời gian lưu.
6. Báo cáo và xuất file.
7. Gửi thông tin Redcode sang n8n.
8. Hoạt động độc lập với Internet và n8n.
9. Tự phục hồi kết nối/client khi có sự cố.
10. Kiến trúc tinh gọn, không thêm thành phần không cần thiết.

### Không làm trong phiên bản này

Không triển khai:

- Redis
- RabbitMQ
- Kafka
- Kubernetes
- Microservices
- Supabase
- Cloud database/storage
- Native Android application nếu browser/kiosk đáp ứng được
- AI/chatbot
- Các tính năng nghiệp vụ ngoài Redcode
- Thông báo kết thúc Redcode qua Mattermost/Telegram/Zalo

---

# 2. Kiến trúc bắt buộc

```text
                         INTERNET
                            |
                    Integration Server
                         Docker
                           |
                          n8n
                           ^
                           |
                      HTTP Webhook
                           |
========================================================
                    HOSPITAL INTERNAL LAN
                           |
                    +---------------+
                    | REDCODE SERVER|
                    | Ubuntu Docker |
                    +---------------+
                      |      |     |
                    Nginx  FastAPI  |
                           |        |
                      WebSocket     |
                           |        |
                     PostgreSQL ----+
                     existing container
                     database: redcode
                           |
             +-------------+-------------+
             |             |             |
            PC            PC          Android
         receiver       receiver       kiosk
             |             |             |
          speaker       speaker       speaker
```

## 2.1 PostgreSQL

PostgreSQL đã tồn tại trên một container riêng.

**Không tạo PostgreSQL container mới.**

Chỉ tạo database riêng:

```text
redcode
```

FastAPI kết nối đến database này.

Client không được phép truy cập PostgreSQL trực tiếp.

## 2.2 Core services

Production chỉ cần:

- Nginx
- FastAPI
- React build
- PostgreSQL container hiện có

Nginx là entry point duy nhất cho client.

Routing:

```text
/        -> React static files
/api/*   -> FastAPI HTTP
/ws      -> FastAPI WebSocket
/assets  -> local static assets/audio
```

---

# 3. Nguyên tắc vận hành quan trọng nhất

## 3.1 Redcode core không phụ thuộc n8n

Luồng đúng:

```text
Client
  |
  v
Redcode Server
  |
  +--> PostgreSQL
  |
  +--> WebSocket --> receivers
  |
  +--> n8n       --> chat channels
```

Không được:

```text
Client -> n8n -> Redcode
```

Không được chờ n8n trả kết quả trước khi phát cảnh báo.

Nếu n8n chết:

- Redcode vẫn phát cảnh báo.
- Audio vẫn hoạt động.
- WebSocket vẫn hoạt động.
- Log vẫn được ghi.
- Chỉ integration notification bị lỗi/retry.

## 3.2 Internet không phải dependency của Redcode

Client không cần Internet.

Redcode server cũng không cần Internet để thực hiện nghiệp vụ cảnh báo.

---

# 4. Công nghệ

## Frontend

- React
- Vite
- React Router
- WebSocket native/browser
- XLSX export
- Lucide hoặc icon library nhẹ nếu cần

Có thể tái sử dụng phần UI/business concept của repo hiện tại nhưng phải refactor khỏi Supabase.

## Backend

- Python
- FastAPI
- Uvicorn
- SQLAlchemy 2.x hoặc SQLModel
- Pydantic
- JWT hoặc session/token phù hợp
- Password hashing bằng Argon2 hoặc bcrypt

## Database

- PostgreSQL hiện có

## Reverse proxy

- Nginx

## Deployment

- Docker Compose cho Redcode API + Nginx
- PostgreSQL dùng container/network hiện có

---

# 5. Authentication và Authorization

## 5.1 User

User thuộc một khoa/phòng ban.

Không quản lý nhân viên/HIS trong phiên bản này.

```text
User
  |
  +-- Department
  |
  +-- Role
  |
  +-- Permissions
```

Roles tối thiểu:

- `ADMIN`
- `OPERATOR`
- `VIEWER`

## 5.2 Quyền phát Redcode

Quyền phụ thuộc user/khoa.

Ví dụ:

```text
Cấp cứu
  RED_CODE_1 = allowed
  RED_CODE_2 = allowed
  BLUE_CODE  = denied
```

Không hard-code permission trong React.

## 5.3 Receiver station

Các máy cố định không cần đăng nhập thủ công mỗi ngày.

Mỗi station có:

- station_id
- station_name
- department
- location
- IP
- receiver_group
- device token/activation token

Sau khi cấu hình, station tự kết nối.

---

# 6. Alarm types

Alarm type phải là dữ liệu cấu hình, không hard-code.

Ví dụ mặc định:

```text
RED_CODE_1
RED_CODE_2
BLUE_CODE
FIRE_ALARM
```

Admin có thể:

- tạo
- sửa
- bật/tắt
- sắp xếp
- cấu hình màu
- cấu hình âm thanh
- cấu hình receiver group
- cấu hình permission

Mỗi alarm type tối thiểu có:

```text
id
code
name
description
enabled
display_color
priority
audio_sequence
repeat_count
repeat_interval_ms
```

---

# 7. Receiver groups

Không gán từng station thủ công cho từng alarm nếu có thể tránh.

Tạo:

```text
receiver_groups
```

Ví dụ:

```text
RED_CODE_1_GROUP
RED_CODE_2_GROUP
BLUE_CODE_GROUP
FIRE_ALARM_GROUP
```

Một group có nhiều station.

Một station có thể thuộc nhiều group.

Quan hệ:

```text
receiver_groups
receiver_group_stations
```

Alarm type trỏ đến receiver group.

Điều này giúp mở rộng từ 50 lên 100+ thiết bị mà không phải sửa logic.

---

# 8. Alarm lifecycle

Không sử dụng lẫn các status như `active`, `Đang báo động`, `resolved`.

Machine status phải thống nhất bằng enum.

Đề xuất:

```text
CREATED
ACTIVE
DISPLAY_COMPLETED
CANCELLED
```

### CREATED

Alarm vừa được tạo và ghi database.

### ACTIVE

Alarm đang được broadcast/hiển thị/phát âm thanh.

### DISPLAY_COMPLETED

Các receiver đã hoàn tất trạng thái hiển thị hoặc người dùng đã tắt cảnh báo tại station.

### CANCELLED

Chỉ dùng khi alarm được tạo nhầm và có quyền hủy.

Không cần workflow "xử lý công việc" hoặc "hoàn thành sự cố".

**V1 không gửi thông báo kết thúc alarm qua n8n.**

---

# 9. Local dismiss và global alarm

Dismiss tại một client là **local action**.

Ví dụ:

```text
Alarm #1001
  |
  +-- RC-001 -> dismissed
  +-- RC-002 -> active
  +-- RC-003 -> dismissed
```

Không được để RC-001 dismiss làm biến mất cảnh báo trên RC-002.

Mỗi station phải có delivery/presentation state riêng.

Global alarm record vẫn được giữ để audit.

---

# 10. FIFO và nhiều alarm đồng thời

Nếu nhiều alarm đến liên tiếp:

```text
10:00:00 RED_CODE_1
10:00:03 BLUE_CODE
10:00:05 RED_CODE_2
```

Phải xử lý theo thứ tự tạo:

```text
RED_CODE_1
    ->
BLUE_CODE
    ->
RED_CODE_2
```

Không được mất alarm.

Mỗi alarm có timestamp/server sequence để đảm bảo ordering.

Không dùng client clock để quyết định thứ tự.

---

# 11. Alarm creation flow

```text
User
 |
 | POST /api/alarms
 v
FastAPI
 |
 +-- authenticate
 |
 +-- authorize
 |
 +-- validate alarm type
 |
 +-- determine receiver group
 |
 +-- create alarm
 |
 +-- create CREATED event
 |
 +-- broadcast WebSocket
 |
 +-- enqueue/send n8n notification
 |
 v
Response
```

n8n không nằm trong critical path.

---

# 12. WebSocket

WebSocket là cơ chế realtime chính.

Client giữ kết nối:

```text
/ws
```

Server phải hỗ trợ:

- connect
- authentication
- station identification
- heartbeat
- reconnect
- alarm event
- system status
- acknowledgement/dismiss event
- connection state

## 12.1 Reconnect

Client phải tự reconnect khi:

- server restart
- mạng mất
- WebSocket bị đóng
- browser reconnect
- VLAN/network transient failure

Backoff tăng dần, có giới hạn.

Sau reconnect:

```text
connect
  ->
authenticate
  ->
send station status
  ->
query active/recent state
  ->
synchronize missed state
```

WebSocket không phải source of truth.

PostgreSQL mới là source of truth.

---

# 13. Heartbeat và device monitoring

Mỗi station heartbeat khoảng:

```text
5 seconds
```

Server đánh dấu offline nếu vượt ngưỡng cấu hình, mặc định khoảng:

```text
15 seconds
```

Có thể cấu hình.

Theo dõi tối thiểu:

```text
station
IP
last_seen
websocket_connected
audio_ready
browser/client_ready
status
```

Không cần theo dõi CPU/RAM/client process ở V1.

---

# 14. Client offline behavior

Khi client mất kết nối:

1. Server ghi `DEVICE_DISCONNECTED`.
2. Dashboard Admin hiển thị OFFLINE.
3. Khi client tự kết nối lại:
   - ghi `DEVICE_CONNECTED`
   - cập nhật last_seen
   - đồng bộ trạng thái
4. Client hiển thị trạng thái mất kết nối.
5. Không gửi thông báo mất client qua Mattermost/Telegram/Zalo.

Client phải tự reconnect.

---

# 15. Audio

Audio phải nằm trên Redcode Server/local LAN.

Không phụ thuộc:

- Internet
- CDN
- Supabase Storage
- Google Drive
- cloud storage

Ví dụ:

```text
/assets/audio/
  red-code-1/
  red-code-2/
  blue-code/
  fire-alarm/
```

Audio sequence phải cấu hình được.

Ví dụ:

```text
RED CODE 1
  1. red_code_1.mp3
  2. cap_cuu.mp3
  3. location.mp3
```

Có cấu hình:

- sequence
- repeat count
- interval
- enabled/disabled

---

# 16. Audio readiness

Station phải có trạng thái:

```text
AUDIO_READY
AUDIO_NOT_READY
UNKNOWN
```

Admin phải nhìn được trạng thái này.

Nếu browser policy không cho autoplay audio khi chưa có user interaction, coding agent **không được giả định rằng browser luôn hoạt động**.

Phải có cơ chế test audio readiness.

Nếu browser thuần không đáp ứng được yêu cầu unattended audio ổn định trên Android thực tế, phải báo cáo rõ limitation trước khi chọn native/wrapper solution.

Không tự ý đưa native Android vào V1 nếu chưa có bằng chứng cần thiết.

---

# 17. Alarm UI

UI phải tuân thủ nguyên tắc:

> NORMAL = yên tĩnh, tinh gọn.  
> ALARM = rõ ràng, mạnh, không thể nhầm lẫn.

## Không sử dụng các phong cách phổ biến của AI

Tránh:

- gradient tím/xanh
- glassmorphism
- dashboard SaaS generic
- quá nhiều rounded cards
- excessive shadows
- neon/futuristic AI
- card layout dày đặc
- sidebar quá lớn
- icon trong vòng tròn chỉ để trang trí
- quá nhiều chart

## Visual direction

Phong cách:

**Clinical Control Interface**

Đặc điểm:

- typography rõ
- ít màu
- khoảng trắng có chủ đích
- đường phân cách tinh tế
- bố cục giống control system
- thông tin phân cấp mạnh
- không trang trí dư thừa

---

# 18. Alarm popup

Không dùng modal nhỏ thông thường.

Khi alarm xảy ra, client chuyển sang **Alarm State**.

Phải hiển thị nổi bật:

```text
RED CODE 1

CẤP CỨU

KHU CẤP CỨU
PHÒNG 03

[GHI CHÚ nếu có]

[TẮT CẢNH BÁO]
```

Màu cảnh báo phải thể hiện rõ mức độ nghiêm trọng.

Không dùng màu nhạt/pastel.

Không để người dùng phải đọc nhiều để hiểu cảnh báo.

---

# 19. Animation

Animation được phép nhưng phải có mục đích.

Được phép:

- alarm entrance
- subtle pulse
- connection state transition
- state change

Không dùng animation liên tục gây mỏi mắt hoặc làm giảm khả năng đọc.

Âm thanh và visual alarm phải được kích hoạt gần như đồng thời.

---

# 20. Sau khi dismiss

Khi người dùng tắt cảnh báo:

- popup biến mất
- audio dừng
- trạng thái cảnh báo trên client trở về bình thường
- alarm vẫn còn trong log
- recent alarm vẫn hiển thị trên dashboard

Không xóa record.

---

# 21. Dashboard

Dashboard người dùng thường phải rất đơn giản.

Có:

1. Nút phát Redcode được phép.
2. Active/recent alerts.
3. Trạng thái kết nối.
4. Thông tin station/user.

Không tạo quá nhiều card thống kê.

---

# 22. Admin dashboard

Admin cần:

### System status

```text
Redcode Core
Database
WebSocket
n8n Integration
```

### Device status

```text
Online
Offline
Audio Ready
Last Seen
```

### Recent events

Các event mới nhất.

### Configuration

- Departments
- Users
- Alarm types
- Receiver groups
- Stations
- Audio
- n8n integration

---

# 23. Reporting

V1 chỉ cần:

### Tổng quan

- tổng alarm
- alarm theo ngày
- alarm theo tháng
- alarm theo loại
- alarm theo khoa
- average acknowledgement/presentation time nếu dữ liệu đủ
- số lần station offline
- tổng thời gian offline nếu dữ liệu đủ

### Export

Bắt buộc hỗ trợ:

```text
XLSX
```

PDF không bắt buộc ở V1.

Không xây dựng BI/Grafana riêng.

---

# 24. Database schema

Database tối thiểu:

```text
departments
users
stations
alarm_types
receiver_groups
receiver_group_stations
alarms
alarm_events
system_events
audio_files
```

## departments

```text
id
code
name
enabled
created_at
updated_at
```

## users

```text
id
username
password_hash
display_name
department_id
role
enabled
created_at
updated_at
last_login_at
```

## stations

```text
id
station_code
name
department_id
location
ip_address
device_token_hash
enabled
last_seen_at
websocket_connected
audio_ready
client_ready
status
created_at
updated_at
```

## alarm_types

```text
id
code
name
description
enabled
priority
display_color
receiver_group_id
repeat_count
repeat_interval_ms
created_at
updated_at
```

## receiver_groups

```text
id
code
name
description
enabled
created_at
updated_at
```

## receiver_group_stations

```text
receiver_group_id
station_id
```

Unique composite key.

## alarms

```text
id
alarm_type_id
created_by_user_id
source_department_id
source_location
note
status
created_at
activated_at
display_completed_at
cancelled_at
server_sequence
```

## alarm_events

```text
id
alarm_id
station_id nullable
event_type
event_time
metadata jsonb
created_at
```

Event examples:

```text
CREATED
BROADCAST
RECEIVED
DISPLAYED
AUDIO_STARTED
AUDIO_COMPLETED
DISMISSED
CANCELLED
```

## system_events

```text
id
station_id nullable
event_type
severity
message
metadata jsonb
created_at
```

Examples:

```text
DEVICE_CONNECTED
DEVICE_DISCONNECTED
WEBSOCKET_CONNECTED
WEBSOCKET_DISCONNECTED
AUDIO_READY
AUDIO_NOT_READY
N8N_REQUEST_SUCCESS
N8N_REQUEST_FAILED
AUTH_FAILED
SERVER_ERROR
DATABASE_ERROR
```

## audio_files

```text
id
code
name
file_path
mime_type
enabled
created_at
updated_at
```

Do not store large audio binary in PostgreSQL unless there is a compelling reason. Store files on local persistent storage and metadata in PostgreSQL.

---

# 25. Audit requirements

Every critical action must be traceable.

At minimum:

- login
- failed login
- alarm created