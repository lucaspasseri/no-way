// Run manually: node --import ./tests/register.mjs tests/lab-preview.mjs
// Uses a source copy, temporary PostgreSQL and deterministic provider fixtures.
import { writeFile } from 'node:fs/promises';
import { startIsolatedPreview } from './isolated-preview.mjs';

const preview = await startIsolatedPreview({ port: Number(process.env.LAB_PREVIEW_PORT || 3107) });
const state = { baseURL: preview.baseURL, app: preview.app };
await writeFile('/tmp/no-way-lab-preview.json', JSON.stringify(state));
console.log(JSON.stringify(state));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => preview.close().then(() => process.exit()));
preview.child.once('exit', () => preview.close());
