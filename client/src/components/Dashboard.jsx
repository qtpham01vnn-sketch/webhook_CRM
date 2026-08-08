import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  Clipboard,
  Inbox,
  Link2,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Webhook,
  X,
} from 'lucide-react';
import { crmApi } from '../lib/api.js';
import Modal from './Modal.jsx';

const badgeColors = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function initials(name) {
  return String(name || 'P')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function PipelineForm({ busy, error, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    redirect_url: '',
  });

  const update = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          Tên Pipeline <span className="text-rose-500">*</span>
        </span>
        <input
          autoFocus
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          name="name"
          onChange={update}
          placeholder="VD: Tư vấn Landing Page"
          required
          value={form.name}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Mô tả</span>
        <textarea
          className="min-h-24 w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          name="description"
          onChange={update}
          placeholder="Nguồn và mục đích thu thập lead"
          value={form.description}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          URL chuyển hướng sau khi gửi form
        </span>
        <input
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          name="redirect_url"
          onChange={update}
          placeholder="https://website.vn/cam-on"
          type="url"
          value={form.redirect_url}
        />
      </label>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <button
          className="rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={onCancel}
          type="button"
        >
          Hủy
        </button>
        <button
          className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy && <LoaderCircle className="animate-spin" size={17} />}
          Tạo Pipeline
        </button>
      </div>
    </form>
  );
}

function EmptyLeads({ searching }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600">
        {searching ? <Search size={28} /> : <Inbox size={28} />}
      </div>
      <h3 className="font-semibold text-slate-800">
        {searching ? 'Không tìm thấy lead phù hợp' : 'Chưa có lead nào'}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
        {searching
          ? 'Thử tìm bằng tên hoặc một phần số điện thoại khác.'
          : 'Sao chép Webhook URL và kết nối với form trên Landing Page hoặc Website.'}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [pipelines, setPipelines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [pageError, setPageError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedId) || null,
    [pipelines, selectedId],
  );

  const webhookUrl = selectedPipeline
    ? `${(import.meta.env.VITE_WEBHOOK_BASE_URL || window.location.origin).replace(/\/$/, '')}/api/v1/webhook/${selectedPipeline.webhook_slug}`
    : '';

  const loadPipelines = useCallback(async () => {
    setLoadingPipelines(true);
    setPageError('');
    try {
      const response = await crmApi.getPipelines();
      setPipelines(response.data);
      setSelectedId((current) => current || response.data[0]?.id || null);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setLoadingPipelines(false);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selectedId) {
      setLeads([]);
      return undefined;
    }

    let active = true;
    setLoadingLeads(true);
    setPageError('');
    crmApi
      .getLeads(selectedId, debouncedSearch)
      .then((response) => active && setLeads(response.data))
      .catch((error) => active && setPageError(error.message))
      .finally(() => active && setLoadingLeads(false));

    return () => {
      active = false;
    };
  }, [selectedId, debouncedSearch]);

  async function createPipeline(form) {
    setCreating(true);
    setCreateError('');
    try {
      const response = await crmApi.createPipeline(form);
      setPipelines((current) => [response.data, ...current]);
      setSelectedId(response.data.id);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function selectPipeline(id) {
    setSelectedId(id);
    setSearch('');
    setSidebarOpen(false);
  }

  const sidebar = (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-white">
      <div className="flex h-[76px] items-center gap-3 border-b px-6">
        <img
          alt="TPAI"
          className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-[0_0_0_2px_rgba(103,232,249,0.65),0_0_18px_rgba(34,211,238,0.35)]"
          src="/tpai-avatar.jpg"
        />
        <div>
          <p className="text-gradient-brand text-base font-bold tracking-tight">TPAI</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-brand-600">
            CRM WORKSPACE
          </p>
        </div>
        <button
          aria-label="Dong menu"
          className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        >
          <X size={19} />
        </button>
      </div>

      <div className="flex items-center justify-between px-5 pb-3 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
          Pipelines
        </p>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {pipelines.length}
        </span>
      </div>

      <nav className="scrollbar-subtle flex-1 space-y-1 overflow-y-auto px-3">
        {loadingPipelines && (
          <div className="flex items-center gap-3 px-3 py-3 text-sm text-slate-400">
            <LoaderCircle className="animate-spin" size={17} /> Đang tải pipelines...
          </div>
        )}
        {!loadingPipelines && pipelines.length === 0 && (
          <p className="px-3 py-4 text-sm leading-6 text-muted">
            Chưa có pipeline. Hãy tạo pipeline đầu tiên.
          </p>
        )}
        {pipelines.map((pipeline, index) => {
          const active = pipeline.id === selectedId;
          return (
            <button
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                active
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
              key={pipeline.id}
              onClick={() => selectPipeline(pipeline.id)}
              type="button"
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${badgeColors[index % badgeColors.length]}`}
              >
                {initials(pipeline.name)}
              </span>
              <span className="truncate">{pipeline.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-500/50 bg-brand-50/50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50"
          onClick={() => {
            setCreateError('');
            setCreateOpen(true);
          }}
          type="button"
        >
          <Plus size={17} /> Pipeline Mới
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen min-h-[650px] overflow-hidden bg-canvas">
      <div className="hidden lg:block">{sidebar}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex bg-slate-950/35 lg:hidden">
          {sidebar}
          <button
            aria-label="Dong menu"
            className="flex-1"
            onClick={() => setSidebarOpen(false)}
            type="button"
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[76px] shrink-0 items-center border-b bg-white px-4 sm:px-7">
          <button
            aria-label="Mo menu"
            className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu size={21} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <span>Pipeline</span>
              <span>/</span>
              <span>Danh sách Lead</span>
            </div>
            <h1 className="text-gradient-brand mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
              {selectedPipeline?.name || 'Lead Management'}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Thong bao"
              className="relative hidden rounded-xl border p-2.5 text-slate-500 transition hover:bg-slate-50 sm:block"
              type="button"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!selectedPipeline}
              onClick={() => setWebhookOpen(true)}
              type="button"
            >
              <Webhook size={17} />
              <span className="hidden sm:inline">Webhook</span>
            </button>
            <button className="hidden items-center gap-2 border-l pl-3 sm:flex" type="button">
              <img
                alt="TPAI"
                className="h-9 w-9 rounded-full object-cover shadow-[0_0_0_2px_rgba(103,232,249,0.7),0_0_16px_rgba(34,211,238,0.35)]"
                src="/tpai-avatar.jpg"
              />
              <ChevronDown className="text-slate-400" size={15} />
            </button>
          </div>
        </header>

        <section className="scrollbar-subtle flex-1 overflow-auto p-4 sm:p-7">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-gradient-brand text-lg font-semibold tracking-tight">Danh sách Lead</h2>
                <p className="mt-1 text-sm text-muted">
                  Dữ liệu mới nhất gửi từ form của pipeline này.
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  className="w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên hoặc số điện thoại..."
                  value={search}
                />
                {search && (
                  <button
                    aria-label="Xoa tu khoa"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                    onClick={() => setSearch('')}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {pageError && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <span>{pageError}</span>
                <button className="font-semibold" onClick={loadPipelines} type="button">
                  Thử lại
                </button>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border bg-white shadow-panel">
              {loadingLeads ? (
                <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-muted">
                  <LoaderCircle className="animate-spin text-brand-600" size={22} />
                  Đang tải danh sách lead...
                </div>
              ) : leads.length === 0 ? (
                <EmptyLeads searching={Boolean(debouncedSearch)} />
              ) : (
                <div className="scrollbar-subtle overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-left">
                    <thead>
                      <tr className="border-b bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        <th className="whitespace-nowrap px-5 py-4">Received At</th>
                        <th className="whitespace-nowrap px-5 py-4">Số Điện Thoại</th>
                        <th className="min-w-64 px-5 py-4">Nội Dung Tư Vấn</th>
                        <th className="min-w-48 px-5 py-4">Tên Doanh Nghiệp</th>
                        <th className="min-w-44 px-5 py-4">Họ Tên</th>
                        <th className="min-w-52 px-5 py-4">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {leads.map((lead) => (
                        <tr className="group transition hover:bg-slate-50/70" key={lead.id}>
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-muted">
                            {formatDate(lead.received_at)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <a
                              className="font-semibold text-brand-700 hover:underline"
                              href={lead.phone ? `tel:${lead.phone}` : undefined}
                            >
                              {lead.phone || '—'}
                            </a>
                          </td>
                          <td className="max-w-xs px-5 py-4 text-sm leading-6 text-slate-600">
                            <span className="line-clamp-2">{lead.note || '—'}</span>
                          </td>
                          <td className="px-5 py-4 text-sm font-medium text-slate-700">
                            {lead.company_name || '—'}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                                {initials(lead.full_name)}
                              </span>
                              <span className="text-sm font-medium text-slate-800">
                                {lead.full_name || 'Chưa có tên'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {lead.email ? (
                              <a className="hover:text-brand-700 hover:underline" href={`mailto:${lead.email}`}>
                                {lead.email}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between border-t bg-slate-50/50 px-5 py-3 text-xs text-muted">
                <span>{leads.length} lead hiển thị</span>
                <span>Cập nhật theo thời gian nhận</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Modal
        description="Mỗi pipeline có một Webhook URL riêng để phân loại lead tự động."
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Tạo Pipeline mới"
      >
        <PipelineForm
          busy={creating}
          error={createError}
          onCancel={() => setCreateOpen(false)}
          onSubmit={createPipeline}
        />
      </Modal>

      <Modal
        description="Dùng URL này làm endpoint nhận dữ liệu POST từ Landing Page, LadiPage hoặc Website Form."
        onClose={() => setWebhookOpen(false)}
        open={webhookOpen}
        title="Webhook của Pipeline"
      >
        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Link2 size={14} /> Webhook URL
          </div>
          <p className="break-all font-mono text-sm leading-6 text-slate-700">{webhookUrl}</p>
        </div>
        <button
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
            copied ? 'bg-emerald-600' : 'bg-ink hover:bg-slate-700'
          }`}
          onClick={copyWebhook}
          type="button"
        >
          {copied ? <Check size={18} /> : <Clipboard size={18} />}
          {copied ? 'Đã sao chép' : 'Sao chép Webhook URL'}
        </button>
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          Gửi dữ liệu bằng <strong>POST</strong> với JSON hoặc form-urlencoded. Cần có ít nhất
          trường <code>phone</code> hoặc <code>email</code>.
        </div>
      </Modal>
    </div>
  );
}
