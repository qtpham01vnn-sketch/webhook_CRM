import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDocumentText,
  excelSheetsToKnowledge,
  parseExcelSheets,
  parsePrice,
  splitPdfPages,
} from '../src/lib/officeImport.js';

test('Word duoc doc toan bo va chi chia khoi tim kiem noi bo', () => {
  const original = `Tieu chuan nguyen lieu dau vao\n\n${'Chi tieu va so lieu 0,5% 35 MPa. '.repeat(180)}`;
  const chunks = chunkDocumentText(original, 800, 80);
  assert.ok(chunks.length > 1);
  assert.match(chunks[0], /Tieu chuan nguyen lieu dau vao/);
  assert.ok(chunks.some((chunk) => chunk.includes('0,5%')));
});

test('PDF duoc tach theo trang va giu tham chieu nguon', () => {
  const result = splitPdfPages(
    [
      { pageNumber: 1, text: 'TC.09.01\nDo hut nuoc khong vuot qua 0,5%.' },
      { pageNumber: 2, text: 'Yeu cau do ben uon toi thieu 35 MPa.' },
      { pageNumber: 3, text: '' },
    ],
    'Tieu-chuan.pdf',
    'hash-pdf',
  );
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].version, '');
  assert.equal(result.documents[0].page_reference, 'Trang 1');
  assert.equal(result.documents[0].import_key, 'hash-pdf:pdf-page-1-chunk-1');
  assert.match(result.warnings[0], /1 trang không có lớp văn bản/);
});

test('Excel tieu chuan giu ten sheet, so dong va moi so lieu', () => {
  const result = excelSheetsToKnowledge([
    {
      sheet: 'Thanh pham A',
      data: [
        ['Chỉ tiêu', 'Mức yêu cầu', 'Đơn vị'],
        ['Độ hút nước', 0.5, '%'],
        ['Độ bền uốn', 35, 'MPa'],
      ],
    },
  ], 'Tieu-chuan-thanh-pham.xlsx', 'hash-xlsx');
  assert.equal(result.documents.length, 1);
  assert.match(result.documents[0].page_reference, /Sheet Thanh pham A/);
  assert.match(result.documents[0].content, /Độ hút nước \| 0.5 \| %/);
  assert.match(result.documents[0].content, /Độ bền uốn \| 35 \| MPa/);
  assert.equal(result.documents[0].metadata.source_type, 'xlsx');
});

test('doc Excel tu dong nhan cot tieng Viet va bo dong loi', () => {
  const result = parseExcelSheets([
    {
      name: 'Bang gia',
      rows: [
        ['CÔNG TY PHƯƠNG NAM'],
        ['Mã SP', 'Tên sản phẩm', 'Kích thước', 'Đơn giá', 'Đơn vị', 'Khu vực'],
        ['PN6060', 'Gạch 60x60', '600x600', 285000, 'm²', 'Miền Nam'],
        ['', 'Thiếu mã', '300x600', 190000, 'm²', 'Miền Nam'],
      ],
    },
  ]);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].product_code, 'PN6060');
  assert.equal(result.products[0].unit_price, 285000);
  assert.equal(result.warnings.length, 1);
});

test('doc don gia VND co dau phan cach', () => {
  assert.equal(parsePrice('285.000 đ'), 285000);
  assert.equal(parsePrice('1,250,000'), 1250000);
  assert.equal(parsePrice(190000), 190000);
});
