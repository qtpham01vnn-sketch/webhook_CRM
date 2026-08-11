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
