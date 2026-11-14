// Stable dataset identity is independent of PostgreSQL's identity primary key.
export const seedKey = row => `predefined:${row.id}`;
export const questionColumns = Object.freeze(['seed_key', 'question', 'answer', 'unit', 'category', 'difficulty',
  'source_label', 'source_url', 'answer_context', 'reference_date', 'origin', 'status', 'curated_id',
  'generated_at', 'generation_model', 'validated_at', 'verified_at', 'reviewed_at', 'reviewed_by', 'review_notes', 'verification_source_url']);
export function questionValues(row) {
  return [seedKey(row), row.question, String(row.answer), row.unit, row.category, row.difficulty,
    row['src-label'] ?? null, row.src ?? null, row.explanation, row.referenceDate ?? null, 'seed', row.status,
    row.curatedId ?? null, null, null, row.status === 'generated' ? null : row.validatedAt,
    row.status === 'curated' ? row.reviewedAt : null, row.review ? row.reviewedAt : null,
    row.review?.reviewer ?? null, row.review?.notes ?? row.revalidationNotes ?? null, row.review?.sourceUrl ?? null];
}
// Immutable content and lifecycle must match on repeat. Evidence timestamps need
// not match: never rewrite a local review or silently undo a demotion.
export const comparedColumns = questionColumns.filter(column => !['generated_at', 'generation_model', 'validated_at',
  'verified_at', 'reviewed_at', 'reviewed_by', 'review_notes', 'verification_source_url'].includes(column));
