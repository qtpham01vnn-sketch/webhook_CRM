function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function queryTerms(question) {
  return [
    ...new Set(
      normalizeText(question)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3),
    ),
  ];
}

export function rankKnowledgeDocuments(documents, question, limit = 4) {
  const terms = queryTerms(question);
  if (!terms.length) return [];

  return (documents || [])
    .map((document) => {
      const title = normalizeText(document.title);
      const content = normalizeText(document.content);
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 5 : 0) +
          Math.min(content.split(term).length - 1, 5),
        0,
      );
      return { ...document, score };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function loadKnowledgeContext(supabase, question, pipelineId) {
  let query = supabase
    .from('knowledge_documents')
    .select('id, title, source_label, content')
    .eq('enabled', true)
    .limit(100);

  if (pipelineId) {
    query = query.or(`pipeline_id.eq.${pipelineId},pipeline_id.is.null`);
  } else {
    query = query.is('pipeline_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const ranked = rankKnowledgeDocuments(data, question);
  let usedCharacters = 0;
  const sources = [];

  for (const document of ranked) {
    const remaining = 9000 - usedCharacters;
    if (remaining <= 0) break;
    const excerpt = String(document.content || '').slice(0, remaining);
    usedCharacters += excerpt.length;
    sources.push({
      title: document.title,
      sourceLabel: document.source_label,
      excerpt,
    });
  }

  return sources;
}
