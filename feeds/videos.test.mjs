import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validVideo, visibleVideos, videosMarkup} from './content.mjs';

const video = (id, date, extra = {}) => ({
  videoId: id, title: `Vídeo ${id}`, url: `https://www.youtube.com/watch?v=${id}`, date, ...extra,
});

test('un vídeo sin id de YouTube no se publica', () => {
  assert.equal(validVideo(video('PrlxasjtlrQ', '2026-10-18')), true);
  assert.equal(validVideo({...video('PrlxasjtlrQ', '2026-10-18'), videoId: ''}), false);
  assert.equal(validVideo({...video('PrlxasjtlrQ', '2026-10-18'), url: 'javascript:alert(1)'}), false);
});

test('se muestran los dos más recientes, en orden', () => {
  const items = [video('aaa1111', '2025-02-20'), video('ccc3333', '2026-10-18'), video('bbb2222', '2026-10-04')];
  assert.deepEqual(visibleVideos(items).map(item => item.videoId), ['ccc3333', 'bbb2222']);
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
