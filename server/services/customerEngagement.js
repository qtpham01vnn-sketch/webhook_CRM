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

export function conversationalIntent(question) {
  const value = normalize(question);
  if (!value || BUSINESS_TOPIC.test(value)) return null;
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

export function buildConversationalReply({ intent, contactUrl = '', leadFollowUp = '' }) {
  if (!intent) return '';
  if (intent === 'personal-invitation') {
    return `Em là Trợ lý AI của Gạch Phương Nam 😊 Em chưa thể đi cà phê cùng anh/chị, nhưng rất vui được hỗ trợ về tiêu chuẩn kỹ thuật, sản phẩm và báo giá.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
  }
  if (intent === 'identity') {
    return `Em là Trợ lý AI của Gạch Phương Nam 😊 Em hỗ trợ tra cứu tiêu chuẩn kỹ thuật, sản phẩm và báo giá từ dữ liệu đã được duyệt.\n\n${contactInvitation(contactUrl, leadFollowUp)}`;
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
