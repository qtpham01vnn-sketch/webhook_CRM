import { useState } from 'react';
import { Eye, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { crmApi } from '../lib/api.js';

const labels = {
  received_at: 'Received At',
  phone: 'Số điện thoại',
  note: 'Nội dung tư vấn',
  company_name: 'Tên doanh nghiệp',
  full_name: 'Họ tên',
  email: 'Email',
};

function formatCell(column, value) {
  if (!value) return '—';
  if (column === 'received_at') {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(value));
  }
  return String(value);
}

export default function SharedView({ token }) {
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState(null);
  const [leads, setLeads] = useState([]);
  const [columns, setColumns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function unlock(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await crmApi.accessShare(token, password);
      const share = response.data;
      const leadResponse = await crmApi.getSharedLeads(token, share.access_token);
      setAccess(share);
      setColumns(leadResponse.columns || share.column_order || []);
      setLeads(leadResponse.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!access) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-panel sm:p-9">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-500 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
            <LockKeyhole size={28} />
          </div>
          <div className="text-center">
            <p className="text-gradient-brand text-sm font-bold uppercase tracking-[0.18em]">TPAI CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-ink">Lead được chia sẻ</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Nhập mật khẩu để xem dữ liệu được cấp quyền.</p>
          </div>
          <form className="mt-7 space-y-4" onSubmit={unlock}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu</span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  autoFocus
                  className="w-full rounded-xl border bg-white py-3 pl-10 pr-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nhập mật khẩu chia sẻ"
                  required
                  type="password"
                  value={password}
                />
              </div>
            </label>
            {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={busy} type="submit">
              {busy && <LoaderCircle className="animate-spin" size={17} />}
              Mở dữ liệu
            </button>
          </form>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} /> Link được bảo vệ bằng mật khẩu</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-gradient-brand text-sm font-bold uppercase tracking-[0.18em]">TPAI CRM • Shared view</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{access.pipeline_name}</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600"><Eye size={14} /> Chỉ xem</span>
        </header>
        <div className="overflow-hidden rounded-2xl border bg-white shadow-panel">
          <div className="scrollbar-subtle overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left">
              <thead>
                <tr className="border-b bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {columns.map((column) => <th className="whitespace-nowrap px-5 py-4" key={column}>{labels[column] || column}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead, index) => (
                  <tr className="transition hover:bg-slate-50/70" key={lead.id || index}>
                    {columns.map((column) => <td className="max-w-sm px-5 py-4 text-sm text-slate-700" key={column}>{formatCell(column, lead[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!leads.length && <p className="px-5 py-12 text-center text-sm text-muted">Chưa có lead trong pipeline này.</p>}
          <div className="border-t bg-slate-50/50 px-5 py-3 text-xs text-muted">{leads.length} lead được chia sẻ</div>
        </div>
      </div>
    </main>
  );
}
