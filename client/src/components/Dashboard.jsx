import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Inbox,
  Link2,
  LoaderCircle,
  MoreVertical,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings2,
  Share2,
  Trash2,
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

const COLUMN_DEFINITIONS = [
  { key: 'received_at', label: 'Received At' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'note', label: 'Nội dung tư vấn' },
  { key: 'company_name', label: 'Tên doanh nghiệp' },
  { key: 'full_name', label: 'Họ tên' },
  { key: 'email', label: 'Email' },
];

const DEFAULT_COLUMN_ORDER = COLUMN_DEFINITIONS.map((column) => column.key);

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

function PipelineForm({ busy, error, initialValue, onCancel, onSubmit, submitLabel = 'Tạo Pipeline' }) {
  const [form, setForm] = useState(() => ({
    name: initialValue?.name || '',
    description: initialValue?.description || '',
    redirect_url: initialValue?.redirect_url || '',
  }));

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
          {submitLabel}
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

function ColumnEditor({ order, visible, onChange }) {
  const [dragging, setDragging] = useState(null);

  function moveColumn(target) {
    if (!dragging || dragging === target) return;
    const next = [...order];
    const from = next.indexOf(dragging);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    onChange({ order: next, visible });
    setDragging(null);
  }

  function toggleColumn(key) {
    const nextVisible = visible.includes(key)
      ? visible.filter((column) => column !== key)
      : [...visible, key];
    onChange({ order, visible: nextVisible });
  }

  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {order.map((key) => {
        const definition = COLUMN_DEFINITIONS.find((column) => column.key === key);
        if (!definition) return null;
        const shown = visible.includes(key);
        return (
          <div
            className={`flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2.5 transition ${dragging === key ? 'border-brand-500 ring-2 ring-brand-500/20' : ''}`}
            draggable
            key={key}
            onDragStart={() => setDragging(key)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveColumn(key)}
          >
            <button
              aria-label={`Kéo cột ${definition.label}`}
              className="cursor-grab text-slate-400 active:cursor-grabbing"
              onMouseDown={() => setDragging(key)}
              type="button"
            >
              <GripVertical size={17} />
            </button>
            <span className="flex-1 text-sm font-medium text-slate-700">{definition.label}</span>
            <button
              aria-label={shown ? `Ẩn ${definition.label}` : `Hiện ${definition.label}`}
              className={`rounded-lg p-1.5 transition ${shown ? 'text-brand-500 hover:bg-brand-50' : 'text-slate-400 hover:bg-slate-100'}`}
              onClick={() => toggleColumn(key)}
              type="button"
            >
              {shown ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ShareForm({ busy, copied, error, initialShare, onCancel, onCopy, onSubmit, shareUrl }) {
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(initialShare?.enabled !== false);
  const [columns, setColumns] = useState({
    order: initialShare?.column_order?.length ? initialShare.column_order : DEFAULT_COLUMN_ORDER,
    visible: initialShare?.visible_columns?.length ? initialShare.visible_columns : DEFAULT_COLUMN_ORDER,
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ password, enabled, column_order: columns.order, visible_columns: columns.visible });
      }}
    >
      <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Bật liên kết chia sẻ</p>
          <p className="mt-0.5 text-xs text-muted">Tắt để vô hiệu hóa link cũ.</p>
        </div>
        <button
          aria-pressed={enabled}
          className={`relative h-6 w-11 rounded-full transition ${enabled ? 'bg-brand-600' : 'bg-slate-300'}`}
          onClick={() => setEnabled((current) => !current)}
          type="button"
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Các cột được chia sẻ</p>
            <p className="mt-0.5 text-xs text-muted">Bấm mắt để ẩn/hiện, kéo biểu tượng để sắp xếp.</p>
          </div>
          <Settings2 className="text-brand-500" size={18} />
        </div>
        <ColumnEditor order={columns.order} visible={columns.visible} onChange={setColumns} />
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu chia sẻ (tối thiểu 4 ký tự)</span>
        <input
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          minLength={4}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={initialShare ? 'Nhập mật khẩu mới để cập nhật' : 'Đặt mật khẩu cho người nhận'}
          required
          type="password"
          value={password}
        />
      </label>
      {shareUrl && (
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Link chia sẻ</p>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-xs text-slate-700" readOnly value={shareUrl} />
            <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={onCopy} type="button">
              {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Đã copy' : 'Copy'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button className="rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onCancel} type="button">Hủy</button>
        <button className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={busy} type="submit">
          {busy && <LoaderCircle className="animate-spin" size={17} />} Lưu chia sẻ
        </button>
      </div>
    </form>
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
  const [editOpen, setEditOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [shareError, setShareError] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareSettings, setShareSettings] = useState(null);
  const [columnState, setColumnState] = useState({
    order: DEFAULT_COLUMN_ORDER,
    visible: DEFAULT_COLUMN_ORDER,
  });

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedId) || null,
    [pipelines, selectedId],
  );

  const webhookUrl = selectedPipeline
    ? `${(import.meta.env.VITE_WEBHOOK_BASE_URL || window.location.origin).replace(/\/$/, '')}/api/v1/webhook/${selectedPipeline.webhook_slug}`
    : '';

  const shareUrl = shareSettings?.token
    ? `${window.location.origin}/?share=${shareSettings.token}`
    : '';

  const visibleColumnDefinitions = columnState.order
    .filter((key) => columnState.visible.includes(key))
    .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
    .filter(Boolean);

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

  useEffect(() => {
    if (!selectedId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`tpai-columns-${selectedId}`) || 'null');
      if (saved?.order?.length && saved?.visible?.length) {
        setColumnState(saved);
        return;
      }
    } catch {
      // Ignore malformed local preferences and use defaults.
    }
    setColumnState({ order: DEFAULT_COLUMN_ORDER, visible: DEFAULT_COLUMN_ORDER });
  }, [selectedId]);

  function updateColumns(next) {
    const safeVisible = next.visible.length ? next.visible : [next.order[0]];
    const safeState = { order: next.order, visible: safeVisible };
    setColumnState(safeState);
    if (selectedId) localStorage.setItem(`tpai-columns-${selectedId}`, JSON.stringify(safeState));
  }

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

  async function updatePipeline(form) {
    if (!selectedPipeline) return;
    setUpdating(true);
    setEditError('');
    try {
      const response = await crmApi.updatePipeline(selectedPipeline.id, form);
      setPipelines((current) => current.map((pipeline) => (pipeline.id === response.data.id ? response.data : pipeline)));
      setEditOpen(false);
    } catch (error) {
      setEditError(error.message);
    } finally {
      setUpdating(false);
    }
  }

  async function deletePipeline() {
    if (!selectedPipeline || !window.confirm(`Xóa pipeline "${selectedPipeline.name}" và toàn bộ lead bên trong?`)) return;
    setDeleting(true);
    setPageError('');
    try {
      await crmApi.deletePipeline(selectedPipeline.id);
      const next = pipelines.filter((pipeline) => pipeline.id !== selectedPipeline.id);
      setPipelines(next);
      setSelectedId(next[0]?.id || null);
      setMenuOpen(false);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setDeleting(false);
    }
  }

  async function openShareSettings() {
    if (!selectedPipeline) return;
    setShareError('');
    setShareCopied(false);
    try {
      const response = await crmApi.getShare(selectedPipeline.id);
      setShareSettings(response.data);
    } catch (error) {
      // The share table may not have been migrated yet; keep the modal usable for first save.
      setShareSettings(null);
      setShareError(error.message);
    }
    setShareOpen(true);
  }

  async function saveShareSettings(input) {
    if (!selectedPipeline) return;
    setSharing(true);
    setShareError('');
    try {
      const response = await crmApi.saveShare(selectedPipeline.id, input);
      setShareSettings(response.data);
    } catch (error) {
      setShareError(error.message);
    } finally {
      setSharing(false);
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

  async function copyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
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
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.12)] transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!selectedPipeline}
              onClick={() => setWebhookOpen(true)}
              type="button"
            >
              <Webhook size={17} />
              <span className="hidden sm:inline">Webhook</span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-50 px-3.5 py-2.5 text-sm font-semibold text-brand-600 shadow-sm transition hover:border-brand-500 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!selectedPipeline}
              onClick={openShareSettings}
              type="button"
            >
              <Share2 size={17} />
              <span className="hidden sm:inline">Chia sẻ</span>
            </button>
            <div className="relative">
              <button
                aria-label="Tùy chọn pipeline"
                className="rounded-xl border p-2.5 text-slate-500 transition hover:bg-slate-50"
                onClick={() => setMenuOpen((current) => !current)}
                type="button"
              >
                <MoreVertical size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border bg-white p-1.5 shadow-2xl">
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setEditError(''); setEditOpen(true); setMenuOpen(false); }} type="button">
                    <Pencil size={16} /> Chỉnh sửa Pipeline
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setColumnsOpen(true); setMenuOpen(false); }} type="button">
                    <Settings2 size={16} /> Tùy chỉnh cột
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-300 hover:bg-rose-500/10" disabled={deleting} onClick={deletePipeline} type="button">
                    <Trash2 size={16} /> {deleting ? 'Đang xóa...' : 'Xóa Pipeline'}
                  </button>
                </div>
              )}
            </div>
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
                        {visibleColumnDefinitions.map((column) => (
                          <th className="whitespace-nowrap px-5 py-4" key={column.key}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {leads.map((lead) => (
                        <tr className="group transition hover:bg-slate-50/70" key={lead.id}>
                          {visibleColumnDefinitions.map((column) => {
                            if (column.key === 'phone') {
                              return (
                                <td className="whitespace-nowrap px-5 py-4" key={column.key}>
                                  <a className="font-semibold text-brand-700 hover:underline" href={lead.phone ? `tel:${lead.phone}` : undefined}>{lead.phone || '—'}</a>
                                </td>
                              );
                            }
                            if (column.key === 'full_name') {
                              return (
                                <td className="px-5 py-4" key={column.key}>
                                  <div className="flex items-center gap-2.5">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{initials(lead.full_name)}</span>
                                    <span className="text-sm font-medium text-slate-800">{lead.full_name || 'Chưa có tên'}</span>
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td className="max-w-xs px-5 py-4 text-sm leading-6 text-slate-600" key={column.key}>
                                {column.key === 'received_at' ? formatDate(lead.received_at) : (lead[column.key] || '—')}
                              </td>
                            );
                          })}
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
        description="Cập nhật tên, mô tả hoặc URL chuyển hướng của pipeline."
        onClose={() => setEditOpen(false)}
        open={editOpen}
        title="Chỉnh sửa Pipeline"
      >
        <PipelineForm
          busy={updating}
          error={editError}
          initialValue={selectedPipeline}
          onCancel={() => setEditOpen(false)}
          onSubmit={updatePipeline}
          submitLabel="Lưu thay đổi"
        />
      </Modal>

      <Modal
        description="Chọn cột hiển thị trên bảng và kéo thả để đổi thứ tự. Thiết lập được lưu trên thiết bị này."
        onClose={() => setColumnsOpen(false)}
        open={columnsOpen}
        title="Tùy chỉnh cột"
      >
        <ColumnEditor order={columnState.order} visible={columnState.visible} onChange={updateColumns} />
        <div className="mt-5 flex justify-end">
          <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => setColumnsOpen(false)} type="button">Xong</button>
        </div>
      </Modal>

      <Modal
        description="Tạo một link riêng có mật khẩu. Người nhận chỉ thấy những cột anh chọn."
        onClose={() => setShareOpen(false)}
        open={shareOpen}
        title="Chia sẻ danh sách Lead"
      >
        <ShareForm
          busy={sharing}
          copied={shareCopied}
          error={shareError}
          initialShare={shareSettings}
          onCancel={() => setShareOpen(false)}
          onCopy={copyShare}
          onSubmit={saveShareSettings}
          shareUrl={shareUrl}
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
            copied ? 'bg-emerald-600' : 'bg-slate-950 hover:bg-slate-700'
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
