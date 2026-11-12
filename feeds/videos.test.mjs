import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validVideo, visibleVideos, videosMarkup} from './content.mjs';
import {latestVideos} from './retain.mjs';
import {parseAtomVideos} from './build.mjs';

const video = (id, date, extra = {}) => ({
  videoId: id, title: `Vídeo ${id}`, url: `https://www.youtube.com/watch?v=${id}`, date, ...extra,
});

test('un vídeo sin id de YouTube no se publica', () => {
  assert.equal(validVideo(video('PrlxasjtlrQ', '2026-10-18')), true);
  assert.equal(validVideo({...video('PrlxasjtlrQ', '2026-10-18'), videoId: ''}), false);
  assert.equal(validVideo({...video('PrlxasjtlrQ', '2026-10-18'), url: 'javascript:alert(1)'}), false);
});

test('se muestran los tres más recientes, en orden', () => {
  const items = [video('aaa1111', '2025-02-20'), video('ccc3333', '2026-10-18'), video('ddd4444', '2026-11-09'),
    video('bbb2222', '2026-10-04')];
  assert.deepEqual(visibleVideos(items).map(item => item.videoId), ['ddd4444', 'ccc3333', 'bbb2222']);
  assert.equal(videosMarkup(items).match(/class="video__slide"/g).length, 3);
});

const entry = (id, date, link = `https://www.youtube.com/watch?v=${id}`) => `
  <entry>
    <id>yt:video:${id}</id>
    <yt:videoId>${id}</yt:videoId>
    <title>Vídeo ${id}</title>
    <link rel="alternate" href="${link}"/>
    <published>${date}T10:00:00+00:00</published>
    <media:group>
      <media:thumbnail url="https://i1.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360"/>
      <media:description>Entrada del vídeo ${id}.</media:description>
    </media:group>
  </entry>`;

test('del feed de YouTube se descartan los Shorts', () => {
  const xml = `<feed>${entry('sss9999', '2026-11-11', 'https://www.youtube.com/shorts/sss9999')}${entry('ddd4444', '2026-11-09')}</feed>`;
  const videos = parseAtomVideos(xml);
  assert.deepEqual(videos.map(item => item.videoId), ['ddd4444']);
  assert.equal(videos[0].url, 'https://www.youtube.com/watch?v=ddd4444');
  assert.equal(videos[0].date, '2026-11-09');
});

test('cuando el feed responde, manda él: un vídeo retirado sale de la portada', () => {
  const previous = [video('ccc3333', '2026-10-18', {image: 'assets/video/c.jpg'}), video('xxx0000', '2026-11-01')];
  const fresh = [video('ddd4444', '2026-11-09'), video('ccc3333', '2026-10-18')];
  const videos = latestVideos(previous, fresh);
  assert.deepEqual(videos.map(item => item.videoId), ['ddd4444', 'ccc3333']);
  assert.equal(videos[1].image, 'assets/video/c.jpg', 'la miniatura ya cacheada se conserva');
});

test('si el feed falla o llega vacío, se conservan los vídeos anteriores', () => {
  const previous = [video('ccc3333', '2026-10-18'), video('bbb2222', '2026-10-04')];
  for (const incoming of [null, undefined, [], [{...video('ccc3333', '2026-10-18'), videoId: ''}]]) {
    assert.deepEqual(latestVideos(previous, incoming).map(item => item.videoId), ['ccc3333', 'bbb2222']);
  }
});

test('el markup mantiene el enlace a YouTube y escapa el título', () => {
  const markup = videosMarkup([video('ccc3333', '2026-10-18', {title: 'Vivienda & <datos>'})]);
  assert.match(markup, /href="https:\/\/www\.youtube\.com\/watch\?v=ccc3333"/);
  assert.match(markup, /data-video-id="ccc3333"/);
  assert.match(markup, /Vivienda &amp; &lt;datos&gt;/);
  assert.doesNotMatch(markup, /<datos>/);
});

test('sin miniatura cacheada se cae a la de YouTube', () => {
  assert.match(videosMarkup([video('ccc3333', '2026-10-18')]), /i\.ytimg\.com\/vi\/ccc3333\/maxresdefault\.jpg/);
  assert.match(videosMarkup([video('ccc3333', '2026-10-18', {image: 'assets/video/abc.jpg'})]), /src="assets\/video\/abc\.jpg"/);
});

test('una lista vacía no genera markup (el HTML publicado se conserva)', () => {
  assert.equal(videosMarkup([]), '');
  assert.equal(videosMarkup(undefined), '');
});
