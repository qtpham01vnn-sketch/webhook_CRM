const API_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const ADMIN_TOKEN_KEY = 'tpai_crm_admin_token';

function getAdminToken() {
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function requestAdminToken() {
  const token = window.prompt('Nhập mã quản trị CRM:');
  if (!token) return false;
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
  return true;
}

function withAdminHeader(headers = {}) {
  const token = getAdminToken();
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...headers,
  };
}

async function downloadRequest(path, canPrompt = true) {
  const response = await fetch(`${API_URL}${path}`, { headers: withAdminHeader() });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (
      response.status === 401 &&
      payload.code === 'ADMIN_AUTH_REQUIRED' &&
      canPrompt &&
      requestAdminToken()
    ) {
      return downloadRequest(path, false);
    }
    throw new Error(payload.message || 'Khong the xuat file CSV.');
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get('Content-Disposition')?.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1] || 'tpai-leads.csv',
  };
}

async function request(path, options = {}, canPrompt = true) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...withAdminHeader(options.headers),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      payload.code === 'ADMIN_AUTH_REQUIRED' &&
      canPrompt &&
      requestAdminToken()
    ) {
      return request(path, options, false);
    }
    throw new Error(payload.message || 'Khong the ket noi den may chu.');
  }

  return payload;
}

export const crmApi = {
  getPipelines: () => request('/pipelines'),
  createPipeline: (input) =>
    request('/pipelines', { method: 'POST', body: JSON.stringify(input) }),
  updatePipeline: (pipelineId, input) =>
    request(`/pipelines/${pipelineId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePipeline: (pipelineId) => request(`/pipelines/${pipelineId}`, { method: 'DELETE' }),
  saveShare: (pipelineId, input) =>
    request(`/pipelines/${pipelineId}/share`, { method: 'POST', body: JSON.stringify(input) }),
  getShare: (pipelineId) => request(`/pipelines/${pipelineId}/share`),
  getForm: (pipelineId) => request(`/pipelines/${pipelineId}/form`),
  saveForm: (pipelineId, input) =>
    request(`/pipelines/${pipelineId}/form`, { method: 'POST', body: JSON.stringify(input) }),
  accessShare: (token, password) =>
    request(`/share/${token}/access`, { method: 'POST', body: JSON.stringify({ password }) }),
  getSharedLeads: (token, accessToken) =>
    request(`/share/${token}/leads`, { headers: { Authorization: `Bearer ${accessToken}` } }),
  getLeads: (pipelineId, search = '') => {
    const params = new URLSearchParams({ limit: '100' });
    if (search) params.set('search', search);
    return request(`/pipelines/${pipelineId}/leads?${params}`);
  },
  exportLeads: (filters) => {
    const params = new URLSearchParams();
    params.set('pipeline_id', filters.pipelineId || 'all');
    if (filters.search) params.set('search', filters.search);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.columns?.length) params.set('columns', filters.columns.join(','));
    return downloadRequest(`/export/leads.csv?${params}`);
  },
  getGroundedSummary: (pipelineId) =>
    request(`/grounded/summary?${new URLSearchParams({ pipeline_id: pipelineId })}`),
  getKnowledgeDocuments: (pipelineId) =>
    request(`/grounded/knowledge?${new URLSearchParams({ pipeline_id: pipelineId })}`),
  createKnowledgeDocument: (input) =>
    request('/grounded/knowledge', { method: 'POST', body: JSON.stringify(input) }),
  updateKnowledgeDocument: (documentId, input) =>
    request(`/grounded/knowledge/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  updateKnowledgeSourceApproval: (input) =>
    request('/grounded/knowledge-sources/approval', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  getProducts: (pipelineId) =>
    request(`/grounded/products?${new URLSearchParams({ pipeline_id: pipelineId })}`),
  createProduct: (input) =>
    request('/grounded/products', { method: 'POST', body: JSON.stringify(input) }),
  getPriceLists: (pipelineId) =>
    request(`/grounded/price-lists?${new URLSearchParams({ pipeline_id: pipelineId })}`),
  createPriceList: (input) =>
    request('/grounded/price-lists', { method: 'POST', body: JSON.stringify(input) }),
  addPriceRows: (priceListId, prices) =>
    request(`/grounded/price-lists/${priceListId}/prices`, {
      method: 'POST',
      body: JSON.stringify({ prices }),
    }),
  importKnowledgeDocuments: (input) =>
    request('/grounded/import/knowledge', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  importPriceWorkbook: (input) =>
    request('/grounded/import/prices', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
