import express from 'express';
import { generateAiReply } from '../services/ai.js';
import {
  buildLeadFollowUp,
  extractLeadSignals,
  syncMessengerLead,
} from '../services/leadCapture.js';
import { loadKnowledgeContext } from '../services/knowledge.js';
import {
  extractMessengerTextEvents,
  getMessengerProfile,
  sendMessengerText,
  verifyMetaSignature,
} from '../services/messenger.js';
import { formatPriceReply, isPriceQuestion, loadApprovedPrices } from '../services/pricing.js';

function enabled() {
  return String(process.env.MESSENGER_ENABLED || 'false').toLowerCase() === 'true';
}

let configuredPipelinePromise;

async function resolveConfiguredPipelineId(supabase) {
  if (process.env.META_PIPELINE_ID) return process.env.META_PIPELINE_ID;
  const slug = String(process.env.META_PIPELINE_SLUG || '').trim();
  if (!slug) return null;
  if (!configuredPipelinePromise) {
    configuredPipelinePromise = supabase
      .from('pipelines')
      .select('id')
      .eq('webhook_slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.id || null;
      });
  }
  return configuredPipelinePromise;
}

async function getOrCreateConversation(supabase, event) {
  const { data: existing, error: findError } = await supabase
    .from('messenger_conversations')
    .select('*')
    .eq('page_id', event.pageId)
    .eq('sender_psid', event.senderPsid)
    .maybeSingle();
  if (findError) throw findError;

  const lastMessageAt = new Date(event.timestamp).toISOString();
  if (existing) {
    const { data, error } = await supabase
      .from('messenger_conversations')
      .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const pipelineId = await resolveConfiguredPipelineId(supabase);
  const { data, error } = await supabase
    .from('messenger_conversations')
    .insert({
      page_id: event.pageId,
      sender_psid: event.senderPsid,
      pipeline_id: pipelineId,
      last_message_at: lastMessageAt,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function saveInboundMessage(supabase, conversationId, event) {
  const { error } = await supabase.from('messenger_messages').insert({
    conversation_id: conversationId,
    event_id: event.eventId,
    direction: 'inbound',
    sender_psid: event.senderPsid,
    text: event.text,
  });
  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function recentHistory(supabase, conversationId) {
  const { data, error } = await supabase
    .from('messenger_messages')
    .select('direction, text, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data || []).reverse();
}

async function enrichConversation(supabase, conversation, event) {
  const messengerProfile = conversation.full_name
    ? null
    : await getMessengerProfile(event.senderPsid);
  const signals = extractLeadSignals(event.text, {
    ...conversation,
    full_name: conversation.full_name || messengerProfile?.full_name || null,
  });
  const { data, error } = await supabase
    .from('messenger_conversations')
    .update({ ...signals, updated_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function processTextEvent(supabase, event) {
  const configuredPageId = String(process.env.META_PAGE_ID || '');
  if (configuredPageId && event.pageId !== configuredPageId) return;

  let conversation = await getOrCreateConversation(supabase, event);
  if (!conversation.bot_enabled) return;
  if (!(await saveInboundMessage(supabase, conversation.id, event))) return;

  conversation = await enrichConversation(supabase, conversation, event);
  const leadResult = await syncMessengerLead(supabase, conversation);
  conversation = leadResult.conversation;

  const [history, sources, prices] = await Promise.all([
    recentHistory(supabase, conversation.id),
    loadKnowledgeContext(supabase, event.text, conversation.pipeline_id),
    loadApprovedPrices(supabase, event.text, conversation.pipeline_id),
  ]);

  const leadFollowUp = buildLeadFollowUp(conversation, leadResult.created);
  const structuredPriceReply = formatPriceReply(prices);
  let reply;
  try {
    reply = await generateAiReply({
      question: event.text,
      history,
      sources,
      structuredPriceReply,
      leadFollowUp,
    });
  } catch (error) {
    console.error('AI provider error:', error.message);
    reply = {
      text: `Em chưa thể trả lời tự động an toàn vào lúc này. ${leadFollowUp}`.trim(),
      provider: 'safe-error-fallback',
      grounded: true,
    };
  }

  if (isPriceQuestion(event.text) && !prices.length) {
    reply.text = `Em chưa tìm thấy bảng giá đang hiệu lực cho sản phẩm anh/chị hỏi nên sẽ không tự báo giá. ${leadFollowUp}`.trim();
    reply.provider = 'no-approved-price';
  }

  const sendResult = await sendMessengerText({
    pageId: event.pageId,
    recipientId: event.senderPsid,
    text: reply.text,
  });

  const { error } = await supabase.from('messenger_messages').insert({
    conversation_id: conversation.id,
    event_id: sendResult.message_id || `${event.eventId}:reply`,
    direction: 'outbound',
    sender_psid: event.senderPsid,
    text: reply.text,
    provider: reply.provider,
    grounding: {
      grounded: reply.grounded !== false,
      source_ids: sources.map((source) => source.sourceId),
      price_ids: prices.map((price) => price.sourceId),
      lead_id: conversation.lead_id || null,
    },
  });
  if (error && error.code !== '23505') throw error;
}

export function createMetaWebhookRouter({ supabase }) {
  const router = express.Router();

  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (
      mode === 'subscribe' &&
      process.env.META_VERIFY_TOKEN &&
      token === process.env.META_VERIFY_TOKEN
    ) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.sendStatus(403);
  });

  router.post('/webhook', async (req, res) => {
    if (!enabled()) return res.sendStatus(200);

    const signature = req.get('x-hub-signature-256');
    if (!verifyMetaSignature(req.rawBody, signature, process.env.META_APP_SECRET)) {
      return res.sendStatus(401);
    }

    const events = extractMessengerTextEvents(req.body);
    if (!events.length) return res.sendStatus(200);

    try {
      await Promise.all(events.map((event) => processTextEvent(supabase, event)));
      return res.sendStatus(200);
    } catch (error) {
      console.error('Messenger webhook error:', error);
      return res.sendStatus(200);
    }
  });

  return router;
}
