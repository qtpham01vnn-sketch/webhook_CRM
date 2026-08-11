import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createAdminAuthMiddleware,
  isPublicApiRequest,
} from '../middleware/adminAuth.js';
import { rankKnowledgeDocuments } from '../services/knowledge.js';
import { extractLeadSignals, missingLeadFields, normalizePhone } from '../services/leadCapture.js';
import { formatPriceReply, isPriceQuestion, rankProducts } from '../services/pricing.js';
import { generateAiReply, validateGroundedReply } from '../services/ai.js';
import {
  extractMessengerTextEvents,
  verifyMetaSignature,
} from '../services/messenger.js';

test('verifyMetaSignature chap nhan chu ky hop le', () => {
  const body = Buffer.from('{"object":"page"}');
  const secret = 'test-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(body, signature, 'wrong-secret'), false);
});

test('extractMessengerTextEvents bo qua echo va payload khong co text', () => {
  const events = extractMessengerTextEvents({
    object: 'page',
    entry: [
      {
        messaging: [
          {
            sender: { id: 'user-1' },
            recipient: { id: 'page-1' },
            timestamp: 123,
            message: { mid: 'm-1', text: 'Độ hút nước là gì?' },
          },
          {
            sender: { id: 'page-1' },
            recipient: { id: 'user-1' },
            message: { mid: 'm-2', text: 'echo', is_echo: true },
          },
        ],
      },
    ],
  });
  assert.deepEqual(events, [
    {
      eventId: 'm-1',
      pageId: 'page-1',
      senderPsid: 'user-1',
      text: 'Độ hút nước là gì?',
      timestamp: 123,
    },
  ]);
});

test('rankKnowledgeDocuments tim kiem khong dau', () => {
  const ranked = rankKnowledgeDocuments(
    [
      { id: '1', title: 'Độ hút nước', content: 'Yêu cầu thử nghiệm độ hút nước của gạch.' },
      { id: '2', title: 'Bao gói', content: 'Quy cách đóng thùng.' },
    ],
    'do hut nuoc cua gach',
  );
  assert.equal(ranked[0].id, '1');
});

test('cau xa giao khong bi bat nham vao tai lieu ky thuat', () => {
  const ranked = rankKnowledgeDocuments(
    [
      {
        id: '1',
        title: 'Tiêu chuẩn nguyên vật liệu',
        source_label: 'TC.09.01.docx',
        content: 'Tên nguyên liệu, tên chỉ tiêu và phương pháp thử được quy định trong hợp đồng.',
      },
    ],
    'Em tên gì? Đi cà phê với anh được không?',
  );
  assert.deepEqual(ranked, []);
});

test('loc tu chung van giu dung truy van do am than cuc', () => {
  const ranked = rankKnowledgeDocuments(
    [
      {
        id: 'than-cuc',
        title: 'Tiêu chuẩn chấp nhận đối với than cục',
        source_label: 'TC.09.01.docx',
        content: '2.2.1 Độ ẩm (%): Theo phụ lục HĐ.',
      },
      {
        id: 'vo-dieu',
        title: 'Tiêu chuẩn bã vỏ điều',
        source_label: 'TC.09.01.docx',
        content: 'Độ ẩm không lớn hơn 20.0 phần trăm.',
      },
    ],
    'Độ ẩm than cục bao nhiêu?',
  );
  assert.equal(ranked[0].id, 'than-cuc');
});

test('AI tu choi loi moi ca nhan lich su va chu dong thu lead', async () => {
  const reply = await generateAiReply({
    question: 'Em tên gì? Đi cà phê với anh được không?',
    sources: [],
    contactUrl: 'https://crm.example/#/embed/test-fanpage',
  });
  assert.equal(reply.provider, 'friendly-handoff');
  assert.match(reply.text, /Trợ lý AI của Gạch Phương Nam/);
  assert.match(reply.text, /chưa thể đi cà phê/);
  assert.match(reply.text, /họ tên, số điện thoại và nhu cầu/);
  assert.match(reply.text, /https:\/\/crm[.]example\/#\/embed\/test-fanpage/);
});

test('Messenger hoi tung thong tin lead khong lap lai loi moi chung', async () => {
  const reply = await generateAiReply({
    question: 'Xin chào',
    sources: [],
    leadFollowUp: 'Anh/chị cho em xin số điện thoại để nhân viên liên hệ nhé.',
    contactUrl: 'https://crm.example/#/embed/test-fanpage',
  });
  assert.match(reply.text, /xin số điện thoại/);
  assert.doesNotMatch(reply.text, /họ tên, số điện thoại và nhu cầu/);
});

test('lead capture chuan hoa so dien thoai va trich xuat thong tin', () => {
  const profile = extractLeadSignals(
    'Tôi là Nguyễn Văn An, SĐT +84 912.345.678, cần báo giá gạch GP6060 cho công ty An Phát',
  );
  assert.equal(profile.full_name, 'Nguyễn Văn An');
  assert.equal(profile.phone, '0912345678');
  assert.match(profile.need, /GP6060/);
  assert.equal(normalizePhone('0084 912 345 678'), '0912345678');
  assert.deepEqual(missingLeadFields(profile), []);
});

test('bang gia chi tra ve san pham phu hop va kem nguon', () => {
  assert.equal(isPriceQuestion('Cho tôi xin giá gạch GP6060'), true);
  const products = rankProducts(
    [
      { id: '1', product_code: 'GP6060', name: 'Gạch 60x60', dimensions: '60x60' },
      { id: '2', product_code: 'GP8080', name: 'Gạch 80x80', dimensions: '80x80' },
    ],
    'Giá mã GP6060',
  );
  assert.equal(products[0].id, '1');
  const reply = formatPriceReply([
    {
      id: 'p1',
      sourceId: 'price-p1',
      unit_price: 150000,
      currency: 'VND',
      unit: 'm2',
      region: 'all',
      minimum_quantity: 0,
      product: products[0],
      priceList: { name: 'Bảng giá tháng 8', version: '2026-08' },
    },
  ]);
  assert.match(reply, /150[.]000 VND\/m2/);
  assert.match(reply, /\[PRICE:price-p1\]/);
});

test('AI reply phai trich dung nguon da duoc cap', () => {
  const sources = [{ sourceId: 'doc-123' }];
  assert.equal(validateGroundedReply('Đạt yêu cầu [SRC:doc-123]', sources), true);
  assert.equal(validateGroundedReply('Đạt yêu cầu', sources), false);
  assert.equal(validateGroundedReply('Đạt yêu cầu [SRC:doc-khac]', sources), false);
});

test('admin auth chi bo qua cac endpoint public can thiet', () => {
  assert.equal(isPublicApiRequest('POST', '/webhook/test-slug'), true);
  assert.equal(isPublicApiRequest('GET', '/meta/webhook'), true);
  assert.equal(isPublicApiRequest('GET', '/pipelines'), false);
  assert.equal(isPublicApiRequest('DELETE', '/pipelines/test-id'), false);
});

test('admin auth chan request thieu token va cho request hop le di tiep', () => {
  const middleware = createAdminAuthMiddleware('secret-token');
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalled = false;

  middleware(
    { method: 'GET', path: '/pipelines', headers: {} },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.code, 'ADMIN_AUTH_REQUIRED');
  assert.equal(nextCalled, false);

  middleware(
    {
      method: 'GET',
      path: '/pipelines',
      headers: { authorization: 'Bearer secret-token' },
    },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
});
