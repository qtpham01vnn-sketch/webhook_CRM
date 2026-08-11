import crypto from 'node:crypto';
import express from 'express';
import { generateAiReply } from '../services/ai.js';
import {
  conversationalIntent,
  loadPipelineContactUrl,
} from '../services/customerEngagement.js';
import {
  loadApprovedSourceCatalog,
  loadKnowledgeContext,
} from '../services/knowledge.js';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

export function createChatIntegrationRouter({ supabase }) {
  const router = express.Router();

  router.post('/chat/query', async (req, res, next) => {
    try {
      const expectedToken = process.env.CHAT_INTEGRATION_TOKEN;
      const suppliedToken = req.get('x-integration-key');
      if (!expectedToken) {
        return res.status(503).json({ message: 'CHAT_INTEGRATION_TOKEN chua duoc cau hinh.' });
      }
      if (!safeEqual(suppliedToken, expectedToken)) {
        return res.status(401).json({ message: 'Integration key khong hop le.' });
      }

      const question = clean(req.body.question);
      if (!question) return res.status(400).json({ message: 'question la bat buoc.' });
      const pipelineIdInput = clean(req.body.pipeline_id, 80);
      const pipelineSlug = clean(
        req.body.pipeline_slug || process.env.CHAT_INTEGRATION_PIPELINE_SLUG,
        120,
      );
      let pipelineId = pipelineIdInput;
      if (!pipelineId && pipelineSlug) {
        const { data, error } = await supabase
          .from('pipelines')
          .select('id')
          .eq('webhook_slug', pipelineSlug)
          .maybeSingle();
        if (error) throw error;
        pipelineId = data?.id || '';
      }
      if (!pipelineId) return res.status(404).json({ message: 'Khong tim thay Pipeline.' });

      const history = Array.isArray(req.body.history)
        ? req.body.history.slice(-8).map((message) => ({
            direction: message?.direction === 'outbound' ? 'outbound' : 'inbound',
            text: clean(message?.text, 2000),
          })).filter((message) => message.text)
        : [];
      const intent = conversationalIntent(question);
      const [sources, contactUrl, sourceCatalog] = await Promise.all([
        intent ? Promise.resolve([]) : loadKnowledgeContext(supabase, question, pipelineId),
        loadPipelineContactUrl(supabase, pipelineId),
        intent ? loadApprovedSourceCatalog(supabase, pipelineId) : Promise.resolve([]),
      ]);
      const reply = await generateAiReply({
        question,
        history,
        sources,
        contactUrl,
        sourceCatalog,
      });
      return res.json({
        response: reply.text,
        provider: reply.provider,
        grounded: reply.grounded !== false,
        found_sources: sources.length > 0,
        sources: sources.map((source) => ({
          source_id: source.sourceId,
          file_name: source.sourceLabel || source.title,
          page_reference: source.pageReference,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
