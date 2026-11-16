import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getPool } from "./pool.mjs";
import { questionColumns } from "./seed-statements.mjs";

export async function assertQuestionSchema(client) {
	const { rows } = await client.query(`SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'questions'`);
	const columns = new Set(rows.map(row => row.column_name));
	const missingColumns = ['id', ...questionColumns, 'created_at', 'updated_at'].filter(column => !columns.has(column));
	if (missingColumns.length) {
		throw Object.assign(new Error(`Incompatible questions schema; missing columns: ${missingColumns.join(', ')}. For a fresh database, run npm run db:schema before npm run db:seed. For an existing table, review db/upgrade-question-lifecycle.sql. Regenerate saved schema SQL with npm run db:export:schema before using it to recreate a database.`), {
			code: 'QUESTION_SCHEMA_MISMATCH', missingColumns,
		});
	}
}

export async function applySchema(client) {
	const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
	await client.query(sql);
	await applyLabSchema(client);
	await applyTraceSchema(client);
}

export async function applyLabSchema(client) {
	await client.query(await readFile(new URL('./lab-schema.sql', import.meta.url), 'utf8'));
	await applyCooldownSchema(client);
}

export async function applyCooldownSchema(client) {
	await client.query(await readFile(new URL('./openrouter-cooldowns-schema.sql', import.meta.url), 'utf8'));
}

export async function applyRecoverySchema(client) {
	await applyCooldownSchema(client);
	await applyTraceSchema(client);
}

export async function applyTraceSchema(client) {
	await client.query(await readFile(new URL('./openrouter-traces-schema.sql', import.meta.url), 'utf8'));
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	let pool;
	try {
		pool = getPool();
		if (process.argv.includes('--recovery-only')) await applyRecoverySchema(pool);
		else if (process.argv.includes('--traces-only')) await applyTraceSchema(pool);
		else if (process.argv.includes('--lab-only')) await applyLabSchema(pool);
		else await applySchema(pool);
		console.log("Question schema initialized. Existing data was preserved.");
	} catch (error) {
		console.error(
			"Schema initialization failed. Check DATABASE_URL, connectivity, permissions, and schema compatibility.",
			{ code: error.code || "CONFIGURATION_ERROR" },
		);
		process.exitCode = 1;
	} finally {
		await pool?.end();
	}
}
