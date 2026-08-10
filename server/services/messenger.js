import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const supplied = signatureHeader.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const suppliedBuffer = Buffer.from(supplied, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function extractMessengerTextEvents(payload) {
  if (payload?.object !== 'page' || !Array.isArray(payload.entry)) return [];

  return payload.entry.flatMap((entry) =>
    (entry.messaging || [])
      .filter(
        (event) =>
          event?.sender?.id &&
          event?.recipient?.id &&
          event?.message?.mid &&
          typeof event.message.text === 'string' &&
          !event.message.is_echo,
      )
      .map((event) => ({
        eventId: event.message.mid,
        pageId: String(event.recipient.id),
        senderPsid: String(event.sender.id),
        text: event.message.text.trim().slice(0, 4000),
        timestamp: Number(event.timestamp) || Date.now(),
      }))
      .filter((event) => event.text),
  );
}

export async function sendMessengerText({ pageId, recipientId, text }) {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const graphVersion = process.env.META_GRAPH_API_VERSION || 'v23.0';
  if (!accessToken) throw new Error('Thieu META_PAGE_ACCESS_TOKEN.');

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(pageId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: String(text).slice(0, 2000) },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Meta Send API loi ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}
