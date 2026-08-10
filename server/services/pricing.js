function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function terms(value) {
  return [
    ...new Set(
      normalizeText(value)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 2),
    ),
  ];
}

export function isPriceQuestion(question) {
  return /(giá|gia|báo\s*giá|bao\s*gia|bao\s*nhiêu|bao\s*nhieu|đơn\s*giá|don\s*gia|vnđ|vnd)/i.test(
    String(question || ''),
  );
}

export function rankProducts(products, question, limit = 8) {
  const query = normalizeText(question);
  const queryTerms = terms(question);
  return (products || [])
    .map((product) => {
      const code = normalizeText(product.product_code);
      const name = normalizeText(product.name);
      const dimensions = normalizeText(product.dimensions);
      const haystack = `${code} ${name} ${dimensions} ${normalizeText(product.category)}`;
      let score = code && query.includes(code) ? 100 : 0;
      if (dimensions && query.includes(dimensions)) score += 30;
      score += queryTerms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0);
      return { ...product, score };
    })
    .filter((product) => product.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function validOnDate(priceList, date = new Date()) {
  const current = date.toISOString().slice(0, 10);
  return (
    priceList.approval_status === 'approved' &&
    (!priceList.effective_from || priceList.effective_from <= current) &&
    (!priceList.effective_to || priceList.effective_to >= current)
  );
}

export async function loadApprovedPrices(supabase, question, pipelineId) {
  if (!isPriceQuestion(question)) return [];

  let productQuery = supabase
    .from('product_catalog')
    .select('id, product_code, name, category, dimensions, color, unit')
    .eq('status', 'active')
    .limit(500);
  productQuery = pipelineId
    ? productQuery.or(`pipeline_id.eq.${pipelineId},pipeline_id.is.null`)
    : productQuery.is('pipeline_id', null);

  const { data: products, error: productError } = await productQuery;
  if (productError) throw productError;
  const rankedProducts = rankProducts(products, question);
  if (!rankedProducts.length) return [];

  let listQuery = supabase
    .from('price_lists')
    .select('id, name, version, effective_from, effective_to, approval_status')
    .eq('approval_status', 'approved')
    .limit(100);
  listQuery = pipelineId
    ? listQuery.or(`pipeline_id.eq.${pipelineId},pipeline_id.is.null`)
    : listQuery.is('pipeline_id', null);

  const { data: priceLists, error: listError } = await listQuery;
  if (listError) throw listError;
  const validLists = (priceLists || []).filter((item) => validOnDate(item));
  if (!validLists.length) return [];

  const { data: rows, error: priceError } = await supabase
    .from('product_prices')
    .select('id, price_list_id, product_id, region, customer_group, minimum_quantity, unit_price, currency, unit, notes')
    .in(
      'product_id',
      rankedProducts.map((product) => product.id),
    )
    .in(
      'price_list_id',
      validLists.map((list) => list.id),
    )
    .order('minimum_quantity', { ascending: true })
    .limit(100);
  if (priceError) throw priceError;

  const productById = new Map(rankedProducts.map((product) => [product.id, product]));
  const listById = new Map(validLists.map((list) => [list.id, list]));
  return (rows || []).map((row) => ({
    ...row,
    product: productById.get(row.product_id),
    priceList: listById.get(row.price_list_id),
    sourceId: `price-${row.id}`,
  }));
}

export function formatPriceReply(prices, limit = 5) {
  if (!prices?.length) return '';
  const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const lines = prices.slice(0, limit).map((price) => {
    const product = price.product || {};
    const list = price.priceList || {};
    const conditions = [
      price.region && price.region !== 'all' ? `khu vực ${price.region}` : '',
      Number(price.minimum_quantity) > 0 ? `từ ${formatter.format(price.minimum_quantity)} ${price.unit}` : '',
    ].filter(Boolean);
    return `- ${product.product_code} - ${product.name}: ${formatter.format(price.unit_price)} ${price.currency}/${price.unit}${conditions.length ? ` (${conditions.join(', ')})` : ''} [PRICE:${price.sourceId}]`;
  });
  const list = prices[0].priceList || {};
  return `Giá đang có hiệu lực theo ${list.name || 'bảng giá đã duyệt'}${list.version ? ` - phiên bản ${list.version}` : ''}:\n${lines.join('\n')}`;
}
