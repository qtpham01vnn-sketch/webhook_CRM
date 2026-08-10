import express from 'express';
import { generateAiReply } from '../services/ai.js';
import { loadKnowledgeContext } from '../services/knowledge.js';
import {
  extractMessengerTextEvents,
  sendMessengerText,
  verifyMetaSignature,
} from '../services/messenger.js';

function enabled() {
  return String(process.env.MESSENGER_ENABLED || 'false').toLowerCase() === 'true';
}

async function getOrCreateConversation(supabase, event) {
  const pipelineId = process.env.META_PIPELINE_ID || null;
  const { data, error } = await supabase
    .from('messenger_conversations')
    .upsert(
      {
        page_id: event.pageId,
        sender_psid: event.senderPsid,
        pipeline_id: pipelineId,
        last_message_at: new Date(event.timestamp).toISOString(),
      },
      { onConflict: 'page_id,sender_psid' },
    )
    .select('id, pipeline_id, bot_enabled')
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

async function processTextEvent(supabase, event) {
  const configuredPageId = String(process.env.META_PAGE_ID || '');
  if (configuredPageId && event.pageId !== configuredPageId) return;

  const conversation = await getOrCreateConversation(supabase, event);
  if (!conversation.bot_enabled) return;
  if (!(await saveInboundMessage(supabase, conversation.id, event))) return;

  const [history, sources] = await Promise.all([
    recentHistory(supabase, conversation.id),
    loadKnowledgeContext(supabase, event.text, conversation.pipeline_id),
  ]);
  const reply = await generateAiReply({ question: event.text, history, sources });
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
    // Van tra 200 khi tat de Meta khong lap lai su kien; khong xu ly hay gui tin.
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
      // Tra 200 de Meta khong lap lai lien tuc; event_id da duoc chong trung trong DB.
      return res.sendStatus(200);
    }
  });

  return router;
}
