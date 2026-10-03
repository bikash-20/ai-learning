/**
 * Typed wrappers around the flashcard endpoints. Centralises fetch + error
 * parsing so the page stays focused on UI.
 */
import type {
  FlashCardT,
  FlashDeckT,
  FlashCardGenT,
  FlashDeckGenRequestT,
  FlashDeckGenResponseT,
  FlashDeckAddMoreRequestT,
  FlashDeckPatchT,
  FlashDeckImportRequestT,
  FlashHintRequestT,
  FlashHintResponseT,
  FlashExplainResponseT,
} from '@quantara/shared';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const authed = (init: RequestInit = {}): RequestInit => ({
  credentials: 'include',
  ...init,
  headers: {
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  },
});

/** Throws an Error with the server's `code` field preserved on `.code`. */
const throwIfNotOk = async (res: Response, label: string) => {
  if (res.ok) return;
  const txt = await res.text();
  let code: string | undefined;
  try {
    const j = JSON.parse(txt);
    code = j.code;
  } catch {
    /* not JSON */
  }
  const e = new Error(`${label} (${res.status}): ${txt || 'no body'}`) as Error & { code?: string; status?: number };
  if (code) e.code = code;
  e.status = res.status;
  throw e;
};

export const listDecks = async (): Promise<FlashDeckT[]> => {
  const res = await fetch(`${API}/api/flashcards/decks`, authed());
  await throwIfNotOk(res, 'list decks');
  return (await res.json()) as FlashDeckT[];
};

export const generateDeck = async (req: FlashDeckGenRequestT): Promise<FlashDeckGenResponseT> => {
  const res = await fetch(`${API}/api/flashcards/decks/generate`, authed({ method: 'POST', body: JSON.stringify(req) }));
  await throwIfNotOk(res, 'generate deck');
  return (await res.json()) as FlashDeckGenResponseT;
};

export const saveDeck = async (args: {
  title: string;
  topic: string;
  cards: FlashCardGenT[];
  source?: 'manual' | 'ai';
  aiMeta?: { provider: 'workers' | 'openrouter'; model: string; generatedAt: number };
}): Promise<{ deckId: string; createdCount: number }> => {
  const payload = { source: 'manual' as const, ...args };
  const res = await fetch(`${API}/api/flashcards/decks`, authed({ method: 'POST', body: JSON.stringify(payload) }));
  await throwIfNotOk(res, 'save deck');
  return (await res.json()) as { deckId: string; createdCount: number };
};

export const addMoreCards = async (
  deckId: string,
  req: FlashDeckAddMoreRequestT,
): Promise<{ addedCount: number; generated: number; provider: string; model: string }> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}/cards/more`, authed({ method: 'POST', body: JSON.stringify(req) }));
  await throwIfNotOk(res, 'add more cards');
  return (await res.json()) as { addedCount: number; generated: number; provider: string; model: string };
};

export const renameDeck = async (deckId: string, patch: FlashDeckPatchT): Promise<void> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}`, authed({ method: 'PATCH', body: JSON.stringify(patch) }));
  await throwIfNotOk(res, 'rename deck');
};

export const deleteDeck = async (deckId: string): Promise<void> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}`, authed({ method: 'DELETE' }));
  await throwIfNotOk(res, 'delete deck');
};

export const resetDeck = async (deckId: string): Promise<{ resetCount: number }> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}/reset`, authed({ method: 'POST' }));
  await throwIfNotOk(res, 'reset deck');
  return (await res.json()) as { resetCount: number };
};

export const listCards = async (deckId: string): Promise<FlashCardT[]> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}/cards`, authed());
  await throwIfNotOk(res, 'list cards');
  return (await res.json()) as FlashCardT[];
};

export const reviewCard = async (cardId: string, grade: 0 | 1 | 2 | 3): Promise<{ card: FlashCardT; xpDelta: number }> => {
  const res = await fetch(`${API}/api/flashcards/cards/${encodeURIComponent(cardId)}/review`, authed({ method: 'POST', body: JSON.stringify({ grade }) }));
  await throwIfNotOk(res, 'review card');
  return (await res.json()) as { card: FlashCardT; xpDelta: number };
};

export const getHint = async (cardId: string, req: FlashHintRequestT = {}): Promise<FlashHintResponseT> => {
  const res = await fetch(`${API}/api/flashcards/cards/${encodeURIComponent(cardId)}/hint`, authed({ method: 'POST', body: JSON.stringify(req) }));
  await throwIfNotOk(res, 'get hint');
  return (await res.json()) as FlashHintResponseT;
};

export const explainCard = async (
  cardId: string,
  req: { depth?: 'normal' | 'simpler' | 'deeper'; level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' } = {},
): Promise<FlashExplainResponseT> => {
  const payload = { depth: 'normal' as const, level: 'B2' as const, ...req };
  const res = await fetch(`${API}/api/flashcards/cards/${encodeURIComponent(cardId)}/explain`, authed({ method: 'POST', body: JSON.stringify(payload) }));
  await throwIfNotOk(res, 'explain card');
  return (await res.json()) as FlashExplainResponseT;
};

export const importDeck = async (req: FlashDeckImportRequestT): Promise<{ deckId: string; createdCount: number }> => {
  const res = await fetch(`${API}/api/flashcards/decks/import`, authed({ method: 'POST', body: JSON.stringify(req) }));
  await throwIfNotOk(res, 'import deck');
  return (await res.json()) as { deckId: string; createdCount: number };
};

/** Returns a download URL that the browser opens. Auth via cookie is
 *  needed — wrap in a fetch + blob for download safety. */
export const exportDeck = async (deckId: string, format: 'json' | 'csv'): Promise<{ blob: Blob; filename: string }> => {
  const res = await fetch(`${API}/api/flashcards/decks/${encodeURIComponent(deckId)}/export?format=${format}`, authed());
  await throwIfNotOk(res, 'export deck');
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = cd.match(/filename="([^"]+)"/);
  const filename = m?.[1] ?? `deck.${format}`;
  return { blob: await res.blob(), filename };
};

/** Trigger a browser download of the exported deck. */
export const downloadDeck = async (deckId: string, format: 'json' | 'csv') => {
  const { blob, filename } = await exportDeck(deckId, format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};