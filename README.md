# Mini SaaS CRM Lead Management

Ứng dụng CRM nhỏ để tạo Pipeline, cấp Webhook URL riêng cho từng Pipeline và nhận lead từ Landing Page, LadiPage hoặc Website Form.

## Công nghệ

- Client: React 19, Vite, Tailwind CSS, Lucide React.
- API: Node.js, Express 5, RESTful API.
- Database: Supabase PostgreSQL.

## Cấu trúc dự án

```text
webhook/
├── client/                 # React dashboard
│   ├── src/components/     # Dashboard và Modal
│   └── src/lib/api.js      # API client
├── server/
│   ├── server.js           # Express API + Webhook receiver
│   └── .env.example
├── supabase/
│   ├── schema.sql          # Tables, foreign key và indexes
│   └── seed.sql            # 3 pipeline mẫu (tùy chọn)
└── package.json            # Lệnh chạy chung
```

## 1. Tạo database Supabase

1. Tạo project tại Supabase.
2. Mở **SQL Editor** và chạy toàn bộ [`supabase/schema.sql`](./supabase/schema.sql).
3. Tùy chọn: chạy [`supabase/seed.sql`](./supabase/seed.sql) để thêm ba Pipeline mẫu.
4. Vào **Project Settings > API**, lấy `Project URL` và `service_role key`.

Để bật sửa/xóa Pipeline và link chia sẻ có mật khẩu, chạy thêm toàn bộ [`supabase/sharing.sql`](./supabase/sharing.sql) sau `schema.sql`. Để lưu cấu hình Form nhúng, chạy thêm [`supabase/embed.sql`](./supabase/embed.sql).

`service_role key` bỏ qua RLS và có toàn quyền với database. Chỉ lưu khóa này ở server, tuyệt đối không đưa vào biến môi trường Vite hoặc mã frontend.

## 2. Cấu hình môi trường

Tạo file `server/.env` từ `server/.env.example`:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SHARE_TOKEN_SECRET=replace-with-a-long-random-secret
```

Tạo file `client/.env` từ `client/.env.example` nếu cần đổi cấu hình mặc định:

```env
VITE_API_URL=/api/v1
VITE_WEBHOOK_BASE_URL=http://localhost:3001
```

Khi deploy, đặt `VITE_WEBHOOK_BASE_URL` thành domain public của backend, ví dụ `https://api.crm-cua-ban.vn`.

## 3. Cài đặt và chạy

Yêu cầu Node.js 20.19 trở lên.

```bash
npm install
npm run install:all
npm run dev
```

- Dashboard: `http://localhost:5173`
- API: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

Build frontend production:

```bash
npm run build
```

## API chính

| Method | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/api/v1/pipelines` | Danh sách Pipeline |
| `POST` | `/api/v1/pipelines` | Tạo Pipeline và sinh slug duy nhất |
| `GET` | `/api/v1/pipelines/:id/leads?search=...` | Lead theo Pipeline, tìm tên/SĐT |
| `POST` | `/api/v1/webhook/:slug` | Nhận lead từ form |
| `PATCH` | `/api/v1/pipelines/:id` | Sửa Pipeline |
| `DELETE` | `/api/v1/pipelines/:id` | Xóa Pipeline và lead liên quan |
| `POST` | `/api/v1/pipelines/:id/share` | Tạo/cập nhật link chia sẻ có mật khẩu |
| `GET` | `/api/v1/export/leads.csv` | Xuất CSV theo Pipeline, từ khóa, ngày và cột |
| `GET` | `/api/v1/embed/:slug/config` | Cấu hình Form nhúng công khai |
| `POST` | `/api/v1/pipelines/:id/form` | Lưu cấu hình Form nhúng |

Ví dụ tạo Pipeline:

```bash
curl -X POST http://localhost:3001/api/v1/pipelines \
  -H "Content-Type: application/json" \
  -d '{"name":"Website Ads","description":"Lead từ quảng cáo","redirect_url":"https://example.com/cam-on"}'
```

Ví dụ gửi Webhook dạng JSON:

```bash
curl -X POST http://localhost:3001/api/v1/webhook/your-webhook-slug \
  -H "Content-Type: application/json" \
  -d '{
    "full_name":"Nguyễn Văn An",
    "phone":"+84 912 345 678",
    "email":"AN@EXAMPLE.COM",
    "note":"Cần tư vấn landing page",
    "company_name":"An Phát Co.",
    "utm_source":"facebook",
    "campaign_id":"summer-2026"
  }'
```

Response thành công:

```json
{
  "status": "success",
  "lead_id": "uuid",
  "received_at": "2026-08-08T16:00:00.000Z",
  "redirect_url": "https://example.com/cam-on"
}
```

Webhook cũng nhận `application/x-www-form-urlencoded`. Backend tự nhận biết các alias phổ biến như `name`, `fullname`, `ho_ten`, `mobile`, `tel`, `message`, `content`, `company`; các field không dùng để ánh xạ sẽ được giữ trong `raw_metadata`.

## Gợi ý production

- Deploy `client/dist` lên Vercel, Netlify hoặc CDN; deploy `server` lên Render, Railway, Fly.io hoặc VPS.
- Cấu hình reverse proxy để frontend gọi `/api`, hoặc đặt `VITE_API_URL` thành URL tuyệt đối của backend.
- Giới hạn CORS bằng `CLIENT_URL`; nhiều origin được phân tách bằng dấu phẩy.
- Không commit file `.env`; luân chuyển `service_role key` ngay nếu bị lộ.
- Với traffic public lớn, nên bổ sung rate limit, CAPTCHA ở form nguồn và cơ chế chống lead trùng theo nhu cầu nghiệp vụ.
