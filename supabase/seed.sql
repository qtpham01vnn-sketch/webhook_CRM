-- Du lieu mau tuy chon. Chay sau schema.sql neu muon xem nhanh giao dien.

insert into public.pipelines (name, description, webhook_slug, redirect_url)
values
  (
    'Công đoàn PNG',
    'Lead đăng ký từ landing page Công đoàn PNG',
    'cong-doan-png-demo',
    null
  ),
  (
    'Gạch Phương Nam',
    'Khách hàng yêu cầu tư vấn sản phẩm gạch',
    'gach-phuong-nam-demo',
    null
  ),
  (
    'Tư vấn Landingpage',
    'Lead cần tư vấn thiết kế landing page',
    'tu-van-landingpage-demo',
    null
  )
on conflict (webhook_slug) do nothing;

