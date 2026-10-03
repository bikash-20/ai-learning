import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const vocab = JSON.parse(await readFile('./content/vocab.json', 'utf8'));
const grammar = JSON.parse(await readFile('./content/grammar.json', 'utf8'));

const escape = (s: string) => s.replace(/'/g, "''");
const json = (x: unknown) => escape(JSON.stringify(x));

const lines: string[] = [];
for (const v of vocab) {
  const id = randomUUID();
  lines.push(
    `INSERT OR REPLACE INTO vocab (id, word, pos, examples, level, definition, tags) VALUES ('${id}', '${escape(v.word)}', '${escape(v.pos)}', '${json(v.examples)}', '${escape(v.level)}', '${escape(v.definition)}', '${json(v.tags ?? [])}');`,
  );
}
for (const g of grammar) {
  const id = randomUUID();
  lines.push(
    `INSERT OR REPLACE INTO grammar (id, topic, level, explanation, examples) VALUES ('${id}', '${escape(g.topic)}', '${escape(g.level)}', '${escape(g.explanation)}', '${json(g.examples)}');`,
  );
}
await writeFile('./seed.sql', lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} INSERT statements to seed.sql`);