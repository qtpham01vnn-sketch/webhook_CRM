const WORD_CODE_PATTERN = /\bTC\s*[.\-_]?\s*09(?:\s*[.\-_]\s*\d{1,3})+\b/i;

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

function canonicalCode(value) {
  const match = String(value || '').match(WORD_CODE_PATTERN);
  if (!match) return '';
  return match[0]
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '.')
    .replace(/\.{2,}/g, '.');
}

function titleForSection(line, code) {
  const compact = cleanText(line, 300).replace(/^[-–—:\s]+|[-–—:\s]+$/g, '');
  if (!compact) return code;
  return compact.toUpperCase().startsWith(code) ? compact : `${code} - ${compact}`;
}

export function splitTechnicalStandards(rawText, fileName = 'Tai lieu Word') {
  const lines = cleanText(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections = [];
  const preamble = [];
  let current = null;

  for (const line of lines) {
    const code = canonicalCode(line);
    const looksLikeHeading = code && line.length <= 260;
    if (looksLikeHeading && (!current || current.code !== code)) {
      if (current?.lines.length) sections.push(current);
      current = { code, title: titleForSection(line, code), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current?.lines.length) sections.push(current);

  if (!sections.length) {
    const content = cleanText(lines.join('\n'));
    return {
      documents: content
        ? [{
            title: fileName.replace(/\.docx$/i, ''),
            version: '',
            page_reference: '',
            content,
          }]
        : [],
      warnings: content
        ? ['Khong tim thay ma TC.09.xx; he thong tao mot tai lieu duy nhat de anh xem lai.']
        : ['File Word khong co noi dung van ban co the doc.'],
    };
  }

  if (preamble.length) {
    sections[0].lines.unshift(`Thong tin mo dau tu file ${fileName}:`, ...preamble);
  }

  const seen = new Map();
  for (const section of sections) {
    const content = cleanText(section.lines.join('\n'));
    if (!content) continue;
    const existing = seen.get(section.code);
    if (existing) {
      existing.content = cleanText(`${existing.content}\n\n${content}`);
    } else {
      seen.set(section.code, {
        title: section.title,
        version: section.code,
        page_reference: section.code,
        content,
      });
    }
  }

  return {
    documents: [...seen.values()],
    warnings: seen.size < sections.length
      ? ['Mot so ma TC lap lai trong file da duoc ghep thanh cung mot muc.']
      : [],
  };
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
  if (!/\.docx$/i.test(file.name)) throw new Error('Vui long chon file Word dinh dang .docx.');
  const arrayBuffer = await file.arrayBuffer();
  const [mammothModule, fileHash] = await Promise.all([
    import('mammoth'),
    sha256(arrayBuffer),
  ]);
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer });
  const parsed = splitTechnicalStandards(result.value, file.name);
  return {
    kind: 'knowledge',
    file_name: file.name,
    file_hash: fileHash,
    items: parsed.documents.map((document, index) => ({
      ...document,
      selected: true,
      import_key: `${fileHash || file.name}:${document.version || index}`,
    })),
    warnings: [...(result.messages || []).map((message) => message.message), ...parsed.warnings],
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
