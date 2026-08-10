import crypto from 'node:crypto';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isPublicApiRequest(method, path) {
  const verb = String(method || '').toUpperCase();
  const pathname = String(path || '');
  return (
    (verb === 'POST' && /^\/webhook\/[^/]+$/.test(pathname)) ||
    (verb === 'GET' && /^\/embed\/[^/]+\/config$/.test(pathname)) ||
    (verb === 'POST' && /^\/share\/[^/]+\/access$/.test(pathname)) ||
    (verb === 'GET' && /^\/share\/[^/]+\/leads$/.test(pathname)) ||
    (['GET', 'POST'].includes(verb) && pathname === '/meta/webhook')
  );
}

export function createAdminAuthMiddleware(adminToken = process.env.ADMIN_API_TOKEN) {
  return (req, res, next) => {
    if (!adminToken || isPublicApiRequest(req.method, req.path)) return next();

    const authorization = String(req.headers.authorization || '');
    const suppliedToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    if (safeEqual(suppliedToken, adminToken)) return next();
    return res.status(401).json({
      code: 'ADMIN_AUTH_REQUIRED',
      message: 'Can ma quan tri de truy cap CRM.',
    });
  };
}
