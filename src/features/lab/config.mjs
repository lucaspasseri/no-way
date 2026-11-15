import { z } from 'zod';

export const knowledgeLevels = ['any', 'kindergarten', 'elementary', 'high-school', 'college', 'expert', 'custom'];
const preferenceText = z.string().trim().min(2).max(160)
  .regex(/^[\p{L}\p{N}\p{P}\p{Zs}+]+$/u)
  .refine(value => value.isWellFormed(), 'Use a short, plain-text description.')
  .refine(value => !/\b(ignore|override|system prompt|instructions|api key|password|porn|sexual|suicide|self.harm|explosive|weapon)\b/i.test(value), 'Choose a family-friendly trivia topic or learning level.');

export const labConfigSchema = z.strictObject({
  count: z.union([z.literal(10), z.literal(15), z.literal(20)]),
  topicMode: z.enum(['categories', 'custom', 'surprise']),
  categories: z.array(z.string().min(1).max(50)).max(3).default([]),
  topic: z.union([z.literal(''), preferenceText]).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  knowledge: z.enum(knowledgeLevels).default('any'),
  challenge: z.union([z.literal(''), preferenceText]).default(''),
}).superRefine((value, ctx) => {
  if (value.topicMode === 'categories' && (value.categories.length === 0 || new Set(value.categories).size !== value.categories.length)) {
    ctx.addIssue({ code: 'custom', path: ['categories'], message: 'Choose one to three distinct categories.' });
  }
  if (value.topicMode === 'custom' && !value.topic) ctx.addIssue({ code: 'custom', path: ['topic'], message: 'Describe a topic.' });
  if (value.knowledge === 'custom' && !value.challenge) ctx.addIssue({ code: 'custom', path: ['challenge'], message: 'Describe your challenge level.' });
});

export const packIdSchema = z.uuid();
export const defaultLabConfig = { count: 10, topicMode: 'surprise', categories: [], topic: '', difficulty: 'mixed', knowledge: 'any', challenge: '' };
export const labChunkSize = 2;
export const maxAttempts = count => Math.ceil(count / labChunkSize) + 2;

export function topicLabel(config) {
  return config.topicMode === 'custom' ? config.topic : config.topicMode === 'surprise' ? 'A curious mix' : config.categories.join(' + ');
}

/** A finite pack never wraps or silently falls back to the curated pool. */
export function nextPackQuestion(questions, seen, mode = 'next', random = Math.random) {
  const remaining = questions.filter(question => !seen.includes(question.id));
  return remaining[mode === 'random' ? Math.floor(random() * remaining.length) : 0] ?? null;
}
