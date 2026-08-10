import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createAdminAuthMiddleware,
  isPublicApiRequest,
} from '../middleware/adminAuth.js';
import { rankKnowledgeDocuments } from '../services/knowledge.js';
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
