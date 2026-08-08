import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const WEBHOOK_BASE_URL = (import.meta.env.VITE_WEBHOOK_BASE_URL || window.location.origin).replace(/\/$/, '');

export default function EmbedView({ slug }) {
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/embed/${encodeURIComponent(slug)}/config`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Không thể tải form.');
        return payload.data;
      })
      .then((data) => {
        setConfig(data);
        setValues(Object.fromEntries((data.fields || []).map((field) => [field.key, ''])));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const formStyle = useMemo(() => ({
    '--tpai-brand': '#0891b2',
    '--tpai-ink': '#102a43',
  }), []);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${WEBHOOK_BASE_URL}/api/v1/webhook/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, source: 'tpai-embedded-form' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Không thể gửi thông tin.');
      if (payload.redirect_url) {
        window.location.assign(payload.redirect_url);
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ ...formStyle, padding: 24, color: 'var(--tpai-ink)', fontFamily: 'Inter, Arial, sans-serif' }}>Đang tải form...</div>;
  if (error && !config) return <div style={{ ...formStyle, padding: 24, color: '#b42318', fontFamily: 'Inter, Arial, sans-serif' }}>{error}</div>;
  if (success) {
    return (
      <div style={{ ...formStyle, maxWidth: 520, margin: '0 auto', padding: 32, border: '1px solid #d9e5ec', borderRadius: 16, background: '#fff', color: 'var(--tpai-ink)', fontFamily: 'Inter, Arial, sans-serif', textAlign: 'center' }}>
        <CheckCircle2 color="#12a875" size={42} style={{ margin: '0 auto 12px' }} />
        <h2 style={{ margin: 0, fontSize: 20 }}>{config.success_message}</h2>
      </div>
    );
  }

  return (
    <div style={{ ...formStyle, maxWidth: 520, margin: '0 auto', padding: 24, border: '1px solid #d9e5ec', borderRadius: 16, background: '#fff', color: 'var(--tpai-ink)', fontFamily: 'Inter, Arial, sans-serif', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 18px', fontSize: 22, lineHeight: 1.25 }}>{config.title}</h2>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gap: 14 }}>
          {config.fields.map((field) => (
            <label key={field.key} style={{ display: 'grid', gap: 7, fontSize: 14, fontWeight: 600 }}>
              <span>{field.label}{field.required ? <em style={{ color: '#d92d20', fontStyle: 'normal' }}> *</em> : null}</span>
              {field.type === 'textarea' ? (
                <textarea rows="4" required={field.required} value={values[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} style={{ width: '100%', resize: 'vertical', padding: '11px 12px', border: '1px solid #cbd8e0', borderRadius: 9, font: 'inherit', boxSizing: 'border-box' }} />
              ) : (
                <input type={field.type} required={field.required} value={values[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} style={{ width: '100%', padding: '11px 12px', border: '1px solid #cbd8e0', borderRadius: 9, font: 'inherit', boxSizing: 'border-box' }} />
              )}
            </label>
          ))}
        </div>
        {error && <p style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 9, background: '#fff1f0', color: '#b42318', fontSize: 13 }}>{error}</p>}
        <button disabled={submitting} style={{ width: '100%', marginTop: 18, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8, border: 0, borderRadius: 9, padding: '12px 16px', background: 'var(--tpai-brand)', color: '#fff', font: '600 15px Inter, Arial, sans-serif', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }} type="submit">
          {submitting ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={17} />} {config.submit_label}
        </button>
      </form>
    </div>
  );
}
