import assert from 'node:assert/strict';
import test from 'node:test';
import { forwardLeadToExternalApp } from '../services/leadForwarder.js';

test('khong forward lead khi chua cau hinh', async () => {
  const previousUrl = process.env.LEAD_FORWARD_URL;
  const previousToken = process.env.LEAD_FORWARD_TOKEN;
  delete process.env.LEAD_FORWARD_URL;
  delete process.env.LEAD_FORWARD_TOKEN;
  try {
    const result = await forwardLeadToExternalApp({ phone: '0909000111' });
    assert.deepEqual(result, { forwarded: false, reason: 'not-configured' });
  } finally {
    if (previousUrl !== undefined) process.env.LEAD_FORWARD_URL = previousUrl;
    if (previousToken !== undefined) process.env.LEAD_FORWARD_TOKEN = previousToken;
  }
});
