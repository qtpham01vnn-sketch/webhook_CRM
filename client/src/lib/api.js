const API_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

async function downloadRequest(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Khong the xuat file CSV.');
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get('Content-Disposition')?.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1] || 'tpai-leads.csv',
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
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
};
