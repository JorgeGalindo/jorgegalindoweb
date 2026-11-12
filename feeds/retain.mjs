import {validPost, validVideo} from './content.mjs';

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

// YouTube es distinto: el feed del canal trae siempre sus últimos vídeos públicos, así que,
// cuando responde, manda él (un vídeo borrado u oculto sale de la portada en la siguiente
// sincronización). Si falla o llega vacío, se conserva la última copia válida. La miniatura
// ya cacheada se mantiene si esta vez no se ha podido descargar.
export function latestVideos(previous, incoming, limit = 15) {
  const old = new Map((Array.isArray(previous) ? previous : []).filter(validVideo).map(item => [item.videoId, item]));
  const fresh = (Array.isArray(incoming) ? incoming : []).filter(validVideo)
    .map(item => ({...item, image: item.image || old.get(item.videoId)?.image || ''}));
  return (fresh.length ? fresh : [...old.values()])
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);
}
