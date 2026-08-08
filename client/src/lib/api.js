const API_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

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
  getLeads: (pipelineId, search = '') => {
    const params = new URLSearchParams({ limit: '100' });
    if (search) params.set('search', search);
    return request(`/pipelines/${pipelineId}/leads?${params}`);
  },
};

