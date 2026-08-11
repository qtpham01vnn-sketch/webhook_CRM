import express from 'express';
import { generateAiReply } from '../services/ai.js';
import { loadKnowledgeContext } from '../services/knowledge.js';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function text(value, max = 500) {
  const result = String(value || '').trim();
  return result ? result.slice(0, max) : null;
}

function requiredText(value, field, max = 500) {
  const result = text(value, max);
  if (!result) {
    const error = new Error(`${field} la bat buoc.`);
    error.status = 400;
    throw error;
  }
  return result;
}

function pipelineFilter(query, pipelineId) {
  return pipelineId ? query.eq('pipeline_id', pipelineId) : query.is('pipeline_id', null);
}

function chunks(items, size = 250) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export function createGroundedDataRouter({ supabase }) {
  const router = express.Router();

  router.get(
    '/summary',
    asyncHandler(async (req, res) => {
      const pipelineId = text(req.query.pipeline_id, 80);
      const tables = ['knowledge_documents', 'product_catalog', 'price_lists'];
      const counts = {};
      for (const table of tables) {
        let query = supabase.from(table).select('*', { count: 'exact', head: true });
        query = pipelineFilter(query, pipelineId);
        const { count, error } = await query;
        if (error) throw error;
        counts[table] = count || 0;
      }
      res.json({ data: counts });
    }),
  );

  router.get(
    '/knowledge',
    asyncHandler(async (req, res) => {
      const pipelineId = text(req.query.pipeline_id, 80);
      let query = supabase
        .from('knowledge_documents')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1000);
      query = pipelineFilter(query, pipelineId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data: data || [] });
    }),
  );

  router.post(
    '/test-ai',
    asyncHandler(async (req, res) => {
      const pipelineId = requiredText(req.body.pipeline_id, 'pipeline_id', 80);
      const question = requiredText(req.body.question, 'question', 4000);
      const history = Array.isArray(req.body.history)
        ? req.body.history.slice(-8).map((message) => ({
            direction: message?.direction === 'outbound' ? 'outbound' : 'inbound',
            text: text(message?.text, 2000) || '',
          })).filter((message) => message.text)
        : [];
      const sources = await loadKnowledgeContext(supabase, question, pipelineId);
      const reply = await generateAiReply({ question, history, sources });
      const selectedProvider = String(process.env.AI_PROVIDER || 'disabled').toLowerCase();
      const providerConfigured =
        (selectedProvider === 'gemini' && Boolean(process.env.GEMINI_API_KEY)) ||
        selectedProvider === 'ollama';
      res.json({
        answer: reply.text,
        provider: reply.provider,
        grounded: reply.grounded !== false,
        configured: providerConfigured,
        found_sources: sources.length > 0,
        sources: sources.map((source) => ({
          source_id: source.sourceId,
          title: source.title,
          file_name: source.sourceLabel,
          page_reference: source.pageReference,
          score: source.score,
        })),
      });
    }),
  );

  router.post(
    '/knowledge',
    asyncHandler(async (req, res) => {
      const payload = {
        pipeline_id: req.body.pipeline_id || null,
        title: requiredText(req.body.title, 'title', 300),
        document_type: text(req.body.document_type, 50) || 'standard',
        source_label: text(req.body.source_label, 300),
        version: text(req.body.version, 100),
        page_reference: text(req.body.page_reference, 100),
        effective_from: req.body.effective_from || null,
        effective_to: req.body.effective_to || null,
        approval_status: text(req.body.approval_status, 30) || 'draft',
        content: requiredText(req.body.content, 'content', 200_000),
        metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        enabled: req.body.enabled !== false,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('knowledge_documents')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json({ data });
    }),
  );

  router.patch(
    '/knowledge-sources/approval',
    asyncHandler(async (req, res) => {
      const pipelineId = requiredText(req.body.pipeline_id, 'pipeline_id', 80);
      const approvalStatus = text(req.body.approval_status, 30) === 'approved' ? 'approved' : 'draft';
      const fileHash = text(req.body.file_hash, 128);
      const documentIds = Array.isArray(req.body.document_ids)
        ? req.body.document_ids.map((id) => text(id, 80)).filter(Boolean).slice(0, 250)
        : [];
      if (!fileHash && !documentIds.length) {
        return res.status(400).json({ message: 'Can file_hash hoac document_ids de cap nhat nguon.' });
      }

      let query = supabase
        .from('knowledge_documents')
        .update({ approval_status: approvalStatus, updated_at: new Date().toISOString() })
        .eq('pipeline_id', pipelineId);
      query = fileHash
        ? query.contains('metadata', { file_hash: fileHash })
        : query.in('id', documentIds);
      const { data, error } = await query.select('id, approval_status');
      if (error) throw error;
      res.json({ data: data || [], updated: data?.length || 0, approval_status: approvalStatus });
    }),
  );

  router.patch(
    '/knowledge/:id',
    asyncHandler(async (req, res) => {
      const allowed = [
        'title',
        'document_type',
        'source_label',
        'version',
        'page_reference',
        'effective_from',
        'effective_to',
        'approval_status',
        'content',
        'metadata',
        'enabled',
      ];
      const updates = Object.fromEntries(
        allowed.filter((key) => key in req.body).map((key) => [key, req.body[key]]),
      );
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('knowledge_documents')
        .update(updates)
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ data });
    }),
  );

  router.get(
    '/products',
    asyncHandler(async (req, res) => {
      const pipelineId = text(req.query.pipeline_id, 80);
      let query = supabase
        .from('product_catalog')
        .select('*')
        .order('product_code', { ascending: true })
        .limit(1000);
      query = pipelineFilter(query, pipelineId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data: data || [] });
    }),
  );

  router.post(
    '/products',
    asyncHandler(async (req, res) => {
      const payload = {
        pipeline_id: req.body.pipeline_id || null,
        product_code: requiredText(req.body.product_code, 'product_code', 100).toUpperCase(),
        name: requiredText(req.body.name, 'name', 300),
        category: text(req.body.category, 150),
        dimensions: text(req.body.dimensions, 100),
        color: text(req.body.color, 100),
        unit: text(req.body.unit, 30) || 'm2',
        specifications:
          req.body.specifications && typeof req.body.specifications === 'object'
            ? req.body.specifications
            : {},
        status: text(req.body.status, 30) || 'active',
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('product_catalog')
        .upsert(payload, { onConflict: 'pipeline_id,product_code' })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json({ data });
    }),
  );

  router.get(
    '/price-lists',
    asyncHandler(async (req, res) => {
      const pipelineId = text(req.query.pipeline_id, 80);
      let query = supabase
        .from('price_lists')
        .select('*')
        .order('effective_from', { ascending: false })
        .limit(200);
      query = pipelineFilter(query, pipelineId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data: data || [] });
    }),
  );

  router.post(
    '/price-lists',
    asyncHandler(async (req, res) => {
      const payload = {
        pipeline_id: req.body.pipeline_id || null,
        name: requiredText(req.body.name, 'name', 300),
        version: requiredText(req.body.version, 'version', 100),
        effective_from: req.body.effective_from || new Date().toISOString().slice(0, 10),
        effective_to: req.body.effective_to || null,
        approval_status: text(req.body.approval_status, 30) || 'draft',
        notes: text(req.body.notes, 2000),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('price_lists')
        .upsert(payload, { onConflict: 'pipeline_id,name,version' })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json({ data });
    }),
  );

  router.get(
    '/price-lists/:id/prices',
    asyncHandler(async (req, res) => {
      const { data, error } = await supabase
        .from('product_prices')
        .select('*, product:product_catalog(*)')
        .eq('price_list_id', req.params.id)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      res.json({ data: data || [] });
    }),
  );

  router.post(
    '/price-lists/:id/prices',
    asyncHandler(async (req, res) => {
      const rows = Array.isArray(req.body.prices) ? req.body.prices.slice(0, 2000) : [];
      if (!rows.length) return res.status(400).json({ message: 'prices phai la mang co du lieu.' });
      const payload = rows.map((row) => ({
        price_list_id: req.params.id,
        product_id: requiredText(row.product_id, 'product_id', 80),
        region: text(row.region, 100) || 'all',
        customer_group: text(row.customer_group, 100) || 'all',
        minimum_quantity: Number(row.minimum_quantity || 0),
        unit_price: Number(row.unit_price),
        currency: text(row.currency, 10) || 'VND',
        unit: text(row.unit, 30) || 'm2',
        notes: text(row.notes, 1000),
        updated_at: new Date().toISOString(),
      }));
      if (payload.some((row) => !Number.isFinite(row.unit_price) || row.unit_price < 0)) {
        return res.status(400).json({ message: 'unit_price khong hop le.' });
      }
      const { data, error } = await supabase
        .from('product_prices')
        .upsert(payload, {
          onConflict: 'price_list_id,product_id,region,customer_group,minimum_quantity',
        })
        .select('*');
      if (error) throw error;
      res.status(201).json({ data: data || [] });
    }),
  );

  router.post(
    '/import/knowledge',
    asyncHandler(async (req, res) => {
      const pipelineId = requiredText(req.body.pipeline_id, 'pipeline_id', 80);
      const documents = Array.isArray(req.body.documents) ? req.body.documents.slice(0, 250) : [];
      if (!documents.length) {
        return res.status(400).json({ message: 'documents phai la mang co du lieu.' });
      }
      const approvalStatus = text(req.body.approval_status, 30) === 'approved' ? 'approved' : 'draft';
      const { data: existing, error: existingError } = await supabase
        .from('knowledge_documents')
        .select('metadata')
        .eq('pipeline_id', pipelineId)
        .limit(5000);
      if (existingError) throw existingError;
      const existingKeys = new Set(
        (existing || []).map((item) => item.metadata?.import_key).filter(Boolean),
      );
      const now = new Date().toISOString();
      const payload = documents
        .map((document) => {
          const importKey = text(document.import_key, 500);
          return {
            pipeline_id: pipelineId,
            title: requiredText(document.title, 'title', 300),
            document_type: 'technical_standard',
            source_label: text(document.source_label || req.body.file_name, 300),
            version: text(document.version, 100),
            page_reference: text(document.page_reference, 100),
            effective_from: document.effective_from || req.body.effective_from || null,
            effective_to: document.effective_to || null,
            approval_status: approvalStatus,
            content: requiredText(document.content, 'content', 200_000),
            metadata: {
              ...(document.metadata && typeof document.metadata === 'object' ? document.metadata : {}),
              import_key: importKey,
              original_file: text(req.body.file_name, 300),
              imported_at: now,
              import_method: 'document_upload',
            },
            enabled: true,
            updated_at: now,
          };
        })
        .filter((document) => !document.metadata.import_key || !existingKeys.has(document.metadata.import_key));

      const imported = [];
      for (const group of chunks(payload, 100)) {
        const { data, error } = await supabase.from('knowledge_documents').insert(group).select('*');
        if (error) throw error;
        imported.push(...(data || []));
      }
      res.status(201).json({
        data: imported,
        imported: imported.length,
        skipped: documents.length - payload.length,
        approval_status: approvalStatus,
      });
    }),
  );

  router.post(
    '/import/prices',
    asyncHandler(async (req, res) => {
      const pipelineId = requiredText(req.body.pipeline_id, 'pipeline_id', 80);
      const products = Array.isArray(req.body.products) ? req.body.products.slice(0, 2000) : [];
      if (!products.length) {
        return res.status(400).json({ message: 'products phai la mang co du lieu.' });
      }
      const listInput = req.body.price_list || {};
      const priceListPayload = {
        pipeline_id: pipelineId,
        name: requiredText(listInput.name, 'price_list.name', 300),
        version: requiredText(listInput.version, 'price_list.version', 100),
        effective_from: listInput.effective_from || new Date().toISOString().slice(0, 10),
        effective_to: listInput.effective_to || null,
        approval_status: text(listInput.approval_status, 30) === 'approved' ? 'approved' : 'draft',
        notes: text(listInput.notes, 2000),
        updated_at: new Date().toISOString(),
      };
      const { data: priceList, error: priceListError } = await supabase
        .from('price_lists')
        .upsert(priceListPayload, { onConflict: 'pipeline_id,name,version' })
        .select('*')
        .single();
      if (priceListError) throw priceListError;

      const productPayload = products.map((product) => ({
        pipeline_id: pipelineId,
        product_code: requiredText(product.product_code, 'product_code', 100).toUpperCase(),
        name: requiredText(product.name, 'name', 300),
        category: text(product.category, 150),
        dimensions: text(product.dimensions, 100),
        color: text(product.color, 100),
        unit: text(product.unit, 30) || 'm2',
        specifications: {
          ...(product.specifications && typeof product.specifications === 'object'
            ? product.specifications
            : {}),
          imported_from: {
            file_name: text(req.body.file_name, 300),
            sheet_name: text(product.sheet_name, 150),
            row_number: Number(product.row_number) || null,
          },
        },
        status: 'active',
        updated_at: new Date().toISOString(),
      }));
      // Một mã sản phẩm có thể xuất hiện nhiều lần trong Excel khi có nhiều
      // vùng/nhóm khách hàng. Chỉ upsert danh mục một lần cho mỗi mã để tránh
      // PostgreSQL báo "ON CONFLICT ... cannot affect row a second time".
      const uniqueProductPayload = [
        ...new Map(productPayload.map((product) => [product.product_code, product])).values(),
      ];
      const storedProducts = [];
      for (const group of chunks(uniqueProductPayload, 250)) {
        const { data, error } = await supabase
          .from('product_catalog')
          .upsert(group, { onConflict: 'pipeline_id,product_code' })
          .select('*');
        if (error) throw error;
        storedProducts.push(...(data || []));
      }
      const productByCode = new Map(storedProducts.map((product) => [product.product_code, product]));
      const pricePayload = products.map((product) => {
        const unitPrice = Number(product.unit_price);
        const minimumQuantity = Number(product.minimum_quantity || 0);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          const error = new Error(`Don gia cua ma ${product.product_code || '?'} khong hop le.`);
          error.status = 400;
          throw error;
        }
        return {
          price_list_id: priceList.id,
          product_id: productByCode.get(String(product.product_code).toUpperCase())?.id,
          region: text(product.region, 100) || 'all',
          customer_group: text(product.customer_group, 100) || 'all',
          minimum_quantity: Number.isFinite(minimumQuantity) && minimumQuantity >= 0 ? minimumQuantity : 0,
          unit_price: unitPrice,
          currency: text(product.currency, 10) || 'VND',
          unit: text(product.unit, 30) || 'm2',
          notes: text(product.notes || listInput.notes, 1000),
          updated_at: new Date().toISOString(),
        };
      });
      if (pricePayload.some((row) => !row.product_id)) {
        const error = new Error('Khong the lien ket mot so dong gia voi san pham.');
        error.status = 400;
        throw error;
      }
      const storedPrices = [];
      for (const group of chunks(pricePayload, 500)) {
        const { data, error } = await supabase
          .from('product_prices')
          .upsert(group, {
            onConflict: 'price_list_id,product_id,region,customer_group,minimum_quantity',
          })
          .select('*');
        if (error) throw error;
        storedPrices.push(...(data || []));
      }
      res.status(201).json({
        data: { price_list: priceList },
        imported_products: storedProducts.length,
        imported_prices: storedPrices.length,
        approval_status: priceList.approval_status,
      });
    }),
  );

  return router;
}
