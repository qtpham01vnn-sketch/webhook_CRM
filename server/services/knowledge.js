function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

const SEARCH_STOP_TERMS = new Set([
  'anh', 'bao', 'ban', 'ben', 'cho', 'chi', 'chua', 'cua', 'duoc', 'em', 'gi',
  'hay', 'khong', 'la', 'minh', 'mot', 'nhieu', 'nhe', 'noi', 'the', 'ten',
  'thi', 'toi', 'voi',
]);

function queryTerms(question) {
  return [
    ...new Set(
      normalizeText(question)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3 && !SEARCH_STOP_TERMS.has(term)),
    ),
  ];
}

function documentIsEffective(document, now = new Date()) {
  const current = now.toISOString().slice(0, 10);
  return (
    document.enabled !== false &&
    (document.approval_status || 'approved') === 'approved' &&
    (!document.effective_from || document.effective_from <= current) &&
    (!document.effective_to || document.effective_to >= current)
  );
}

export function rankKnowledgeDocuments(documents, question, limit = 5) {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  const normalizedQuestion = normalizeText(question);

  return (documents || [])
    .filter((document) => documentIsEffective(document))
    .map((document) => {
      const title = normalizeText(document.title);
      const source = normalizeText(document.source_label);
      const content = normalizeText(document.content);
      let score = title && normalizedQuestion.includes(title) ? 20 : 0;
      let matchedTermCount = 0;
      score += terms.reduce(
        (total, term) => {
          const titleMatch = title.includes(term);
          const sourceMatch = source.includes(term);
          const contentMatches = Math.min(content.split(term).length - 1, 6);
          if (titleMatch || sourceMatch || contentMatches > 0) matchedTermCount += 1;
          return total + (titleMatch ? 6 : 0) + (sourceMatch ? 4 : 0) + contentMatches;
        },
        0,
      );
      return {
        ...document,
        score,
        matchedTermCount,
        strongSingleTermMatch: terms.some(
          (term) => title.includes(term) || source.includes(term),
        ),
      };
    })
    .filter(
      (document) =>
        document.score >= 3 &&
        (document.matchedTermCount >= 2 || document.strongSingleTermMatch),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function loadKnowledgeContext(supabase, question, pipelineId) {
  let query = supabase
    .from('knowledge_documents')
    .select(
      'id, title, document_type, source_label, version, page_reference, effective_from, effective_to, approval_status, content, metadata, enabled',
    )
    .eq('enabled', true)
    .eq('approval_status', 'approved')
    .limit(1000);

  query = pipelineId
    ? query.or(`pipeline_id.eq.${pipelineId},pipeline_id.is.null`)
    : query.is('pipeline_id', null);

  const { data, error } = await query;
  if (error) throw error;

  const ranked = rankKnowledgeDocuments(data, question);
  let usedCharacters = 0;
  const sources = [];

  for (const document of ranked) {
    const remaining = 12_000 - usedCharacters;
    if (remaining <= 0) break;
    const excerpt = String(document.content || '').slice(0, Math.min(remaining, 3500));
    usedCharacters += excerpt.length;
    sources.push({
      id: document.id,
      sourceId: `doc-${document.id}`,
      title: document.title,
      documentType: document.document_type,
      sourceLabel: document.source_label,
      version: document.version,
      pageReference: document.page_reference,
      effectiveFrom: document.effective_from,
      effectiveTo: document.effective_to,
      excerpt,
      score: document.score,
    });
  }

  return sources;
}
