import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  AlertTriangle,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  Database,
  FileText,
  FileSpreadsheet,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  TableProperties,
  UploadCloud,
  X,
} from 'lucide-react';
import { crmApi } from '../lib/api.js';
import { parseExcelFile, parseKnowledgeFile } from '../lib/officeImport.js';

const today = new Date().toISOString().slice(0, 10);

const emptyStandard = {
  title: '',
  source_label: '',
  version: '',
  page_reference: '',
  effective_from: '',
  content: '',
  approval_status: 'approved',
};

const emptyPricing = {
  list_name: 'Bảng giá bán Gạch Phương Nam',
  version: `BG-${today}`,
  effective_from: today,
  effective_to: '',
  product_code: '',
  product_name: '',
  category: 'Gạch ốp lát',
  dimensions: '',
  unit_price: '',
  unit: 'm²',
  region: 'all',
  customer_group: 'all',
  notes: '',
  bulk_rows: '',
};

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10';
}

function parseVnd(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return Number.NaN;
  return Number(raw.replace(/[^\d-]/g, ''));
}

function parseBulkRows(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [product_code, name, dimensions, unitPriceText, unit = 'm²', category = 'Gạch ốp lát'] =
        line.split(/[;\t]/).map((cell) => cell.trim());
      const unit_price = parseVnd(unitPriceText);
      if (!product_code || !name || !Number.isFinite(unit_price) || unit_price < 0) {
        throw new Error(`Dòng ${index + 1} chưa đúng định dạng hoặc giá không hợp lệ.`);
      }
      return { product_code, name, dimensions, unit_price, unit, category };
    });
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <Icon className="text-cyan-400" size={18} />
      </div>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function OfficeImportPanel({
  mode,
  preview,
  parsing,
  saving,
  approvalStatus,
  onApprovalChange,
  onFile,
  onToggle,
  onImport,
  onClear,
}) {
  const isKnowledge = mode === 'knowledge';
  const selectedCount = preview?.items.filter((item) => item.selected).length || 0;
  const knowledgeFiles = isKnowledge ? (preview?.files || (preview ? [preview] : [])) : [];
  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-400/10 p-2.5 text-cyan-400">
            {isKnowledge ? <FileText size={22} /> : <TableProperties size={22} />}
          </div>
          <div>
            <p className="font-semibold text-ink">
              {isKnowledge ? 'Tải nguyên tài liệu Word, Excel hoặc PDF cho AI' : 'Upload Excel — nhập sản phẩm & bảng giá'}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isKnowledge
                ? 'Chọn một hoặc nhiều file tiêu chuẩn. Hệ thống đọc toàn bộ chữ và bảng, tự lập chỉ mục để AI tra đúng nội dung và số liệu.'
                : 'Chọn file .xlsx. Hệ thống tự dò các cột mã sản phẩm, tên, kích thước, đơn giá và điều kiện giá.'}
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          {parsing ? <LoaderCircle className="animate-spin" size={17} /> : <UploadCloud size={17} />}
          {parsing ? 'Đang đọc các file…' : `Chọn ${isKnowledge ? 'nhiều file Word/Excel/PDF' : 'file Excel bảng giá'}`}
          <input
            accept={isKnowledge ? '.docx,.xlsx,.pdf' : '.xlsx'}
            className="sr-only"
            disabled={parsing || saving}
            multiple={isKnowledge}
            onChange={onFile}
            type="file"
          />
        </label>
      </div>

      {preview && (
        <div className="mt-4 space-y-4 border-t border-cyan-400/20 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {isKnowledge ? `${knowledgeFiles.length} file đã sẵn sàng` : preview.file_name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isKnowledge
                  ? `Đã đọc toàn bộ và tạo ${preview.items.length} khối tìm kiếm nội bộ cho AI`
                  : `Đã đọc ${preview.items.length} dòng · Đang chọn ${selectedCount} dòng`}
              </p>
            </div>
            <button className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-300" onClick={onClear} type="button">
              <X size={15} /> {isKnowledge && knowledgeFiles.length > 1 ? 'Bỏ danh sách' : 'Bỏ file'}
            </button>
          </div>

          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Cần kiểm tra</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {preview.warnings.slice(0, 8).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className="scrollbar-subtle max-h-72 space-y-2 overflow-y-auto pr-1">
            {isKnowledge && preview.items.length > 0 ? (
              <div className="space-y-2">
                {knowledgeFiles.map((filePreview) => (
                  <div className="rounded-xl border bg-white p-3" key={`${filePreview.file_hash}-${filePreview.file_name}`}>
                    <p className="text-sm font-semibold text-slate-800">{filePreview.file_name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Đã đọc toàn bộ · {filePreview.items.length} khối tìm kiếm · {filePreview.file_type.toUpperCase()}
                    </p>
                  </div>
                ))}
                <p className="px-1 text-xs leading-5 text-slate-500">
                  Anh duyệt một lần cho cả danh sách. Các khối chỉ là chỉ mục nội bộ để AI tìm đúng đoạn, trang hoặc sheet/dòng.
                </p>
              </div>
            ) : preview.items.map((item, index) => (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3" key={`${item.import_key || item.product_code}-${index}`}>
                <input checked={item.selected} className="mt-1 h-4 w-4 accent-cyan-500" onChange={() => onToggle(index)} type="checkbox" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{`${item.product_code} — ${item.name}`}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {`${item.dimensions || 'Chưa có kích thước'} · ${Number(item.unit_price).toLocaleString('vi-VN')} VND/${item.unit}`}
                  </span>
                </span>
              </label>
            ))}
            {!preview.items.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">Không tìm thấy dữ liệu hợp lệ trong file.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field
              label="Trạng thái sau khi nhập"
              hint={isKnowledge ? 'Đã duyệt: AI được phép tìm kiếm trong toàn bộ file này.' : 'Nên chọn Bản nháp ở lần đầu. Chỉ duyệt sau khi kiểm tra giá.'}
            >
              <select className={inputClass()} onChange={onApprovalChange} value={approvalStatus}>
                <option value="draft">Bản nháp — AI chưa được dùng</option>
                <option value="approved">Đã kiểm tra — AI được dùng</option>
              </select>
            </Field>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCount || saving}
              onClick={onImport}
              type="button"
            >
              {saving ? <LoaderCircle className="animate-spin" size={17} /> : <UploadCloud size={17} />}
              {isKnowledge ? `Nhập toàn bộ ${knowledgeFiles.length} file` : `Nhập ${selectedCount} dòng`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiTestPanel({ pipeline }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const suggestions = [
    'Độ hút nước theo tài liệu đã duyệt là bao nhiêu?',
    'Chỉ tiêu độ bền uốn được quy định như thế nào?',
    'Hãy cho biết số liệu và file nguồn liên quan.',
  ];

  async function askAi(event) {
    event?.preventDefault();
    const content = question.trim();
    if (!content || testing) return;
    const userMessage = { role: 'user', text: content };
    const previousMessages = messages;
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setTesting(true);
    setTestError('');
    try {
      const response = await crmApi.testGroundedAi({
        pipeline_id: pipeline.id,
        question: content,
        history: previousMessages.slice(-8).map((message) => ({
          direction: message.role === 'assistant' ? 'outbound' : 'inbound',
          text: message.text,
        })),
      });
      setMessages((current) => [...current, {
        role: 'assistant',
        text: response.answer,
        provider: response.provider,
        configured: response.configured,
        foundSources: response.found_sources,
        sources: response.sources || [],
      }]);
    } catch (error) {
      setTestError(error.message || 'Không thể kiểm tra AI lúc này.');
    } finally {
      setTesting(false);
    }
  }

  function useSuggestion(suggestion) {
    setQuestion(suggestion);
  }

  return (
    <div className="rounded-2xl border border-violet-400/30 bg-violet-400/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-400/10 p-2.5 text-violet-400"><Bot size={22} /></div>
          <div>
            <p className="font-semibold text-ink">Test AI với kho tài liệu</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Hỏi thử ngay trong pipeline này. AI chỉ được dùng các file có nhãn “AI đang dùng”.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700" onClick={() => { setMessages([]); setTestError(''); }} type="button">
            <RotateCcw size={15} /> Xóa hội thoại thử
          </button>
        )}
      </div>

      <div className="scrollbar-subtle mt-4 max-h-96 space-y-3 overflow-y-auto rounded-xl border bg-white/70 p-3">
        {!messages.length && (
          <div className="py-3">
            <p className="text-center text-sm text-slate-500">Chọn một câu gợi ý hoặc nhập câu hỏi thực tế của khách:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button className="rounded-full border border-violet-300/50 bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100" key={suggestion} onClick={() => useSuggestion(suggestion)} type="button">{suggestion}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} key={`${message.role}-${index}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-brand-600 text-white' : 'border bg-white text-slate-700'}`}>
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === 'assistant' && (
                <div className="mt-3 border-t pt-2">
                  <p className={`text-xs font-semibold ${message.foundSources || ['friendly-handoff', 'no-source'].includes(message.provider) ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {!message.configured
                      ? 'Chưa bật Gemini/Ollama — đang kiểm tra tìm nguồn an toàn'
                      : message.foundSources
                        ? `AI: ${message.provider}`
                        : message.provider === 'friendly-handoff'
                          ? 'Trợ lý hệ thống — không cần tra tài liệu kỹ thuật'
                          : 'Không có căn cứ phù hợp — AI không tự suy đoán'}
                  </p>
                  {message.sources?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.sources.map((source) => (
                        <p className="text-xs text-slate-500" key={source.source_id}>
                          Nguồn: {source.file_name || source.title}{source.page_reference ? ` · ${source.page_reference}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {testing && <div className="flex items-center gap-2 text-sm text-violet-600"><LoaderCircle className="animate-spin" size={16} /> AI đang tìm trong tài liệu đã duyệt…</div>}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={askAi}>
        <input className={inputClass()} disabled={testing} onChange={(event) => setQuestion(event.target.value)} placeholder="VD: Độ hút nước của gạch 60x60 là bao nhiêu?" value={question} />
        <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50" disabled={testing || !question.trim()} type="submit">
          {testing ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={17} />} Hỏi AI
        </button>
      </form>
      {testError && <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">{testError}</p>}
    </div>
  );
}

export default function GroundedDataManager({ pipeline }) {
  const [tab, setTab] = useState('standards');
  const [summary, setSummary] = useState({ knowledge_documents: 0, product_catalog: 0, price_lists: 0 });
  const [documents, setDocuments] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [standard, setStandard] = useState(emptyStandard);
  const [pricing, setPricing] = useState(emptyPricing);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importApproval, setImportApproval] = useState('draft');
  const [updatingSource, setUpdatingSource] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    if (!pipeline?.id) return;
    setLoading(true);
    setError('');
    try {
      const [summaryResponse, documentsResponse, priceListsResponse] = await Promise.all([
        crmApi.getGroundedSummary(pipeline.id),
        crmApi.getKnowledgeDocuments(pipeline.id),
        crmApi.getPriceLists(pipeline.id),
      ]);
      setSummary(summaryResponse.data);
      setDocuments(documentsResponse.data);
      setPriceLists(priceListsResponse.data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [pipeline?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const documentSources = useMemo(() => {
    const sources = new Map();
    documents.forEach((item) => {
      const key = item.metadata?.file_hash || item.source_label || item.id;
      if (!sources.has(key)) {
        sources.set(key, {
          key,
          file_hash: item.metadata?.file_hash || '',
          file_type: item.metadata?.file_type || item.metadata?.source_type || '',
          source_label: item.source_label || item.title,
          documents: [],
        });
      }
      sources.get(key).documents.push(item);
    });
    return [...sources.values()].map((source) => ({
      ...source,
      approved: source.documents.every(
        (item) => item.enabled && item.approval_status === 'approved',
      ),
    }));
  }, [documents]);
  const draftSources = useMemo(
    () => documentSources.filter((source) => !source.approved),
    [documentSources],
  );

  function updateStandard(event) {
    const { name, value } = event.target;
    setStandard((current) => ({ ...current, [name]: value }));
  }

  function updatePricing(event) {
    const { name, value } = event.target;
    setPricing((current) => ({ ...current, [name]: value }));
  }

  async function handleOfficeFile(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setParsingFile(true);
    setError('');
    setNotice('');
    try {
      if (tab === 'standards') {
        if (files.length > 20) throw new Error('Mỗi lần chọn tối đa 20 file để trình duyệt xử lý ổn định.');
        const parsedFiles = [];
        const fileWarnings = [];
        for (const file of files) {
          try {
            const parsed = await parseKnowledgeFile(file);
            parsedFiles.push(parsed);
            fileWarnings.push(...parsed.warnings.map((warning) => `${file.name}: ${warning}`));
          } catch (fileError) {
            fileWarnings.push(`${file.name}: ${fileError.message || 'Không thể đọc file.'}`);
          }
        }
        if (!parsedFiles.length) throw new Error(fileWarnings.join(' '));
        setImportPreview({
          kind: 'knowledge',
          files: parsedFiles,
          file_name: parsedFiles.length === 1 ? parsedFiles[0].file_name : `${parsedFiles.length} file tiêu chuẩn`,
          items: parsedFiles.flatMap((preview) => preview.items),
          warnings: fileWarnings,
        });
      } else {
        setImportPreview(await parseExcelFile(files[0]));
      }
      setImportApproval('draft');
    } catch (fileError) {
      setImportPreview(null);
      setError(fileError.message || 'Không thể đọc file đã chọn.');
    } finally {
      setParsingFile(false);
    }
  }

  function toggleImportItem(index) {
    setImportPreview((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, selected: !item.selected } : item,
      ),
    }));
  }

  async function importOfficeData() {
    const selected = importPreview?.items.filter((item) => item.selected) || [];
    if (!selected.length) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (importPreview.kind === 'knowledge') {
        const files = importPreview.files || [importPreview];
        let imported = 0;
        let skipped = 0;
        for (const filePreview of files) {
          const response = await crmApi.importKnowledgeDocuments({
            pipeline_id: pipeline.id,
            file_name: filePreview.file_name,
            effective_from: standard.effective_from || null,
            approval_status: importApproval,
            documents: filePreview.items.map(({ selected: _selected, ...document }) => ({
              ...document,
              source_label: filePreview.file_name,
              metadata: {
                ...(document.metadata || {}),
                file_hash: filePreview.file_hash,
                file_type: filePreview.file_type || 'docx',
              },
            })),
          });
          imported += response.imported || 0;
          skipped += response.skipped || 0;
        }
        setNotice(`Đã nhập toàn bộ ${files.length} file thành ${imported} khối tìm kiếm cho AI${skipped ? `, bỏ qua ${skipped} khối đã có` : ''}.`);
      } else {
        const response = await crmApi.importPriceWorkbook({
          pipeline_id: pipeline.id,
          file_name: importPreview.file_name,
          price_list: {
            name: pricing.list_name,
            version: pricing.version,
            effective_from: pricing.effective_from,
            effective_to: pricing.effective_to || null,
            approval_status: importApproval,
            notes: pricing.notes,
          },
          products: selected.map(({ selected: _selected, ...product }) => product),
        });
        setNotice(`Đã nhập ${response.imported_products} sản phẩm và ${response.imported_prices} mức giá từ Excel.`);
      }
      setImportPreview(null);
      await loadData();
    } catch (importError) {
      setError(importError.message || 'Không thể nhập dữ liệu từ file.');
    } finally {
      setSaving(false);
    }
  }

  async function setSourceApproval(source, approvalStatus) {
    return crmApi.updateKnowledgeSourceApproval({
      pipeline_id: pipeline.id,
      approval_status: approvalStatus,
      file_hash: source.file_hash || undefined,
      document_ids: source.file_hash ? undefined : source.documents.map((item) => item.id),
    });
  }

  async function changeSourceApproval(source, approvalStatus) {
    setUpdatingSource(source.key);
    setError('');
    setNotice('');
    try {
      const response = await setSourceApproval(source, approvalStatus);
      setNotice(
        approvalStatus === 'approved'
          ? `Đã duyệt ${source.source_label}. AI được phép sử dụng ${response.updated} khối dữ liệu của file này.`
          : `Đã chuyển ${source.source_label} về Bản nháp. AI sẽ ngừng sử dụng file này.`,
      );
      await loadData();
    } catch (approvalError) {
      setError(approvalError.message || 'Không thể cập nhật trạng thái file.');
    } finally {
      setUpdatingSource('');
    }
  }

  async function approveAllSources() {
    if (!draftSources.length) return;
    setUpdatingSource('all');
    setError('');
    setNotice('');
    try {
      const responses = await Promise.all(
        draftSources.map((source) => setSourceApproval(source, 'approved')),
      );
      const updated = responses.reduce((total, response) => total + (response.updated || 0), 0);
      setNotice(`Đã duyệt ${draftSources.length} file với ${updated} khối dữ liệu. AI có thể tra cứu ngay.`);
      await loadData();
    } catch (approvalError) {
      setError(approvalError.message || 'Không thể duyệt toàn bộ file.');
    } finally {
      setUpdatingSource('');
    }
  }

  async function saveStandard(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await crmApi.createKnowledgeDocument({
        pipeline_id: pipeline.id,
        title: standard.title,
        document_type: 'technical_standard',
        source_label: standard.source_label,
        version: standard.version,
        page_reference: standard.page_reference,
        effective_from: standard.effective_from || null,
        approval_status: standard.approval_status,
        content: standard.content,
        enabled: true,
      });
      setStandard(emptyStandard);
      setNotice('Đã lưu nguồn tiêu chuẩn. AI chỉ dùng nguồn này khi trạng thái là Đã duyệt.');
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePricing(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const bulkRows = parseBulkRows(pricing.bulk_rows);
      const productRows = bulkRows.length
        ? bulkRows
        : [{
            product_code: pricing.product_code,
            name: pricing.product_name,
            category: pricing.category,
            dimensions: pricing.dimensions,
            unit_price: parseVnd(pricing.unit_price),
            unit: pricing.unit,
          }];

      if (!bulkRows.length && (!productRows[0].product_code || !productRows[0].name || !Number.isFinite(productRows[0].unit_price))) {
        throw new Error('Anh cần nhập mã, tên sản phẩm và đơn giá hợp lệ.');
      }

      const productResponses = await Promise.all(
        productRows.map((row) => crmApi.createProduct({
          pipeline_id: pipeline.id,
          product_code: row.product_code,
          name: row.name,
          category: row.category,
          dimensions: row.dimensions,
          unit: row.unit,
          status: 'active',
        })),
      );
      const priceListResponse = await crmApi.createPriceList({
        pipeline_id: pipeline.id,
        name: pricing.list_name,
        version: pricing.version,
        effective_from: pricing.effective_from,
        effective_to: pricing.effective_to || null,
        approval_status: 'approved',
        notes: pricing.notes,
      });
      await crmApi.addPriceRows(
        priceListResponse.data.id,
        productRows.map((row, index) => ({
          product_id: productResponses[index].data.id,
          unit_price: row.unit_price,
          unit: row.unit,
          region: pricing.region || 'all',
          customer_group: pricing.customer_group || 'all',
          notes: pricing.notes,
        })),
      );
      setPricing((current) => ({ ...emptyPricing, list_name: current.list_name, version: current.version }));
      setNotice(`Đã duyệt và lưu ${productRows.length} mức giá. Bot sẽ trả đúng số tiền từ bảng này.`);
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-56 items-center justify-center"><LoaderCircle className="animate-spin text-cyan-400" size={30} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-cyan-400" size={22} />
          <div>
            <p className="font-semibold text-ink">Kho dữ liệu riêng của {pipeline?.name}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">AI đọc và tra cứu toàn bộ Word, Excel, PDF đã duyệt. Mỗi câu trả lời phải dựa trên dữ liệu tìm thấy trong đúng file nguồn.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={BookOpenCheck} label="File tiêu chuẩn" value={documentSources.length} />
        <SummaryCard icon={PackageCheck} label="Sản phẩm" value={summary.product_catalog || 0} />
        <SummaryCard icon={FileSpreadsheet} label="Bảng giá" value={summary.price_lists || 0} />
      </div>

      <div className="flex gap-2 rounded-xl border bg-slate-50 p-1.5">
        <button className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${tab === 'standards' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => { setTab('standards'); setImportPreview(null); }} type="button"><BookOpenCheck className="mr-2 inline" size={16} />Tiêu chuẩn kỹ thuật</button>
        <button className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${tab === 'pricing' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => { setTab('pricing'); setImportPreview(null); }} type="button"><FileSpreadsheet className="mr-2 inline" size={16} />Sản phẩm & bảng giá</button>
      </div>

      <OfficeImportPanel
        approvalStatus={importApproval}
        mode={tab === 'standards' ? 'knowledge' : 'pricing'}
        onApprovalChange={(event) => setImportApproval(event.target.value)}
        onClear={() => setImportPreview(null)}
        onFile={handleOfficeFile}
        onImport={importOfficeData}
        onToggle={toggleImportItem}
        parsing={parsingFile}
        preview={importPreview}
        saving={saving}
      />

      {tab === 'standards' && <AiTestPanel pipeline={pipeline} />}

      {tab === 'standards' ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form className="space-y-4" onSubmit={saveStandard}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên tiêu chuẩn / tài liệu"><input className={inputClass()} name="title" onChange={updateStandard} placeholder="VD: TCVN 7745:2007 - Gạch gốm ốp lát" required value={standard.title} /></Field>
              <Field label="Cơ quan / nguồn ban hành"><input className={inputClass()} name="source_label" onChange={updateStandard} placeholder="VD: Bộ KH&CN / Phiếu thử nghiệm số..." required value={standard.source_label} /></Field>
              <Field label="Phiên bản / số hiệu"><input className={inputClass()} name="version" onChange={updateStandard} placeholder="VD: TCVN 7745:2007" value={standard.version} /></Field>
              <Field label="Trang / điều khoản"><input className={inputClass()} name="page_reference" onChange={updateStandard} placeholder="VD: Điều 5.2, trang 12" value={standard.page_reference} /></Field>
              <Field label="Hiệu lực từ"><input className={inputClass()} name="effective_from" onChange={updateStandard} type="date" value={standard.effective_from} /></Field>
              <Field label="Trạng thái"><select className={inputClass()} name="approval_status" onChange={updateStandard} value={standard.approval_status}><option value="approved">Đã duyệt — AI được dùng</option><option value="draft">Bản nháp — AI không được dùng</option></select></Field>
            </div>
            <Field label="Nội dung đã kiểm chứng" hint="Dán nguyên văn phần thông số cần dùng và ghi rõ mã sản phẩm/điều khoản. Không dán nội dung chưa xác minh."><textarea className={`${inputClass()} min-h-56 resize-y leading-6`} name="content" onChange={updateStandard} placeholder="Nội dung tiêu chuẩn, thông số kỹ thuật, điều kiện áp dụng..." required value={standard.content} /></Field>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} Lưu nguồn tiêu chuẩn</button>
          </form>
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">Các file đã tải</p>
                <p className="mt-1 text-xs text-slate-500">Duyệt file để AI bắt đầu tra cứu.</p>
              </div>
              {draftSources.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={Boolean(updatingSource)}
                  onClick={approveAllSources}
                  type="button"
                >
                  {updatingSource === 'all' ? <LoaderCircle className="animate-spin" size={14} /> : <BadgeCheck size={14} />}
                  Duyệt tất cả ({draftSources.length})
                </button>
              )}
            </div>
            <div className="scrollbar-subtle mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {documentSources.length ? documentSources.map((source) => (
                <div className="rounded-xl border bg-white p-3" key={source.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{source.source_label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {[source.file_type?.toUpperCase(), `${source.documents.length} khối dữ liệu`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${source.approved ? 'bg-emerald-400/15 text-emerald-500' : 'bg-amber-400/15 text-amber-600'}`}>
                      {source.approved ? 'AI đang dùng' : 'Bản nháp'}
                    </span>
                  </div>
                  <button
                    className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${source.approved ? 'bg-slate-500 hover:bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                    disabled={Boolean(updatingSource)}
                    onClick={() => changeSourceApproval(source, source.approved ? 'draft' : 'approved')}
                    type="button"
                  >
                    {updatingSource === source.key ? <LoaderCircle className="animate-spin" size={14} /> : source.approved ? <X size={14} /> : <BadgeCheck size={14} />}
                    {source.approved ? 'Tạm ngưng AI dùng file' : 'Duyệt cho AI'}
                  </button>
                </div>
              )) : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">Chưa tải file tiêu chuẩn nào.</p>}
            </div>
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={savePricing}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tên bảng giá"><input className={inputClass()} name="list_name" onChange={updatePricing} required value={pricing.list_name} /></Field>
            <Field label="Phiên bản"><input className={inputClass()} name="version" onChange={updatePricing} required value={pricing.version} /></Field>
            <Field label="Hiệu lực từ"><input className={inputClass()} name="effective_from" onChange={updatePricing} required type="date" value={pricing.effective_from} /></Field>
            <Field label="Hiệu lực đến"><input className={inputClass()} name="effective_to" onChange={updatePricing} type="date" value={pricing.effective_to} /></Field>
          </div>
          <div className="rounded-xl border p-4">
            <div className="mb-4 flex items-center gap-2"><Database className="text-cyan-400" size={18} /><p className="font-semibold text-ink">Nhập một sản phẩm</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Mã sản phẩm"><input className={inputClass()} name="product_code" onChange={updatePricing} placeholder="VD: PN-6060-001" value={pricing.product_code} /></Field>
              <Field label="Tên sản phẩm"><input className={inputClass()} name="product_name" onChange={updatePricing} placeholder="Gạch porcelain vân đá" value={pricing.product_name} /></Field>
              <Field label="Kích thước"><input className={inputClass()} name="dimensions" onChange={updatePricing} placeholder="600x600 mm" value={pricing.dimensions} /></Field>
              <Field label="Đơn giá (VND)"><input className={inputClass()} min="0" name="unit_price" onChange={updatePricing} placeholder="285000" type="number" value={pricing.unit_price} /></Field>
              <Field label="Đơn vị"><input className={inputClass()} name="unit" onChange={updatePricing} value={pricing.unit} /></Field>
              <Field label="Khu vực"><input className={inputClass()} name="region" onChange={updatePricing} placeholder="all / Miền Nam" value={pricing.region} /></Field>
              <Field label="Nhóm khách hàng"><input className={inputClass()} name="customer_group" onChange={updatePricing} placeholder="all / Đại lý cấp 1" value={pricing.customer_group} /></Field>
              <Field label="Nhóm sản phẩm"><input className={inputClass()} name="category" onChange={updatePricing} value={pricing.category} /></Field>
            </div>
          </div>
          <Field label="Hoặc dán nhiều sản phẩm" hint="Mỗi dòng: Mã SP ; Tên SP ; Kích thước ; Đơn giá ; Đơn vị ; Nhóm sản phẩm. Khi ô này có dữ liệu, hệ thống ưu tiên nhập nhiều dòng."><textarea className={`${inputClass()} min-h-32 resize-y font-mono text-xs leading-6`} name="bulk_rows" onChange={updatePricing} placeholder={'PN-6060-001; Gạch porcelain vân đá; 600x600 mm; 285000; m²; Gạch lát nền\nPN-3060-002; Gạch ốp tường; 300x600 mm; 190000; m²; Gạch ốp tường'} value={pricing.bulk_rows} /></Field>
          <Field label="Ghi chú / điều kiện giá"><textarea className={`${inputClass()} min-h-20 resize-y`} name="notes" onChange={updatePricing} placeholder="Giá đã/ chưa gồm VAT, điều kiện giao hàng, số lượng tối thiểu..." value={pricing.notes} /></Field>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4"><div className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="text-emerald-400" size={19} />Bảng giá lưu từ màn hình này được đánh dấu đã duyệt và dùng đúng thời gian hiệu lực.</div><span className="text-xs text-slate-500">Hiện có {priceLists.length} bảng giá</span></div>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} Lưu sản phẩm & bảng giá</button>
        </form>
      )}

      {notice && <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}
      {error && <p className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
    </div>
  );
}
