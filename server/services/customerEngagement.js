function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const BUSINESS_TOPIC =
  /\b(gach|san pham|ma sp|bao gia|bang gia|gia ban|tieu chuan|ky thuat|kich thuoc|do am|hut nuoc|do ben|do cong|dung sai|nguyen lieu|than cuc|men|moc|nung|dong goi|bao hanh|dai ly|cong trinh)\b/i;
const GREETING = /^(xin chao|chao|hello|hi|alo|hey|cam on|thank|ok|oke)\b/i;
const IDENTITY = /\b(em|ban|bot|ai)\s+(ten gi|la ai)\b|\bten cua (em|ban)\b/i;
const PERSONAL_INVITATION =
  /\b(di ca phe|uong ca phe|di choi|hen ho|ket ban|yeu anh|yeu em|an toi|di nhau)\b/i;
const HELP_REQUEST =
  /\b(huong dan|instruction|cach dung|dung nhu the nao|hoi nhu the nao|lam duoc gi|chuc nang gi|giup duoc gi)\b/i;
const MEMORY_REQUEST =
  /\b(bo nho|nho duoc|nho toi|lich su hoi|lich su chat|luu thong tin|ghi nho)\b/i;
const SOURCE_REQUEST =
  /\b(tai lieu|file nguon|nguon du lieu|kho du lieu|du lieu dang dung)\b.*\b(dang dung|co gi|gom|nao|tai|download|xuat|xoa|them|upload|bo nho)\b|\b(tai|download|xuat|xoa|them|upload)\b.*\b(tai lieu|file nguon|du lieu)\b/i;
const STANDARD_OVERVIEW =
  /^(bo )?(tieu chuan|tc[ .]?09|tieu chuan ky thuat)( cua phuong nam)?[?.! ]*$/i;

export function conversationalIntent(question) {
  const value = normalize(question);
  if (!value) return null;
  if (HELP_REQUEST.test(value)) return 'help';
  if (SOURCE_REQUEST.test(value)) return 'source-management';
  if (MEMORY_REQUEST.test(value)) return 'memory';
  if (STANDARD_OVERVIEW.test(value)) return 'standards-overview';
  if (BUSINESS_TOPIC.test(value)) return null;
  if (PERSONAL_INVITATION.test(value)) return 'personal-invitation';
  if (IDENTITY.test(value)) return 'identity';
  if (GREETING.test(value)) return 'greeting';
  return null;
}

function contactInvitation(contactUrl, leadFollowUp = '') {
  const leadRequest = leadFollowUp
    ? leadFollowUp.replace(/[.!?]+$/, '')
    : 'Nếu cần nhân viên tư vấn, anh/chị gửi giúp em họ tên, số điện thoại và nhu cầu ngay trong tin nhắn này';
  return contactUrl
    ? `${leadRequest}. Hoặc đăng ký nhanh tại: ${contactUrl}`
    : `${leadRequest}.`;
}

function sourceList(sourceCatalog) {
  if (!sourceCatalog?.length) {
    return 'Hiện em chưa thấy file nào có trạng thái “AI đang dùng” trong Pipeline này.';
  }
  return `Hiện em được phép tra cứu ${sourceCatalog.length} file đã duyệt:\n${sourceCatalog
    .slice(0, 15)
    .map((source, index) => `${index + 1}. ${source.fileName}`)
    .join('\n')}`;
}

export function buildConversationalReply({
  intent,
  contactUrl = '',
  leadFollowUp = '',
  sourceCatalog = [],
}) {
  if (!intent) return '';
  if (intent === 'personal-invitation') {
    return `Em là Trợ lý AI của Gạch Phương Nam 😊 Em chưa thể đi cà phê cùng anh/chị, nhưng rất vui được hỗ trợ về tiêu chuẩn kỹ thuật, sản phẩm và báo giá.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
  }
  if (intent === 'identity') {
    return `Em là Trợ lý AI của Gạch Phương Nam 😊 Em hỗ trợ tra cứu tiêu chuẩn kỹ thuật, sản phẩm và báo giá từ dữ liệu đã được duyệt.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
  }
  if (intent === 'help') {
    return `Em có thể hỗ trợ theo 4 nhóm:\n- Tra cứu tiêu chuẩn và thông số kỹ thuật từ Word/Excel/PDF đã duyệt.\n- Nêu đúng file, trang, sheet hoặc dòng làm nguồn.\n- Hỗ trợ sản phẩm và báo giá khi có bảng giá đang hiệu lực.\n- Ghi nhận họ tên, số điện thoại và nhu cầu để chuyển nhân viên tư vấn.\n\nAnh/chị nên hỏi rõ đối tượng và chỉ tiêu, ví dụ: “Độ ẩm than cục theo TC.09.01 là bao nhiêu?” hoặc “Kích thước gạch 400x800 được quy định thế nào?”.`;
  }
  if (intent === 'memory') {
    return `Em không có bộ nhớ cá nhân như con người. Em chỉ dùng:\n- Các file Word/Excel/PDF đã được quản trị viên phê duyệt trong đúng Pipeline.\n- Một số tin nhắn gần nhất để hiểu ngữ cảnh hội thoại.\n- Thông tin liên hệ do khách tự cung cấp để tạo Lead trong CRM.\n\nEm không tự học thêm, không tự sửa tài liệu và không dùng nội dung chưa được duyệt.`;
  }
  if (intent === 'source-management') {
    return `${sourceList(sourceCatalog)}\n\nEm chỉ lưu phần chữ/bảng đã trích xuất để tra cứu, không giữ nguyên file gốc để tải xuống từ cửa sổ chat. Muốn thêm, tạm ngưng hoặc duyệt tài liệu, anh/chị mở mục “Kho kiến thức & Bảng giá AI” trong CRM.`;
  }
  if (intent === 'standards-overview') {
    return `Bộ TC.09 đang được chia thành các nhóm chính:\n- TC.09.01: nguyên nhiên vật liệu và vật tư đầu vào.\n- TC.09.02: tiêu chuẩn bán thành phẩm.\n- TC.09.03: tiêu chuẩn thành phẩm theo từng kích thước gạch.\n\nAnh/chị muốn tra nhóm nào, loại vật liệu nào hoặc kích thước gạch nào ạ?`;
  }
  return `Chào anh/chị 😊 Em là Trợ lý AI của Gạch Phương Nam. Em có thể hỗ trợ tra cứu tiêu chuẩn kỹ thuật, sản phẩm và báo giá.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
}

export function buildNoSourceReply(contactUrl = '', leadFollowUp = '') {
  return `Em chưa tìm thấy thông tin phù hợp trong tài liệu hoặc bảng giá đã được Phương Nam phê duyệt nên không tự suy đoán. Anh/chị có thể cho em thêm mã sản phẩm, kích thước hoặc nội dung cần tư vấn.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
}

export async function loadPipelineContactUrl(supabase, pipelineId) {
  if (!pipelineId) return '';
  const { data, error } = await supabase
    .from('pipelines')
    .select('webhook_slug')
    .eq('id', pipelineId)
    .maybeSingle();
  if (error) throw error;
  const clientUrl = String(process.env.CLIENT_URL || '').trim().replace(/\/$/, '');
  return clientUrl && data?.webhook_slug
    ? `${clientUrl}/#/embed/${encodeURIComponent(data.webhook_slug)}`
    : '';
}
