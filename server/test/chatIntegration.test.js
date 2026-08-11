import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatIntegrationRouter } from '../routes/chatIntegration.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('API tich hop tu choi key sai', async () => {
  const previous = process.env.CHAT_INTEGRATION_TOKEN;
  process.env.CHAT_INTEGRATION_TOKEN = 'secret';
  try {
    const router = createChatIntegrationRouter({ supabase: {} });
    const route = router.stack.find((layer) => layer.route?.path === '/chat/query');
    const res = responseRecorder();
    await route.route.stack[0].handle(
      { body: { question: 'Xin chào' }, get: () => 'wrong' },
      res,
      (error) => { throw error; },
    );
    assert.equal(res.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.CHAT_INTEGRATION_TOKEN;
    else process.env.CHAT_INTEGRATION_TOKEN = previous;
  }
});

test('API tich hop tra danh sach file da duyet cua dung pipeline', async () => {
  const previousToken = process.env.CHAT_INTEGRATION_TOKEN;
  const previousClient = process.env.CLIENT_URL;
  process.env.CHAT_INTEGRATION_TOKEN = 'secret';
  process.env.CLIENT_URL = 'https://webhook-crm-client.vercel.app';
  const documents = [
    {
      title: 'Than cục',
      source_label: 'TC.09.01.docx',
      document_type: 'technical_standard',
      version: '',
      metadata: { file_hash: 'hash-1' },
    },
    {
      title: 'Than cục phần 2',
      source_label: 'TC.09.01.docx',
      document_type: 'technical_standard',
      version: '',
      metadata: { file_hash: 'hash-1' },
    },
  ];
  const supabase = {
    from(table) {
      let selected = '';
      let eqColumn = '';
      const query = {
        select(value) { selected = value; return query; },
        eq(column) { eqColumn = column; return query; },
        or() { return query; },
        is() { return query; },
        limit() { return query; },
        async maybeSingle() {
          if (selected === 'id' && eqColumn === 'webhook_slug') {
            return { data: { id: 'pipeline-1' }, error: null };
          }
          return { data: { webhook_slug: 'test-fanpage' }, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: table === 'knowledge_documents' ? documents : [], error: null })
            .then(resolve, reject);
        },
      };
      return query;
    },
  };
  try {
    const router = createChatIntegrationRouter({ supabase });
    const route = router.stack.find((layer) => layer.route?.path === '/chat/query');
    const res = responseRecorder();
    await route.route.stack[0].handle(
      {
        body: { question: 'Tài liệu đang dùng gồm file nào?', pipeline_slug: 'test-fanpage' },
        get: () => 'secret',
      },
      res,
      (error) => { throw error; },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.provider, 'friendly-handoff');
    assert.match(res.body.response, /1 file đã duyệt/);
    assert.match(res.body.response, /TC[.]09[.]01[.]docx/);
  } finally {
    if (previousToken === undefined) delete process.env.CHAT_INTEGRATION_TOKEN;
    else process.env.CHAT_INTEGRATION_TOKEN = previousToken;
    if (previousClient === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = previousClient;
  }
});
