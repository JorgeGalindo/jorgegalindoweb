import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {logMarkup, tagMarkup, eventsMarkup, mediaMarkup} from './content.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function renderFeeds(root = ROOT) {
  const read = name => readFile(path.join(root, 'data', name + '.json'), 'utf8').then(JSON.parse);
  const [source, log, tags, events] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'), read('log'), read('newsletter-tags'), read('events'),
  ]);
  let html = source;
  const replaceList = (attribute, markup) => {
    if (!markup.trim()) return;
    const pattern = new RegExp(`(<ul\\b[^>]*\\b${attribute}[^>]*>)[\\s\\S]*?(<\\/ul>)`);
    if (!pattern.test(html)) throw new Error(`No se encuentra ${attribute} en index.html`);
    html = html.replace(pattern, (_, start, end) => start + markup + '\n      ' + end);
  };
  replaceList('data-feed-unified', logMarkup(log.items));
  for (const tag of ['desbloquear-oportunidades', 'trabajo-con-maquinas', 'europa-sola']) {
    replaceList(`data-obsesion-posts="${tag}"`, tagMarkup(tags[tag]));
  }
  replaceList('data-events', eventsMarkup(events.events || events.items));
  replaceList('data-media', mediaMarkup(events.media));
  if (html !== source) await writeFile(path.join(root, 'index.html'), html);
  return html !== source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderFeeds().then(changed => console.log(changed ? 'HTML de los feeds actualizado.' : 'HTML de los feeds al día.'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
