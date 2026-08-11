export async function forwardLeadToExternalApp(lead) {
  const url = String(process.env.LEAD_FORWARD_URL || '').trim();
  const token = String(process.env.LEAD_FORWARD_TOKEN || '').trim();
  if (!url || !token || !lead) return { forwarded: false, reason: 'not-configured' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Key': token,
      },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`Lead forward loi HTTP ${response.status}.`);
      return { forwarded: false, reason: `http-${response.status}` };
    }
    return { forwarded: true };
  } catch (error) {
    console.error('Lead forward loi:', error.message);
    return { forwarded: false, reason: 'network-error' };
  }
}
