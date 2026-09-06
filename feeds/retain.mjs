import {validPost} from './content.mjs';

// Una fuente vacía o incompleta no puede borrar artículos ya publicados.
export function retainPosts(previous, incoming, limit = 60) {
  const byURL = new Map();
  for (const item of (Array.isArray(previous) ? previous : []).filter(validPost)) byURL.set(item.url, item);
  for (const item of (Array.isArray(incoming) ? incoming : []).filter(validPost)) {
    const old = byURL.get(item.url) || {};
    byURL.set(item.url, {...old, ...item, date: item.date || old.date || '', image: item.image || old.image || ''});
  }
  return [...byURL.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);
}
