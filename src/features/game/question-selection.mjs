import { localeSchema, unitSystemSchema } from '../../i18n/config.mjs';
import { z } from 'zod';
import { categories, difficulties } from '../../../db/question-validation.mjs';

/** @typedef {{ category: string, difficulty: string }} QuestionPreferences */
/** @typedef {{ categories: string[], difficulties: string[], pools: { category: string | null, difficulty: string | null, count: number }[], total: number }} QuestionOptions */

const id = z.number().int().positive().max(2147483647);
export const recentQuestionLimit = 200;
export const selectionSchema = z.strictObject({
  locale: localeSchema.optional(),
  unitSystem: unitSystemSchema.optional(),
  mode: z.enum(['next', 'random']).default('next'),
  category: z.union([z.literal(''), z.enum(categories)]).default(''),
  difficulty: z.union([z.literal(''), z.enum(difficulties)]).default(''),
  after: id.or(z.literal(0)).default(0),
  recent: z.array(id).max(recentQuestionLimit).default([]),
});

export function metadataLabel(value) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export const defaultPreferences = Object.freeze({ category: '', difficulty: '' });
export const preferencesKey = 'no-way:question-preferences';

export function restorePreferences(value, options) {
  try {
    const saved = JSON.parse(value);
    return {
      category: options.categories.includes(saved?.category) ? saved.category : '',
      difficulty: options.difficulties.includes(saved?.difficulty) ? saved.difficulty : '',
    };
  } catch { return defaultPreferences; }
}

export function matchingCount(options, preferences) {
  return options.pools.reduce((sum, pool) => sum + (
    (!preferences.category || pool.category === preferences.category)
    && (!preferences.difficulty || pool.difficulty === preferences.difficulty) ? pool.count : 0), 0);
}

export function rememberQuestion(recent, id) {
  return [...recent.filter(previous => previous !== id), id].slice(-recentQuestionLimit);
}
