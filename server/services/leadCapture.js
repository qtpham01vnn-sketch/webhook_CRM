import { forwardLeadToExternalApp } from './leadForwarder.js';

const GREETING_ONLY = /^(xin chao|chao|hello|hi|alo|hey|cam on|ok|oke)[!. ]*$/i;

export function normalizePhone(input) {
  if (input === undefined || input === null) return null;
  let phone = String(input).trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!phone) return null;
  if (phone.startsWith('0084')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('+84')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('84') && phone.length >= 11) phone = `0${phone.slice(2)}`;
  return phone;
}

function cleanCapturedText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .slice(0, 160);
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

function extractByPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanCapturedText(match[1]);
  }
  return null;
}

export function extractLeadSignals(text, current = {}) {
  const raw = cleanCapturedText(text);
  const plain = normalized(raw);
  const phoneMatch = raw.match(/(?:\+?84|0)(?:[\s.()\-]*\d){8,10}/);
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  const fullName = extractByPatterns(raw, [
    /(?:tôi|toi|mình|minh|em|anh|chị|chi)\s+(?:tên\s+)?(?:là|la)\s+([^,;\n]{2,80})/i,
    /(?:họ\s*(?:và)?\s*tên|ho\s*(?:va)?\s*ten|tên|ten)\s*(?::|là|la)\s*([^,;\n]{2,80})/i,
  ]);

  const companyName = extractByPatterns(raw, [
    /(?:công\s*ty|cong\s*ty|doanh\s*nghiệp|doanh\s*nghiep)\s*(?::|là|la)?\s*([^,;\n]{2,100})/i,
  ]);

  const containsNeed = /(cần|can|muốn|muon|tư vấn|tu van|báo giá|bao gia|giá|gia|gạch|gach|tiêu chuẩn|tieu chuan|sản phẩm|san pham|mua|đại lý|dai ly|công trình|cong trinh)/i.test(
    raw,
  );
  const isOnlyContact = Boolean(phoneMatch || emailMatch) && raw.length < 80;
  const need =
    !GREETING_ONLY.test(plain) && containsNeed && !isOnlyContact
      ? raw.slice(0, 1000)
      : null;

  return {
    full_name: fullName || current.full_name || null,
    phone: normalizePhone(phoneMatch?.[0]) || current.phone || null,
    email: emailMatch?.[0]?.toLowerCase() || current.email || null,
    company_name: companyName || current.company_name || null,
    need: need || current.need || null,
  };
}

export function missingLeadFields(profile) {
  const missing = [];
  if (!profile?.full_name) missing.push('full_name');
  if (!profile?.phone) missing.push('phone');
  if (!profile?.need) missing.push('need');
  return missing;
}

export function buildLeadFollowUp(profile, leadCaptured = false) {
  const missing = missingLeadFields(profile);
  if (missing.includes('full_name')) {
    return 'Anh/chị cho em xin họ và tên để đội ngũ Phương Nam hỗ trợ đúng người nhé.';
  }
  if (missing.includes('phone')) {
    return 'Anh/chị cho em xin số điện thoại để nhân viên Phương Nam liên hệ tư vấn chính xác nhé.';
  }
  if (missing.includes('need')) {
    return 'Anh/chị đang quan tâm mã gạch, tiêu chuẩn kỹ thuật hay cần báo giá sản phẩm nào ạ?';
  }
  if (leadCaptured) {
    return 'Em đã ghi nhận thông tin. Nhân viên Phương Nam sẽ liên hệ với anh/chị sớm nhất.';
  }
  return '';
}

export async function syncMessengerLead(supabase, conversation) {
  if (!conversation?.pipeline_id || !conversation?.need) {
    return { conversation, created: false, updated: false };
  }
  if (!conversation.phone && !conversation.email) {
    return { conversation, created: false, updated: false };
  }

  const leadPayload = {
    pipeline_id: conversation.pipeline_id,
    full_name: conversation.full_name || null,
    phone: conversation.phone || null,
    email: conversation.email || null,
    company_name: conversation.company_name || null,
    note: conversation.need,
    raw_metadata: {
      source: 'facebook_messenger',
      page_id: conversation.page_id,
      sender_psid: conversation.sender_psid,
      messenger_conversation_id: conversation.id,
    },
  };

  if (conversation.lead_id) {
    const { error } = await supabase.from('leads').update(leadPayload).eq('id', conversation.lead_id);
    if (error) throw error;
    await forwardLeadToExternalApp({
      external_id: conversation.lead_id,
      source: 'facebook_messenger',
      ...leadPayload,
    });
    return { conversation, created: false, updated: true };
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert(leadPayload)
    .select('id')
    .single();
  if (leadError) throw leadError;

  const { data: savedConversation, error: conversationError } = await supabase
    .from('messenger_conversations')
    .update({ lead_id: lead.id, status: 'captured', updated_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .select('*')
    .single();
  if (conversationError) throw conversationError;

  await forwardLeadToExternalApp({
    external_id: lead.id,
    source: 'facebook_messenger',
    ...leadPayload,
  });

  return { conversation: savedConversation, created: true, updated: false };
}
