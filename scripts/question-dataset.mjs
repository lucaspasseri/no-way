// Offline manifest workflow; each mutation is checked before an atomic replacement.
import { parseArgs } from 'node:util';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { transitionQuestion, validateBank, assertStatus } from '../db/question-lifecycle.mjs';
import { candidateSchema, similarQuestion } from '../db/question-validation.mjs';
import { parseVerifiedAnswer } from '../db/question-repository.mjs';
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  bank: { type: 'string', default: 'db/seed/questions.json' }, file: { type: 'string' },
  status: { type: 'string', default: 'all' }, reviewer: { type: 'string' }, notes: { type: 'string' },
  source: { type: 'string' }, 'verified-answer': { type: 'string' }, 'independently-verified': { type: 'boolean' },
} });
try {
  const bank = JSON.parse(await readFile(values.bank, 'utf8'));
  validateBank(bank);
  const [command, id, ...extra] = positionals;
  if (extra.length) throw new Error('Unexpected arguments.');
  if (command === 'list' && id === undefined) {
    assertStatus(values.status, true);
    console.log(JSON.stringify(bank.filter(row => values.status === 'all' || row.status === values.status), null, 2));
  } else if (command === 'check' && id === undefined) {
    validateBank(bank, { sequential: true });
    console.log(JSON.stringify(Object.fromEntries(['generated', 'validated', 'curated'].map(status => [status, bank.filter(row => row.status === status).length]))));
  } else {
    if (command === 'import' && id === undefined) {
      const inputs = JSON.parse(await readFile(values.file, 'utf8'));
      if (!Array.isArray(inputs) || !inputs.length) throw new Error('Import a nonempty candidate array.');
      for (const input of inputs) {
        const candidate = candidateSchema.parse(input);
        if (bank.some(row => similarQuestion(row.question, candidate.question))) throw new Error('Duplicate import.');
        const { sourceUrl, referenceDate, ...fields } = candidate;
        bank.push({ id: Math.max(0, ...bank.map(row => row.id)) + 1, ...fields, src: sourceUrl, referenceDate, status: 'generated' });
      }
    } else {
      if (!['validate', 'curate', 'demote'].includes(command) || !/^\d+$/.test(id ?? '')) throw new Error('Use list, check, import --file candidates.json, validate ID, curate ID, or demote ID --status generated|validated.');
      const index = bank.findIndex(row => row.id === Number(id));
      if (index < 0) throw new Error('Unknown dataset ID.');
      const target = command === 'validate' ? 'validated' : command === 'curate' ? 'curated' : values.status;
      if (command === 'demote' && !['generated', 'validated'].includes(target)) throw new Error('Demote to generated or validated.');
      bank[index] = transitionQuestion(bank[index], target, { existing: bank,
        at: new Date().toISOString(),
        nextCuratedId: Math.max(0, ...bank.map(row => row.curatedId ?? 0)) + 1,
        evidence: { reviewer: values.reviewer, notes: values.notes, ...(command === 'curate' && {
          sourceUrl: values.source, verifiedAnswer: parseVerifiedAnswer(values['verified-answer']), independentlyVerified: values['independently-verified'],
        }) },
      });
    }
    validateBank(bank);
    const temporary = `${values.bank}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(bank, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, values.bank);
    console.log('Dataset updated.');
  }
} catch (error) { console.error('Dataset command failed:', error.message); process.exitCode = 1; }
