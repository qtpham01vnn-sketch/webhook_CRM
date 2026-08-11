import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroundedDataRouter } from '../routes/groundedData.js';

function createSupabaseMock(calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      const query = {
        update(value) {
          calls.push(['update', value]);
          return query;
        },
        eq(column, value) {
          calls.push(['eq', column, value]);
          return query;
        },
        contains(column, value) {
          calls.push(['contains', column, value]);
          return query;
        },
        in(column, value) {
          calls.push(['in', column, value]);
          return query;
        },
        async select() {
          return { data: [{ id: 'doc-1', approval_status: 'approved' }], error: null };
        },
      };
      return query;
    },
  };
}

test('duyet mot file cap nhat tat ca khoi theo file_hash va pipeline', async () => {
  const calls = [];
  const router = createGroundedDataRouter({ supabase: createSupabaseMock(calls) });
  const route = router.stack.find((layer) => layer.route?.path === '/knowledge-sources/approval');
  const req = {
    body: {
      pipeline_id: 'pipeline-1',
      file_hash: 'hash-file-1',
      approval_status: 'approved',
    },
  };
  let responseBody;
  const res = {
    status() { return this; },
    json(value) { responseBody = value; return this; },
  };
  await route.route.stack[0].handle(req, res, (error) => { throw error; });
  assert.equal(responseBody.updated, 1);
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'pipeline_id' && call[2] === 'pipeline-1'));
  assert.ok(calls.some((call) => call[0] === 'contains' && call[1] === 'metadata' && call[2].file_hash === 'hash-file-1'));
});

test('test AI chi tim trong tai lieu da duyet cua pipeline', async () => {
  const document = {
    id: 'doc-1',
    pipeline_id: 'pipeline-1',
    title: 'Tiêu chuẩn độ hút nước',
    document_type: 'technical_standard',
    source_label: 'TC 09.02 2022.xlsx',
    version: '',
    page_reference: 'Sheet BTP, dòng 10-20',
    approval_status: 'approved',
    content: 'Độ hút nước của sản phẩm không vượt quá 0,5 phần trăm.',
    metadata: {},
    enabled: true,
  };
  const supabase = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        or() { return query; },
        is() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: [document], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'disabled';
  try {
    const router = createGroundedDataRouter({ supabase });
    const route = router.stack.find((layer) => layer.route?.path === '/test-ai');
    const req = { body: { pipeline_id: 'pipeline-1', question: 'Độ hút nước là bao nhiêu?' } };
    let responseBody;
    const res = { json(value) { responseBody = value; return this; } };
    await route.route.stack[0].handle(req, res, (error) => { throw error; });
    assert.equal(responseBody.provider, 'disabled');
    assert.equal(responseBody.configured, false);
    assert.equal(responseBody.sources[0].file_name, 'TC 09.02 2022.xlsx');
    assert.match(responseBody.answer, /\[SRC:doc-doc-1\]/);
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
  }
});
