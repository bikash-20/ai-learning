import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const Vocab = z.object({
  word: z.string(),
  pos: z.enum(['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'interj']),
  definition: z.string(),
  examples: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
});

const Grammar = z.object({
  topic: z.string(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  explanation: z.string(),
  examples: z.array(z.string()),
});

type Mode = 'local' | 'remote';

const file = (n: string) => readFile(resolve(import.meta.dirname, `../content/${n}.json`), 'utf8').then(JSON.parse);

const seed = async (mode: Mode) => {
  const [vocabRaw, grammarRaw] = await Promise.all([file('vocab'), file('grammar')]);
  const vocab = z.array(Vocab).parse(vocabRaw);
  const grammar = z.array(Grammar).parse(grammarRaw);

  const dbUrl = mode === 'remote'
    ? process.env.CF_D1_URL
    : (process.env.CF_D1_LOCAL_URL ?? 'http://127.0.0.1:8787');
  const auth = process.env.CF_D1_TOKEN;
  if (!dbUrl) throw new Error('CF_D1_URL / CF_D1_LOCAL_URL missing');

  const exec = (sql: string, params: unknown[]) =>
    fetch(`${dbUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify({ sql, params }),
    }).then((r) => {
      if (!r.ok) throw new Error(`seed insert failed: ${r.status} ${r.statusText}`);
      return r.json();
    });

  console.log(`[seed] mode=${mode} vocab=${vocab.length} grammar=${grammar.length}`);

  for (const v of vocab) {
    const id = randomUUID();
    await exec(
      `INSERT OR REPLACE INTO vocab (id, word, pos, examples, level, definition, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, v.word, v.pos, JSON.stringify(v.examples), v.level, v.definition, JSON.stringify(v.tags)],
    );
  }
  for (const g of grammar) {
    const id = randomUUID();
    await exec(
      `INSERT OR REPLACE INTO grammar (id, topic, level, explanation, examples) VALUES (?, ?, ?, ?, ?)`,
      [id, g.topic, g.level, g.explanation, JSON.stringify(g.examples)],
    );
  }
  console.log('[seed] done');
};

const mode: Mode = (process.argv[2] as Mode) ?? 'local';
await seed(mode);