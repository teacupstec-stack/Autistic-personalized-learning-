import type { IntentMessage } from '../types';

export const INTENTS: IntentMessage[] = ['Help', 'Break', 'Finished', 'Yes', 'No'];
type Example = { intent: IntentMessage; embedding: number[]; timestamp: string };
const key = (id: string) => `pusg-memory-v1:${encodeURIComponent(id)}`;

export function readMemory(id: string): Example[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key(id)) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is Example => e && INTENTS.includes(e.intent) &&
      Array.isArray(e.embedding) && e.embedding.length === 64 &&
      e.embedding.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) &&
      typeof e.timestamp === 'string');
  } catch { return []; }
}

export function remember(id: string, intent: IntentMessage, embedding: number[]) {
  if (embedding.length !== 64 || !embedding.every(Number.isFinite)) throw new Error('Invalid gesture embedding.');
  const norm = Math.hypot(...embedding);
  if (norm < 1e-6) throw new Error('Empty gesture embedding.');
  const examples = readMemory(id);
  const same = examples.filter(e => e.intent === intent).slice(-19);
  const updated = [...examples.filter(e => e.intent !== intent), ...same,
    { intent, embedding: embedding.map(v => v / norm), timestamp: new Date().toISOString() }];
  // Write before reporting success: quota/private-mode failures must remain visible.
  localStorage.setItem(key(id), JSON.stringify(updated));
}

export function personalPrototypes(id: string): (number[] | null)[] {
  const examples = readMemory(id);
  return INTENTS.map(intent => {
    const matching = examples.filter(e => e.intent === intent);
    if (!matching.length) return null;
    const mean = Array.from({ length: 64 }, (_, i) =>
      matching.reduce((sum, e) => sum + e.embedding[i], 0) / matching.length);
    const norm = Math.hypot(...mean);
    return norm > 1e-6 ? mean.map(v => v / norm) : null;
  });
}

export function clearMemory(id: string) { localStorage.removeItem(key(id)); }
