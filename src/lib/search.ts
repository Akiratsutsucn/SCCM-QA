/**
 * 操作端搜索。只查已发布文章。排序（可解释）：
 *  1. 标准化错误码 / 别名精确命中（+100）
 *  2. 标题、症状、区分句短语包含（含同义词展开）（+40 / 次）
 *  3. pg_trgm 相似度补充（word_similarity × 30）
 *  4. 同阶段少量加分（+5）
 */
import type { Db } from './db';
import { extractCodes } from './errorcode';
import type { Content } from './content';

export const MAX_QUERY = 200;
const MIN_PHRASE = 2;
const TRGM_MIN = 0.3;

export interface SearchHit {
  id: number;
  slug: string;
  title: string;
  summary: string;
  stage: string;
  codes: string[];
  appliesTo: string;
  notAppliesTo: string;
  score: number;
  codeMatch: boolean;
}

export interface SearchResult {
  query: string;
  codes: string[];
  hits: SearchHit[];
  tooShort: boolean;
}

async function expandSynonyms(db: Db, q: string) {
  const rows = await db.query<{ phrase: string; target_type: string; target_value: string }>(
    `SELECT phrase, target_type, target_value FROM synonyms WHERE position(lower(phrase) IN lower($1)) > 0`,
    [q],
  );
  return {
    phrases: rows.filter((r) => r.target_type === 'phrase').map((r) => r.target_value.toLowerCase()),
    codes: rows.filter((r) => r.target_type === 'code').flatMap((r) => extractCodes(r.target_value)),
    articles: rows.filter((r) => r.target_type === 'article').map((r) => Number(r.target_value)).filter(Number.isFinite),
  };
}

export async function search(db: Db, rawQuery: string, opts: { stage?: string } = {}): Promise<SearchResult> {
  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
  const codes = extractCodes(query);
  const lower = query.toLowerCase();
  if (!query || (codes.length === 0 && [...lower.replace(/\s/g, '')].length < MIN_PHRASE)) {
    return { query, codes, hits: [], tooShort: !!query };
  }
  const syn = await expandSynonyms(db, query);
  const allCodes = [...new Set([...codes, ...syn.codes])];
  const words = lower.split(' ').filter((w) => [...w].length >= MIN_PHRASE);
  const phrases = [...new Set([lower, ...syn.phrases, ...words])];

  const rows = await db.query<{ id: number; slug: string; published: Content; codes: string[]; code_hit: boolean; phrase_hits: number; sim: number }>(
    `SELECT a.id, a.slug, a.published,
            coalesce((SELECT array_agg(code) FROM article_codes c WHERE c.article_id = a.id), '{}') AS codes,
            EXISTS (SELECT 1 FROM article_codes c WHERE c.article_id = a.id AND c.code = ANY($1::text[])) AS code_hit,
            (SELECT count(*) FROM unnest($2::text[]) p WHERE position(p IN a.search_text) > 0)::int AS phrase_hits,
            word_similarity($3, a.search_text) AS sim
       FROM articles a
      WHERE a.status = 'published'
        AND (EXISTS (SELECT 1 FROM article_codes c WHERE c.article_id = a.id AND c.code = ANY($1::text[]))
             OR EXISTS (SELECT 1 FROM unnest($2::text[]) p WHERE position(p IN a.search_text) > 0)
             OR a.id = ANY($4::int[])
             OR word_similarity($3, a.search_text) >= $5)`,
    [allCodes, phrases, lower, syn.articles, TRGM_MIN],
  );
  const hits = rows
    .map((r) => {
      const c = r.published;
      const score = (r.code_hit ? 100 : 0) + r.phrase_hits * 40 + Number(r.sim) * 30
        + (syn.articles.includes(r.id) ? 40 : 0) + (opts.stage && c.stage === opts.stage ? 5 : 0);
      return {
        id: r.id, slug: r.slug, title: c.title, summary: c.summary, stage: c.stage, codes: r.codes,
        appliesTo: c.appliesTo, notAppliesTo: c.notAppliesTo, score, codeMatch: r.code_hit,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh'));
  return { query, codes, hits, tooShort: false };
}
