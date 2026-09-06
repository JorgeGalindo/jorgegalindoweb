import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {retainPosts} from './retain.mjs';
import {renderFeeds} from './render.mjs';

const post = {url: 'https://example.com/uno', title: 'Un artículo publicado', date: '2026-03-01', image: 'assets/anterior.png', kind: 'columna'};

test('un fallo o una respuesta vacía no borran artículos anteriores', () => {
  for (const incoming of [null, undefined, [], [{url: post.url, title: ''}]]) {
    assert.deepEqual(retainPosts([post], incoming), [post]);
  }
});

test('una actualización parcial conserva fecha e imagen y no duplica enlaces', () => {
  const merged = retainPosts([post], [{...post, title: 'Título corregido', date: '', image: ''}]);
  assert.deepEqual(merged, [{...post, title: 'Título corregido'}]);
});

test('los artículos nuevos se ordenan sin perder el respaldo de un tema', () => {
  const newer = {...post, url: 'https://example.com/dos', date: '2026-09-01'};
  assert.deepEqual(retainPosts([post], [newer], 3), [newer, post]);
  assert.deepEqual(retainPosts([post], [newer], 1), [newer]);
});

test('el HTML mantiene contenido publicado si los JSON llegan vacíos', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jorge-feeds-'));
  try {
    await mkdir(path.join(root, 'data'));
    const original = '<section id="libro"><h2>Tres millones de viviendas</h2></section>\n<ul class="log__list" data-feed-unified><li>Última copia válida</li></ul>';
    await writeFile(path.join(root, 'index.html'), original);
    for (const [name, content] of Object.entries({log: {items: []}, 'newsletter-tags': {}, events: {events: [], media: []}})) {
      await writeFile(path.join(root, 'data', name + '.json'), JSON.stringify(content));
    }
    assert.equal(await renderFeeds(root), false);
    assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), original);
    await writeFile(path.join(root, 'data/log.json'), JSON.stringify({items: [{...post, title: 'A & B < C'}]}));
    assert.equal(await renderFeeds(root), true);
    const updated = await readFile(path.join(root, 'index.html'), 'utf8');
    assert.ok(updated.includes('<section id="libro"><h2>Tres millones de viviendas</h2></section>'));
    assert.ok(updated.includes('A &amp; B &lt; C'));
    assert.equal(await renderFeeds(root), false);
  } finally { await rm(root, {recursive: true, force: true}); }
});
