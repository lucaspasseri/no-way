import { z } from 'zod';

export const categories = ['science', 'geography', 'history', 'culture', 'sports', 'mathematics', 'technology'];
export const difficulties = ['easy', 'medium', 'hard'];
const text = (min, max) => z.string().trim().min(min).max(max).regex(/^[^\u0000]*$/u);
export const sourceURL = text(1, 2000).url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/\s/.test(value);
});
export const numericalAnswer = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);

// Nullable fields are required in structured output, so providers cannot omit keys.
export const candidateSchema = z.strictObject({
  question: text(20, 1000),
  answer: numericalAnswer,
  unit: text(1, 100),
  category: z.enum(categories),
  difficulty: z.enum(difficulties),
  explanation: text(20, 4000),
  sourceUrl: sourceURL.nullable(),
  referenceDate: z.iso.date().nullable(),
});
export const batchSchema = z.strictObject({ candidates: z.array(candidateSchema).min(1).max(5) });

export function questionError(code, message) {
  return Object.assign(new Error(message), { code });
}

function tokens(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) || [];
}

export function similarQuestion(left, right) {
  const a = tokens(left), b = tokens(right);
  if (a.join('') === b.join('')) return true;
  const first = new Set(a), second = new Set(b);
  const intersection = [...first].filter(word => second.has(word)).length;
  return intersection / new Set([...first, ...second]).size >= 0.85
    || (intersection >= 4 && intersection / Math.min(first.size, second.size) >= 0.95
      && intersection / Math.max(first.size, second.size) >= 0.7);
}

/** Deterministic screening is conservative; it never constitutes factual verification. */
export function validateCandidate(input, existing = []) {
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path.join('.')))];
    throw questionError('INVALID_CANDIDATE', `Invalid candidate fields: ${fields.join(', ')}. Check required text, finite nonnegative answer, units, category, difficulty, URL, and date.`);
  }
  const candidate = parsed.data;
  const wording = candidate.question.toLowerCase();
  if (!wording.endsWith('?') || /\b(best|worst|beautiful|favorite|favourite|in your opinion|roughly|about how)\b/.test(wording)) {
    throw questionError('AMBIGUOUS_QUESTION', 'Use an objective, clearly scoped numerical question ending in a question mark.');
  }
  if (/\b(approximate|approximately|estimated|estimate)\b/.test(wording) && !/\b(nearest|rounded|decimal|according to)\b/.test(wording)) {
    throw questionError('IMPRECISE_QUESTION', 'Specify the reference and rounding rule for approximate values.');
  }
  if (!wording.includes(candidate.unit.toLowerCase()) && !(candidate.unit === 'count' && /\bhow many\b/.test(wording))) {
    throw questionError('MISSING_UNIT', 'Include the answer unit and its scale explicitly in the question. Use count for dimensionless counts.');
  }
  if (/\b(current|currently|latest|today|now|population|gdp|record|ranking|ranked|as of|this year|this month)\b/.test(wording)
    && (!candidate.referenceDate || !wording.includes(candidate.referenceDate))) {
    throw questionError('REFERENCE_DATE_REQUIRED', 'Time-dependent questions must include an explicit YYYY-MM-DD reference date in both the question and referenceDate.');
  }
  if (existing.some(row => similarQuestion(candidate.question, row.question))) {
    throw questionError('DUPLICATE_QUESTION', 'This question duplicates or closely resembles an existing candidate or question.');
  }
  return candidate;
}

export const reviewSchema = z.strictObject({
  reviewer: text(1, 200),
  notes: text(20, 4000),
  sourceUrl: sourceURL,
  verifiedAnswer: numericalAnswer,
  independentlyVerified: z.literal(true),
});
