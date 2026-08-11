const HEADER_ALIASES = {
  product_code: ['ma san pham', 'ma sp', 'ma gach', 'ma hang', 'sku', 'product code'],
  name: ['ten san pham', 'ten sp', 'ten gach', 'ten hang', 'san pham', 'product name'],
  dimensions: ['kich thuoc', 'quy cach', 'size', 'dimensions'],
  unit_price: ['don gia', 'gia ban', 'gia', 'unit price', 'price'],
  unit: ['don vi', 'dvt', 'unit'],
  category: ['nhom san pham', 'loai san pham', 'chung loai', 'category'],
  region: ['khu vuc', 'mien', 'region'],
  customer_group: ['nhom khach hang', 'doi tuong', 'customer group'],
  minimum_quantity: ['so luong toi thieu', 'sl toi thieu', 'moq', 'minimum quantity'],
  notes: ['ghi chu', 'dieu kien gia', 'note', 'notes'],
};

export function normalizeImportText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanText(value, max = 200_000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function chunkDocumentText(rawText, maxChars = 3200, overlapChars = 240) {
  const text = cleanText(rawText);
  if (!text) return [];
  const chunks = [];
  let start = 0;

  while (start < text.length && chunks.length < 250) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const minimumBreak = start + Math.floor(maxChars * 0.65);
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const lineBreak = text.lastIndexOf('\n', end);
      const preferredBreak = Math.max(paragraphBreak, lineBreak);
      if (preferredBreak >= minimumBreak) end = preferredBreak;
    }
    const content = cleanText(text.slice(start, end));
    if (content) chunks.push(content);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return chunks;
}

function knowledgeDocumentsFromText(rawText, fileName, fileHash, sourceType) {
  const baseName = cleanText(String(fileName || 'Tai lieu').replace(/\.(docx|xlsx)$/i, ''), 150) || 'Tai lieu';
  const chunks = chunkDocumentText(rawText);
  return chunks.map((content, index) => ({
    title: `${baseName} — phần ${index + 1}/${chunks.length}`,
    version: '',
    page_reference: `Phần ${index + 1}/${chunks.length}`,
    content,
    import_key: `${fileHash || fileName}:${sourceType}-chunk-${index + 1}`,
    metadata: { chunk_number: index + 1, total_chunks: chunks.length, source_type: sourceType },
  }));
}

export function splitPdfPages(pages, fileName = 'Tai lieu PDF', fileHash = '') {
  const safePages = Array.isArray(pages) ? pages.slice(0, 250) : [];
  const totalPages = Number(pages?.totalPages) || safePages.length;
  const baseName = cleanText(String(fileName || 'Tai lieu PDF').replace(/\.pdf$/i, ''), 120) || 'Tai lieu PDF';
  const documents = [];
  const emptyPages = [];
  let contentTruncated = false;

  for (const page of safePages) {
    if (documents.length >= 250) {
      contentTruncated = true;
      break;
    }
    const pageNumber = Number(page?.pageNumber) || documents.length + 1;
    const content = cleanText(page?.text);
    if (!content) {
      emptyPages.push(pageNumber);
      continue;
    }
    const pageChunks = chunkDocumentText(content);
    pageChunks.forEach((pageContent, chunkIndex) => {
      if (documents.length >= 250) {
        contentTruncated = true;
        return;
      }
      const suffix = pageChunks.length > 1 ? `, đoạn ${chunkIndex + 1}/${pageChunks.length}` : '';
      documents.push({
        title: `${baseName} — trang ${pageNumber}${suffix}`,
        version: '',
        page_reference: `Trang ${pageNumber}${suffix}`,
        content: pageContent,
        import_key: `${fileHash || fileName}:pdf-page-${pageNumber}-chunk-${chunkIndex + 1}`,
        metadata: {
          page_number: pageNumber,
          page_chunk: chunkIndex + 1,
          page_chunks: pageChunks.length,
          source_type: 'pdf',
        },
      });
    });
  }

  const warnings = [];
  if (totalPages > 250) {
    warnings.push(`PDF có ${totalPages} trang; bản thử nghiệm chỉ đọc 250 trang đầu.`);
  }
  if (contentTruncated) {
    warnings.push('PDF có quá nhiều nội dung; bản thử nghiệm chỉ lập chỉ mục 250 khối đầu tiên.');
  }
  if (emptyPages.length) {
    warnings.push(
      `${emptyPages.length} trang không có lớp văn bản (${emptyPages.slice(0, 12).join(', ')}${emptyPages.length > 12 ? ', …' : ''}). Nếu đây là bản scan, cần OCR trước khi nhập.`,
    );
  }
  if (!documents.length) {
    warnings.push('PDF không có nội dung văn bản có thể trích xuất; có thể đây là file scan hoặc file được bảo vệ.');
  }
  return { documents, warnings };
}

function spreadsheetCellText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return cleanText(value, 10_000);
}

export function excelSheetsToKnowledge(sheets, fileName = 'Tai lieu Excel', fileHash = '') {
  const documents = [];
  const warnings = [];
  const baseName = cleanText(String(fileName || 'Tai lieu Excel').replace(/\.xlsx$/i, ''), 120) || 'Tai lieu Excel';

  for (const sheet of sheets || []) {
    const sheetName = cleanText(sheet?.name || sheet?.sheet || 'Sheet', 100);
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : Array.isArray(sheet?.data) ? sheet.data : [];
    const nonEmptyRows = rows
      .map((row, index) => ({
        rowNumber: index + 1,
        text: (Array.isArray(row) ? row : [row]).map(spreadsheetCellText).join(' | ').replace(/(?:\s*\|\s*)+$/g, ''),
      }))
      .filter((row) => row.text.trim());
    if (!nonEmptyRows.length) {
      warnings.push(`Sheet "${sheetName}" không có dữ liệu có thể đọc.`);
      continue;
    }

    let currentRows = [];
    let currentLength = 0;
    const flush = () => {
      if (!currentRows.length || documents.length >= 250) return;
      const firstRow = currentRows[0].rowNumber;
      const lastRow = currentRows[currentRows.length - 1].rowNumber;
      const content = currentRows.map((row) => `Dòng ${row.rowNumber}: ${row.text}`).join('\n');
      documents.push({
        title: `${baseName} — sheet ${sheetName}, dòng ${firstRow}-${lastRow}`,
        version: '',
        page_reference: `Sheet ${sheetName}, dòng ${firstRow}-${lastRow}`,
        content,
        import_key: `${fileHash || fileName}:xlsx-${sheetName}-${firstRow}-${lastRow}`,
        metadata: { sheet_name: sheetName, first_row: firstRow, last_row: lastRow, source_type: 'xlsx' },
      });
      currentRows = [];
      currentLength = 0;
    };

    for (const row of nonEmptyRows) {
      const rowLength = row.text.length + 20;
      if (currentRows.length && currentLength + rowLength > 3200) flush();
      if (documents.length >= 250) break;
      currentRows.push(row);
      currentLength += rowLength;
    }
    flush();
    if (documents.length >= 250) {
      warnings.push('Tài liệu Excel quá lớn; bản thử nghiệm chỉ lưu 250 khối dữ liệu đầu tiên.');
      break;
    }
  }

  if (!documents.length) warnings.push('Excel không có nội dung có thể trích xuất.');
  return { documents, warnings };
}

function headerKey(value) {
  const normalized = normalizeImportText(value);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalized === alias || normalized.includes(alias)),
  )?.[0] || null;
}

function findHeaderRow(rows) {
  let best = null;
  rows.slice(0, 25).forEach((row, index) => {
    const mapping = {};
    row.forEach((cell, columnIndex) => {
      const key = headerKey(cell);
      if (key && mapping[key] === undefined) mapping[key] = columnIndex;
    });
    const requiredScore = ['product_code', 'name', 'unit_price'].filter((key) => mapping[key] !== undefined).length;
    const score = Object.keys(mapping).length + requiredScore * 3;
    if (!best || score > best.score) best = { index, mapping, score, requiredScore };
  });
  return best?.requiredScore >= 2 ? best : null;
}

export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  const raw = String(value ?? '').trim();
  if (!raw) return Number.NaN;
  const compact = raw.replace(/\s/g, '');
  const separators = compact.match(/[.,]/g) || [];
  let numeric = compact.replace(/[^\d.,-]/g, '');
  if (separators.length) {
    const lastSeparator = Math.max(numeric.lastIndexOf('.'), numeric.lastIndexOf(','));
    const digitsAfter = numeric.length - lastSeparator - 1;
    if (digitsAfter === 3 || separators.length > 1) numeric = numeric.replace(/[.,]/g, '');
    else numeric = numeric.replace(/,/g, '.');
  }
  const result = Number(numeric);
  return Number.isFinite(result) ? result : Number.NaN;
}

function cell(row, mapping, key) {
  const index = mapping[key];
  return index === undefined ? '' : row[index];
}

export function parseExcelSheets(sheets) {
  const products = [];
  const warnings = [];

  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const header = findHeaderRow(rows);
    if (!header) {
      warnings.push(`Bo qua sheet "${sheet.name}": khong tim thay cot Ma SP/Ten SP/Don gia.`);
      continue;
    }

    rows.slice(header.index + 1).forEach((row, offset) => {
      const rowNumber = header.index + offset + 2;
      if (!row.some((value) => String(value ?? '').trim())) return;
      const product_code = cleanText(cell(row, header.mapping, 'product_code'), 100).toUpperCase();
      const name = cleanText(cell(row, header.mapping, 'name'), 300);
      const unit_price = parsePrice(cell(row, header.mapping, 'unit_price'));
      if (!product_code || !name || !Number.isFinite(unit_price) || unit_price < 0) {
        warnings.push(`Sheet "${sheet.name}", dong ${rowNumber}: thieu ma, ten hoac don gia hop le.`);
        return;
      }
      products.push({
        product_code,
        name,
        dimensions: cleanText(cell(row, header.mapping, 'dimensions'), 100),
        unit_price,
        unit: cleanText(cell(row, header.mapping, 'unit'), 30) || 'm²',
        category: cleanText(cell(row, header.mapping, 'category'), 150) || 'Gach op lat',
        region: cleanText(cell(row, header.mapping, 'region'), 100) || 'all',
        customer_group: cleanText(cell(row, header.mapping, 'customer_group'), 100) || 'all',
        minimum_quantity: Math.max(0, Number(cell(row, header.mapping, 'minimum_quantity') || 0)),
        notes: cleanText(cell(row, header.mapping, 'notes'), 1000),
        sheet_name: sheet.name,
        row_number: rowNumber,
      });
    });
  }

  const deduplicated = new Map();
  for (const product of products) {
    const key = [product.product_code, product.region, product.customer_group, product.minimum_quantity].join('|');
    if (deduplicated.has(key)) warnings.push(`Ma ${product.product_code} bi lap; he thong giu dong xuat hien sau cung.`);
    deduplicated.set(key, product);
  }
  return { products: [...deduplicated.values()], warnings };
}

async function sha256(arrayBuffer) {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseWordFile(file) {
  if (!/\.docx$/i.test(file.name)) throw new Error('Vui lòng chọn file Word định dạng .docx.');
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File Word vượt quá 25 MB. Vui lòng tách thành file nhỏ hơn trước khi nhập.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const [mammothModule, fileHash] = await Promise.all([
    import('mammoth'),
    sha256(arrayBuffer),
  ]);
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer });
  const documents = knowledgeDocumentsFromText(result.value, file.name, fileHash, 'docx');
  return {
    kind: 'knowledge',
    file_name: file.name,
    file_hash: fileHash,
    file_type: 'docx',
    items: documents.map((document) => ({ ...document, selected: true })),
    warnings: [
      ...(result.messages || []).map((message) => message.message),
      ...(!documents.length ? ['File Word không có nội dung văn bản có thể đọc.'] : []),
    ],
  };
}

export async function parsePdfFile(file) {
  if (!/\.pdf$/i.test(file.name)) throw new Error('Vui lòng chọn file PDF định dạng .pdf.');
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File PDF vượt quá 25 MB. Vui lòng tách thành các file nhỏ hơn trước khi nhập.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const fileHash = await sha256(arrayBuffer);
  const { extractPdfPages } = await import('./pdfImport.js');
  const pages = await extractPdfPages(arrayBuffer);
  const parsed = splitPdfPages(pages, file.name, fileHash);
  return {
    kind: 'knowledge',
    file_name: file.name,
    file_hash: fileHash,
    file_type: 'pdf',
    items: parsed.documents.map((document) => ({ ...document, selected: true })),
    warnings: parsed.warnings,
  };
}

export async function parseKnowledgeFile(file) {
  if (/\.docx$/i.test(file.name)) return parseWordFile(file);
  if (/\.xlsx$/i.test(file.name)) return parseExcelKnowledgeFile(file);
  if (/\.pdf$/i.test(file.name)) return parsePdfFile(file);
  throw new Error('Vui lòng chọn file Word .docx, Excel .xlsx hoặc PDF .pdf.');
}

export async function parseExcelKnowledgeFile(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Vui lòng chọn file Excel định dạng .xlsx.');
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File Excel vượt quá 25 MB. Vui lòng tách thành file nhỏ hơn trước khi nhập.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const [{ default: readXlsxFile }, fileHash] = await Promise.all([
    import('read-excel-file/browser'),
    sha256(arrayBuffer),
  ]);
  const workbook = await readXlsxFile(file);
  const parsed = excelSheetsToKnowledge(workbook, file.name, fileHash);
  return {
    kind: 'knowledge',
    file_name: file.name,
    file_hash: fileHash,
    file_type: 'xlsx',
    items: parsed.documents.map((document) => ({ ...document, selected: true })),
    warnings: parsed.warnings,
  };
}

export async function parseExcelFile(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Vui long chon file Excel dinh dang .xlsx.');
  const arrayBuffer = await file.arrayBuffer();
  const [{ default: readXlsxFile }, fileHash] = await Promise.all([
    import('read-excel-file/browser'),
    sha256(arrayBuffer),
  ]);
  const workbook = await readXlsxFile(file);
  const sheets = workbook.map(({ sheet, data }) => ({ name: sheet, rows: data }));
  const parsed = parseExcelSheets(sheets);
  return {
    kind: 'pricing',
    file_name: file.name,
    file_hash: fileHash,
    items: parsed.products.map((product) => ({ ...product, selected: true })),
    warnings: parsed.warnings,
  };
}
