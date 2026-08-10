import crypto from 'node:crypto';
import { promisify } from 'node:util';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createAdminAuthMiddleware } from './middleware/adminAuth.js';
import { createMetaWebhookRouter } from './routes/metaWebhook.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
const scryptAsync = promisify(crypto.scrypt);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY. Hay tao file server/.env.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      // Meta ky tren payload goc, vi vay can giu lai bytes truoc khi parse JSON.
      req.rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function makeBaseSlug(value) {
  const slug = String(value || 'pipeline')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return slug || 'pipeline';
}

function createWebhookSlug(name) {
  return `${makeBaseSlug(name)}-${crypto.randomBytes(4).toString('hex')}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizePhone(input) {
  if (input === undefined || input === null) return null;

  let phone = String(input).trim();
  if (!phone) return null;

  phone = phone.replace(/[^\d+]/g, '');
  phone = phone.replace(/(?!^)\+/g, '');

  if (phone.startsWith('0084')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('+84')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('84') && phone.length >= 11) phone = `0${phone.slice(2)}`;
  else if (!phone.startsWith('+')) phone = phone.replace(/^0+/, '0');

  return phone || null;
}

const SHARE_COLUMNS = ['received_at', 'phone', 'note', 'company_name', 'full_name', 'email'];
const EXPORT_COLUMNS = ['pipeline_name', ...SHARE_COLUMNS];
const FORM_FIELD_DEFINITIONS = {
  full_name: { key: 'full_name', label: 'Họ và tên', type: 'text', required: true },
  phone: { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
  email: { key: 'email', label: 'Email', type: 'email', required: false },
  note: { key: 'note', label: 'Nội dung tư vấn', type: 'textarea', required: false },
  company_name: { key: 'company_name', label: 'Tên doanh nghiệp', type: 'text', required: false },
};
const DEFAULT_FORM_FIELDS = Object.values(FORM_FIELD_DEFINITIONS);

function sanitizeColumns(value, fallback = SHARE_COLUMNS) {
  const input = Array.isArray(value) ? value : fallback;
  const unique = [...new Set(input.filter((column) => SHARE_COLUMNS.includes(column)))];
  return unique.length ? unique : [...fallback];
}

function sanitizeFormFields(value) {
  if (!Array.isArray(value)) return DEFAULT_FORM_FIELDS;
  const fields = value
    .filter((field) => field && FORM_FIELD_DEFINITIONS[field.key])
    .map((field) => ({
      ...FORM_FIELD_DEFINITIONS[field.key],
      label: String(field.label || FORM_FIELD_DEFINITIONS[field.key].label).trim().slice(0, 80),
      required: Boolean(field.required),
    }));
  return fields.length ? fields : DEFAULT_FORM_FIELDS;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, storedKey] = String(storedHash || '').split(':');
  if (!salt || !storedKey) return false;
  const derivedKey = Buffer.from(await scryptAsync(password, salt, 64));
  const expectedKey = Buffer.from(storedKey, 'hex');
  return expectedKey.length === derivedKey.length && crypto.timingSafeEqual(expectedKey, derivedKey);
}

function signShareAccess(token, expiresAt = Date.now() + 24 * 60 * 60 * 1000) {
  const payload = `${token}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', SHARE_TOKEN_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function verifyShareAccess(accessToken, expectedToken) {
  try {
    const [encodedPayload, signature] = String(accessToken || '').split('.');
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const [token, expiresAt] = payload.split('.');
    const expectedSignature = crypto
      .createHmac('sha256', SHARE_TOKEN_SECRET)
      .update(payload)
      .digest('hex');
    return (
      token === expectedToken &&
      Number(expiresAt) > Date.now() &&
      signature === expectedSignature
    );
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function parseDateFilter(value) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function csvFilename(scope) {
  const date = new Date().toISOString().slice(0, 10);
  return `tpai-crm-${scope || 'all-pipelines'}-${date}.csv`;
}

function firstPayloadValue(payload, aliases) {
  const entry = Object.entries(payload).find(
    ([key, value]) =>
      aliases.includes(key.toLowerCase()) &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== '',
  );

  if (!entry) return { key: null, value: null };
  return { key: entry[0], value: String(entry[1]).trim() };
}

function extractLead(payload) {
  const fields = {
    full_name: firstPayloadValue(payload, [
      'full_name',
      'fullname',
      'name',
      'ho_ten',
      'hoten',
      'customer_name',
    ]),
    phone: firstPayloadValue(payload, [
      'phone',
      'phone_number',
      'mobile',
      'tel',
      'so_dien_thoai',
      'sodienthoai',
    ]),
    email: firstPayloadValue(payload, ['email', 'email_address', 'mail']),
    note: firstPayloadValue(payload, [
      'note',
      'message',
      'content',
      'noi_dung',
      'nhu_cau',
    ]),
    company_name: firstPayloadValue(payload, [
      'company_name',
      'company',
      'business_name',
      'ten_cong_ty',
    ]),
  };

  const consumedKeys = new Set(
    Object.values(fields)
      .map((field) => field.key)
      .filter(Boolean),
  );

  const rawMetadata = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !consumedKeys.has(key)),
  );

  return {
    full_name: fields.full_name.value,
    phone: normalizePhone(fields.phone.value),
    email: fields.email.value?.toLowerCase() || null,
    note: fields.note.value,
    company_name: fields.company_name.value,
    raw_metadata: rawMetadata,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mini-saas-crm-api' });
});

// Khi ADMIN_API_TOKEN duoc dat, chi cac endpoint public can thiet moi bo qua xac thuc.
// Neu chua dat, hanh vi cu duoc giu nguyen de deploy code khong lam gian doan CRM.
app.use('/api/v1', createAdminAuthMiddleware());

app.get(
  '/api/v1/pipelines',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('pipelines')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  }),
);

app.post(
  '/api/v1/pipelines',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const redirectUrl = String(req.body.redirect_url || '').trim() || null;

    if (!name) {
      return res.status(400).json({ message: 'Ten pipeline la bat buoc.' });
    }

    if (redirectUrl) {
      try {
        const parsedUrl = new URL(redirectUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
      } catch {
        return res.status(400).json({
          message: 'redirect_url phai la URL http/https hop le.',
        });
      }
    }

    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const webhookSlug = createWebhookSlug(name);
      const { data, error } = await supabase
        .from('pipelines')
        .insert({
          name,
          description,
          redirect_url: redirectUrl,
          webhook_slug: webhookSlug,
        })
        .select('*')
        .single();

      if (!error) return res.status(201).json({ data });
      lastError = error;
      if (error.code !== '23505') throw error;
    }

    throw lastError;
  }),
);

app.patch(
  '/api/v1/pipelines/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }

    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const redirectUrl = String(req.body.redirect_url || '').trim() || null;
    if (!name) return res.status(400).json({ message: 'Ten pipeline la bat buoc.' });

    if (redirectUrl) {
      try {
        const parsedUrl = new URL(redirectUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
      } catch {
        return res.status(400).json({ message: 'redirect_url phai la URL http/https hop le.' });
      }
    }

    const { data, error } = await supabase
      .from('pipelines')
      .update({ name, description, redirect_url: redirectUrl })
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Khong tim thay pipeline.' });
    res.json({ data });
  }),
);

app.delete(
  '/api/v1/pipelines/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }
    const { error } = await supabase.from('pipelines').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  }),
);

app.get(
  '/api/v1/pipelines/:id/form',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    const { data, error } = await supabase
      .from('pipeline_forms')
      .select('id, pipeline_id, fields, title, submit_label, success_message, updated_at')
      .eq('pipeline_id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    res.json({
      data: data || {
        pipeline_id: req.params.id,
        fields: DEFAULT_FORM_FIELDS,
        title: 'Đăng ký tư vấn',
        submit_label: 'Gửi thông tin',
        success_message: 'Cảm ơn anh/chị! Thông tin đã được gửi thành công.',
      },
    });
  }),
);

app.post(
  '/api/v1/pipelines/:id/form',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (pipelineError) throw pipelineError;
    if (!pipeline) return res.status(404).json({ message: 'Khong tim thay pipeline.' });

    const values = {
      pipeline_id: req.params.id,
      fields: sanitizeFormFields(req.body.fields),
      title: String(req.body.title || 'Đăng ký tư vấn').trim().slice(0, 120) || 'Đăng ký tư vấn',
      submit_label: String(req.body.submit_label || 'Gửi thông tin').trim().slice(0, 60) || 'Gửi thông tin',
      success_message: String(req.body.success_message || 'Cảm ơn anh/chị! Thông tin đã được gửi thành công.').trim().slice(0, 240),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('pipeline_forms')
      .upsert(values, { onConflict: 'pipeline_id' })
      .select('id, pipeline_id, fields, title, submit_label, success_message, updated_at')
      .single();
    if (error) throw error;
    res.json({ data });
  }),
);

app.get(
  '/api/v1/embed/:slug/config',
  asyncHandler(async (req, res) => {
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, name, webhook_slug, redirect_url')
      .eq('webhook_slug', req.params.slug)
      .maybeSingle();
    if (pipelineError) throw pipelineError;
    if (!pipeline) return res.status(404).json({ message: 'Form khong ton tai.' });

    const { data: form, error: formError } = await supabase
      .from('pipeline_forms')
      .select('fields, title, submit_label, success_message')
      .eq('pipeline_id', pipeline.id)
      .maybeSingle();
    if (formError) throw formError;
    res.json({
      data: {
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        webhook_slug: pipeline.webhook_slug,
        redirect_url: pipeline.redirect_url,
        fields: sanitizeFormFields(form?.fields),
        title: form?.title || 'Đăng ký tư vấn',
        submit_label: form?.submit_label || 'Gửi thông tin',
        success_message: form?.success_message || 'Cảm ơn anh/chị! Thông tin đã được gửi thành công.',
      },
    });
  }),
);

app.post(
  '/api/v1/pipelines/:id/share',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }

    const password = String(req.body.password || '');
    if (password.length < 4) {
      return res.status(400).json({ message: 'Mat khau chia se phai co it nhat 4 ky tu.' });
    }

    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (pipelineError) throw pipelineError;
    if (!pipeline) return res.status(404).json({ message: 'Khong tim thay pipeline.' });

    const visibleColumns = sanitizeColumns(req.body.visible_columns);
    const columnOrder = sanitizeColumns(req.body.column_order, SHARE_COLUMNS).filter((column) =>
      visibleColumns.includes(column),
    );
    const { data: currentShare, error: currentError } = await supabase
      .from('pipeline_shares')
      .select('id, token')
      .eq('pipeline_id', req.params.id)
      .maybeSingle();
    if (currentError) throw currentError;

    const values = {
      pipeline_id: req.params.id,
      token: currentShare?.token || crypto.randomUUID(),
      password_hash: await hashPassword(password),
      enabled: req.body.enabled !== false,
      visible_columns: visibleColumns,
      column_order: columnOrder.length ? columnOrder : visibleColumns,
      updated_at: new Date().toISOString(),
    };

    const query = currentShare
      ? supabase.from('pipeline_shares').update(values).eq('id', currentShare.id)
      : supabase.from('pipeline_shares').insert(values);
    const { data, error } = await query
      .select('id, pipeline_id, token, enabled, visible_columns, column_order, updated_at')
      .single();
    if (error) throw error;

    res.json({
      data: {
        ...data,
        pipeline_name: pipeline.name,
        share_url: `${CLIENT_URL.replace(/\/$/, '')}/#/share/${data.token}`,
      },
    });
  }),
);

app.get(
  '/api/v1/pipelines/:id/share',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }
    const { data: existing, error: existingError } = await supabase
      .from('pipeline_shares')
      .select('id, pipeline_id, token, enabled, visible_columns, column_order, updated_at')
      .eq('pipeline_id', req.params.id)
      .maybeSingle();
    if (existingError) throw existingError;

    let data = existing;
    if (!data) {
      const { data: created, error: createError } = await supabase
        .from('pipeline_shares')
        .insert({
          pipeline_id: req.params.id,
          token: crypto.randomUUID(),
          password_hash: '',
          enabled: false,
          visible_columns: SHARE_COLUMNS,
          column_order: SHARE_COLUMNS,
        })
        .select('id, pipeline_id, token, enabled, visible_columns, column_order, updated_at')
        .single();
      if (createError) throw createError;
      data = created;
    }

    res.json({ data: { ...data, share_url: `${CLIENT_URL.replace(/\/$/, '')}/#/share/${data.token}` } });
  }),
);

app.get(
  '/api/v1/pipelines/:id/leads',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }

    const search = String(req.query.search || '').trim();
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
      100,
    );
    const from = (page - 1) * limit;

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('pipeline_id', req.params.id)
      .order('received_at', { ascending: false })
      .range(from, from + limit - 1);

    if (search) {
      // Ky tu ngoac/phay la cu phap cua PostgREST, loai bo de tranh pha filter.
      const safeSearch = search.replace(/[(),]/g, ' ').slice(0, 100);
      query = query.or(
        `full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: { page, limit, total: count || 0 },
    });
  }),
);

app.get(
  '/api/v1/export/leads.csv',
  asyncHandler(async (req, res) => {
    const pipelineId = String(req.query.pipeline_id || '').trim();
    if (pipelineId && pipelineId !== 'all' && !isUuid(pipelineId)) {
      return res.status(400).json({ message: 'Pipeline ID khong hop le.' });
    }

    const search = String(req.query.search || '').trim().slice(0, 120);
    const from = parseDateFilter(req.query.from);
    const rawTo = String(req.query.to || '');
    const to = /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
      ? new Date(`${rawTo}T23:59:59.999Z`).toISOString()
      : parseDateFilter(rawTo);
    const requestedColumns = String(req.query.columns || '')
      .split(',')
      .map((column) => column.trim())
      .filter((column) => EXPORT_COLUMNS.includes(column));
    const columns = requestedColumns.length ? [...new Set(requestedColumns)] : [...EXPORT_COLUMNS];

    let query = supabase
      .from('leads')
      .select('id, pipeline_id, full_name, phone, email, note, company_name, received_at, pipelines(name)')
      .order('received_at', { ascending: false })
      .limit(10000);

    if (pipelineId && pipelineId !== 'all') query = query.eq('pipeline_id', pipelineId);
    if (search) {
      const safeSearch = search.replace(/[(),]/g, ' ');
      query = query.or(
        `full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,company_name.ilike.%${safeSearch}%,note.ilike.%${safeSearch}%`,
      );
    }
    if (from) query = query.gte('received_at', from);
    if (to) query = query.lte('received_at', to);

    const { data, error } = await query;
    if (error) throw error;

    const labels = {
      pipeline_name: 'Pipeline',
      received_at: 'Received At',
      phone: 'Số điện thoại',
      note: 'Nội dung tư vấn',
      company_name: 'Tên doanh nghiệp',
      full_name: 'Họ tên',
      email: 'Email',
    };
    const lines = [
      columns.map((column) => csvCell(labels[column] || column)).join(','),
      ...(data || []).map((lead) => {
        const row = { ...lead, pipeline_name: lead.pipelines?.name || '' };
        return columns.map((column) => csvCell(row[column])).join(',');
      }),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(csvFilename(pipelineId === 'all' ? 'all-pipelines' : pipelineId))}`);
    res.send(`\uFEFF${lines.join('\r\n')}`);
  }),
);

app.post(
  '/api/v1/share/:token/access',
  asyncHandler(async (req, res) => {
    const { data: share, error } = await supabase
      .from('pipeline_shares')
      .select('token, pipeline_id, enabled, password_hash, visible_columns, column_order, pipelines(name)')
      .eq('token', req.params.token)
      .maybeSingle();
    if (error) throw error;
    if (!share || !share.enabled) return res.status(404).json({ message: 'Lien chia se khong ton tai.' });

    const valid = await verifyPassword(String(req.body.password || ''), share.password_hash);
    if (!valid) return res.status(401).json({ message: 'Mat khau chia se khong dung.' });

    res.json({
      data: {
        access_token: signShareAccess(share.token),
        pipeline_id: share.pipeline_id,
        pipeline_name: share.pipelines?.name || 'Lead share',
        visible_columns: sanitizeColumns(share.visible_columns),
        column_order: sanitizeColumns(share.column_order),
      },
    });
  }),
);

app.get(
  '/api/v1/share/:token/leads',
  asyncHandler(async (req, res) => {
    if (!verifyShareAccess(getBearerToken(req), req.params.token)) {
      return res.status(401).json({ message: 'Phien chia se da het han hoac khong hop le.' });
    }

    const { data: share, error: shareError } = await supabase
      .from('pipeline_shares')
      .select('pipeline_id, enabled, visible_columns, column_order')
      .eq('token', req.params.token)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share || !share.enabled) return res.status(404).json({ message: 'Lien chia se khong ton tai.' });

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('pipeline_id', share.pipeline_id)
      .order('received_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const visibleColumns = sanitizeColumns(share.visible_columns);
    const columnOrder = sanitizeColumns(share.column_order).filter((column) =>
      visibleColumns.includes(column),
    );
    const safeData = (data || []).map((lead) =>
      Object.fromEntries(columnOrder.map((column) => [column, lead[column] ?? null])),
    );
    res.json({ data: safeData, columns: columnOrder });
  }),
);

app.post(
  '/api/v1/webhook/:slug',
  asyncHandler(async (req, res) => {
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, redirect_url')
      .eq('webhook_slug', req.params.slug)
      .maybeSingle();

    if (pipelineError) throw pipelineError;
    if (!pipeline) {
      return res.status(404).json({
        status: 'error',
        message: 'Webhook khong ton tai.',
      });
    }

    const payload =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};
    const lead = extractLead(payload);

    if (!lead.phone && !lead.email) {
      return res.status(400).json({
        status: 'error',
        message: 'Payload can co it nhat phone hoac email.',
      });
    }

    const { data, error } = await supabase
      .from('leads')
      .insert({ pipeline_id: pipeline.id, ...lead })
      .select('id, received_at')
      .single();

    if (error) throw error;

    return res.status(201).json({
      status: 'success',
      lead_id: data.id,
      received_at: data.received_at,
      redirect_url: pipeline.redirect_url || null,
    });
  }),
);

// Route Messenger tach biet hoan toan voi webhook CRM hien tai.
app.use('/api/v1/meta', createMetaWebhookRouter({ supabase }));

app.use((_req, res) => {
  res.status(404).json({ message: 'API endpoint khong ton tai.' });
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'JSON payload khong hop le.' });
  }

  return res.status(500).json({
    message: 'Da co loi may chu. Vui long thu lai.',
    ...(process.env.NODE_ENV === 'development' && { detail: error.message }),
  });
});

app.listen(PORT, () => {
  console.log(`CRM API dang chay tai http://localhost:${PORT}`);
});
