import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExcelSheets,
  parsePrice,
  splitPdfPages,
  splitTechnicalStandards,
} from '../src/lib/officeImport.js';

test('tach nhieu muc TC.09 va ghep ma lap lai', () => {
  const result = splitTechnicalStandards(`
TIEU CHUAN CO SO
TC.09.01 - Do hut nuoc
Yeu cau thu nghiem thu nhat.
TC.09.02 - Do ben uon
Yeu cau thu nghiem thu hai.
TC.09.01
Phu luc bo sung cho do hut nuoc.
`, 'TC09.docx');

  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].version, 'TC.09.01');
  assert.match(result.documents[0].content, /Phu luc bo sung/);
  assert.equal(result.documents[1].version, 'TC.09.02');
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
  assert.equal(result.documents[0].version, 'TC.09.01');
  assert.equal(result.documents[0].page_reference, 'Trang 1');
  assert.equal(result.documents[0].import_key, 'hash-pdf:pdf-page-1');
  assert.match(result.warnings[0], /1 trang không có lớp văn bản/);
});

test('file Word khong co ma duoc giu thanh mot tai lieu de xem truoc', () => {
  const result = splitTechnicalStandards('Noi dung tieu chuan chung.', 'Tieu-chuan.docx');
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].title, 'Tieu-chuan');
  assert.equal(result.warnings.length, 1);
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
