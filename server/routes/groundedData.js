import express from 'express';

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
        .limit(500);
      query = pipelineFilter(query, pipelineId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data: data || [] });
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

  return router;
}
