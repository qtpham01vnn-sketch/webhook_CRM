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

Để thử nghiệm chatbot Messenger + AI, chạy thêm [`supabase/messenger.sql`](./supabase/messenger.sql). Migration này chỉ tạo bảng mới, không sửa hoặc xóa dữ liệu CRM hiện có.

Sau khi đã chạy các migration cần thiết, chạy [`supabase/security.sql`](./supabase/security.sql) để bật RLS, thu hồi quyền truy cập trực tiếp của `anon`/`authenticated` và giữ quyền cho backend `service_role`.

`service_role key` bỏ qua RLS và có toàn quyền với database. Chỉ lưu khóa này ở server, tuyệt đối không đưa vào biến môi trường Vite hoặc mã frontend.

## 2. Cấu hình môi trường

Tạo file `server/.env` từ `server/.env.example`:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SHARE_TOKEN_SECRET=replace-with-a-long-random-secret
ADMIN_API_TOKEN=replace-with-a-long-random-admin-token
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
- Đặt `ADMIN_API_TOKEN` trên backend để bảo vệ API quản trị. Dashboard sẽ hỏi mã này và chỉ giữ trong `sessionStorage` của tab hiện tại; không đặt mã quản trị trong biến `VITE_*`.
- Không commit file `.env`; luân chuyển `service_role key` ngay nếu bị lộ.
- Với traffic public lớn, nên bổ sung rate limit, CAPTCHA ở form nguồn và cơ chế chống lead trùng theo nhu cầu nghiệp vụ.

## Chatbot Messenger + AI (tùy chọn)

Phần Messenger được tách khỏi webhook lead hiện tại và mặc định tắt bằng `MESSENGER_ENABLED=false`. Callback URL dành cho Meta là:

```text
https://<API_DOMAIN>/api/v1/meta/webhook
```

Webhook này không thay thế Meta App. Để nhận/gửi tin nhắn Fanpage vẫn cần Meta App hoặc một nền tảng trung gian đã được Meta cấp quyền, cùng Page Access Token hợp lệ.

Luồng xử lý:

```text
Messenger -> webhook Meta -> tìm đoạn tài liệu liên quan -> AI -> Meta Send API
                                      |
                                      +-> Supabase lưu hội thoại
```

### Cấu hình miễn phí

1. Chạy `supabase/messenger.sql` trong Supabase SQL Editor.
2. Thêm một hoặc nhiều tài liệu đã được duyệt vào bảng `knowledge_documents`. Bản đầu dùng tìm kiếm từ khóa, không cần dịch vụ embedding trả phí.
3. Chọn AI:
   - `AI_PROVIDER=ollama`: chạy miễn phí và riêng tư trên máy có Ollama.
   - `AI_PROVIDER=gemini`: dùng hạn mức free tier của Gemini; không nên gửi dữ liệu khách hàng nhạy cảm vì điều khoản free tier có thể cho phép dùng nội dung để cải thiện sản phẩm.
4. Cấu hình các biến `META_*` trong môi trường backend.
5. Xác minh callback trên Meta khi `MESSENGER_ENABLED=false`; chỉ chuyển thành `true` sau khi database, AI và Page Access Token đã sẵn sàng.

Bot chỉ trả lời khi tìm thấy tài liệu liên quan. Nếu không có nguồn phù hợp, bot yêu cầu thêm mã sản phẩm/tiêu chuẩn thay vì tự suy đoán.

### Thêm tài liệu thử nghiệm

```sql
insert into public.knowledge_documents (pipeline_id, title, source_label, content)
values (
  null,
  'Tiêu chuẩn thử nghiệm',
  'TC.09 - trang 1',
  'Dán phần nội dung đã kiểm tra của tài liệu vào đây.'
);
```

Không lưu `META_APP_SECRET`, Page Access Token hoặc API key trong GitHub. Các giá trị này chỉ được đặt trong Environment Variables của backend.

### Kho dữ liệu AI của Gạch Phương Nam

Trong CRM, chọn Pipeline dành cho Gạch Phương Nam, mở menu dấu ba chấm và chọn **Dữ liệu AI**. Màn hình này có hai khu vực:

- **Tiêu chuẩn kỹ thuật:** chọn đồng thời tối đa 20 file Word `.docx`, Excel `.xlsx` hoặc PDF có lớp văn bản. Hệ thống đọc toàn bộ nội dung và bảng, sau đó tự tạo chỉ mục nội bộ để AI tìm đúng đoạn, trang hoặc sheet/dòng khi trả lời.
- **Sản phẩm & bảng giá:** lưu danh mục sản phẩm và bảng giá có phiên bản, ngày hiệu lực, khu vực, nhóm khách hàng và đơn vị tính. Có thể tải tệp `.xlsx`; hệ thống tự dò hàng tiêu đề tiếng Việt/Anh, xem trước các dòng hợp lệ và báo các dòng bị bỏ qua.

Khi nhập tiêu chuẩn, anh duyệt một lần cho cả danh sách file; không phải tự tách mã hoặc chọn từng dòng. File được đọc ngay trên trình duyệt và toàn bộ phần chữ/bảng trích xuất được gửi thành các khối tìm kiếm có gắn nguồn. Word giữ nội dung theo thứ tự tài liệu, Excel giữ tên sheet và số dòng, PDF giữ số trang. Chỉ file có trạng thái `approved`, đang bật và còn hiệu lực mới được AI sử dụng. Tab **Sản phẩm & bảng giá** vẫn nhận Excel bảng giá theo cấu trúc riêng. Giới hạn mỗi lần chọn là 20 file, mỗi file tối đa 25 MB và 250 khối tìm kiếm; PDF scan ảnh chưa có lớp chữ cần OCR trước khi nhập.

File nhập ở trạng thái **Bản nháp** xuất hiện trong danh sách **Các file đã tải**. Bấm **Duyệt cho AI** ở từng file hoặc **Duyệt tất cả** để cập nhật toàn bộ khối thuộc file sang `approved`; có thể bấm **Tạm ngưng AI dùng file** để đưa file về Bản nháp mà không phải xóa hoặc tải lại.

Khung **Test AI với kho tài liệu** cho phép hỏi trực tiếp trong CRM trước khi kết nối Messenger. Backend chỉ tìm nguồn `approved` thuộc đúng Pipeline, trả câu trả lời kèm file/trang/sheet nguồn và cho biết AI provider đang dùng. Nếu `AI_PROVIDER=disabled`, khung test vẫn kiểm tra được việc tìm nguồn nhưng sẽ báo cần bật Gemini/Ollama để tạo câu trả lời đầy đủ.

Câu chào hỏi hoặc ngoài nghiệp vụ được trả lời thân thiện, không gắn nhầm nguồn kỹ thuật. Bot chủ động xin họ tên, số điện thoại, nhu cầu và dẫn khách sang form đúng Pipeline để tạo Lead trong CRM.

App bên ngoài có thể dùng chung kho AI qua `POST /api/v1/integrations/chat/query` với header `X-Integration-Key`. Khóa này chỉ có quyền hỏi kho tài liệu, không cấp quyền quản trị CRM. Khi cấu hình `LEAD_FORWARD_URL` và `LEAD_FORWARD_TOKEN`, Lead từ form CRM hoặc Messenger được chuyển tiếp sang app PXSX; lỗi chuyển tiếp không làm mất Lead gốc.

Giá bán được truy vấn trực tiếp từ `product_prices`; mô hình AI không được tự tạo giá. Câu trả lời về tiêu chuẩn phải có mã nguồn dạng `[SRC:<uuid>]`. Nếu mô hình trả lời không có nguồn hợp lệ, backend loại bỏ câu trả lời đó và gửi thông báo an toàn thay thế.

Tin nhắn Messenger được lưu vào `messenger_conversations` và `messenger_messages`. Khi đã thu được tối thiểu họ tên, số điện thoại và nhu cầu, hệ thống tạo hoặc cập nhật Lead trong Pipeline đã cấu hình bằng `META_PIPELINE_ID` hoặc `META_PIPELINE_SLUG`.

Trước khi bật bot:

1. Chạy lại `supabase/messenger.sql` và `supabase/security.sql` trong Supabase SQL Editor.
2. Đặt `ADMIN_API_TOKEN` để bảo vệ màn hình quản trị dữ liệu AI.
3. Nhập tiêu chuẩn và bảng giá thật, kiểm tra trạng thái **Đã duyệt**.
4. Cấu hình các biến `META_*` và AI provider trên backend Vercel.
5. Giữ `MESSENGER_ENABLED=false` khi kiểm tra webhook; chỉ chuyển thành `true` sau khi thử nghiệm trên tài khoản Meta có quyền quản trị Trang.

Không thể bảo đảm tuyệt đối một mô hình ngôn ngữ không bao giờ sinh nội dung sai. Thiết kế này giảm rủi ro bằng dữ liệu đã duyệt, giá có cấu trúc, trích dẫn bắt buộc và chặn câu trả lời không có nguồn; các tư vấn quan trọng vẫn nên được nhân viên xác nhận.
