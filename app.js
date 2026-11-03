import {logMarkup, tagMarkup, eventsMarkup, mediaMarkup, videosMarkup} from './feeds/content.mjs';

const getJSON = async path => {
  const response = await fetch(path, {cache: 'no-cache', signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

/* Anclajes: misma navegación, con espacio para la cabecera y sección activa. */
const nav = document.querySelector('[data-nav]');
const sectionLinks = [...document.querySelectorAll('.nav__list a[href^="#"]')];
const sections = sectionLinks.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
let scrollPending = false;
const updateNavigation = () => {
  scrollPending = false;
  nav?.classList.toggle('is-scrolled', window.scrollY > 4);
  const cutoff = (nav?.getBoundingClientRect().height || 0) + 40;
  let active = '';
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= cutoff) active = section.id;
  }
  for (const link of sectionLinks) {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
};
const measureNavigation = () => {
  if (nav) document.documentElement.style.setProperty('--anchor-offset', `${Math.ceil(nav.getBoundingClientRect().height) + 20}px`);
  updateNavigation();
};
if (nav && 'ResizeObserver' in window) new ResizeObserver(measureNavigation).observe(nav);
window.addEventListener('resize', measureNavigation, {passive: true});
window.addEventListener('scroll', () => {
  if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateNavigation); }
}, {passive: true});
measureNavigation();

/* Las traducciones y los feeds se descargan a la vez. El HTML ya es legible. */
const translations = getJSON('data/i18n.json?v=20261103b').catch(() => null);
const feeds = Promise.allSettled(['log', 'events', 'newsletter-tags', 'videos'].map(name => getJSON(`data/${name}.json`)));
const languages = ['es', 'en', 'ca'];
const requested = new URLSearchParams(location.search).get('lang');
const saved = (() => { try { return localStorage.getItem('jg.lang'); } catch { return null; } })();
const preferred = languages.includes(requested) ? requested : languages.includes(saved) ? saved : 'es';
if (languages.includes(requested)) { try { localStorage.setItem('jg.lang', requested); } catch {} }

translations.then(all => {
  const hero = document.querySelector('.hero--intro');
  hero?.dispatchEvent(new Event('hero:before-update'));
  const dictionary = all?.[preferred];
  const lang = dictionary ? preferred : 'es';
  document.documentElement.lang = lang;
  document.querySelectorAll('.nav__lang [data-lang]').forEach(link => {
    const active = link.dataset.lang === lang;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = dictionary?.[element.dataset.i18n];
    if (value == null) return;
    if (element.dataset.i18nAttr) element.setAttribute(element.dataset.i18nAttr, value);
    else element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const value = dictionary?.[element.dataset.i18nHtml];
    if (value != null) element.innerHTML = value;
  });
  const hello = document.querySelector('[data-typing-hello]');
  if (hello && dictionary?.['hero.hello']) {
    hello.firstChild.textContent = dictionary['hero.hello'];
  }
  hero?.dispatchEvent(new Event('hero:updated'));
  measureNavigation();
});

const preserveAnchor = () => document.querySelectorAll('[data-lang]').forEach(link => {
  link.hash = location.hash;
});
window.addEventListener('hashchange', preserveAnchor);
preserveAnchor();


/* ─── vídeo: carrusel + embed diferido ───────────────────────────────────────
   La miniatura es un enlace a YouTube; aquí lo interceptamos para montar el
   reproductor en el sitio. Sin este script la sección sigue funcionando: se
   desplaza con el dedo y los enlaces llevan a YouTube. */
const videoCarousel = (() => {
  const carousel = document.querySelector('[data-video-carousel]');
  const track = carousel?.querySelector('[data-videos]');
  if (!carousel || !track) return () => {};
  const controls = carousel.querySelector('[data-video-controls]');
  const dots = carousel.querySelector('[data-video-dots]');
  const previous = carousel.querySelector('[data-video-prev]');
  const next = carousel.querySelector('[data-video-next]');

  const slides = () => [...track.querySelectorAll('.video__slide')];
  const step = () => {
    const list = slides();
    return list.length > 1 ? list[1].offsetLeft - list[0].offsetLeft : 0;
  };
  const index = () => {
    const distance = step();
    return distance > 0 ? Math.round(track.scrollLeft / distance) : 0;
  };
  const go = position => {
    const list = slides();
    const target = Math.max(0, Math.min(position, list.length - 1));
    track.scrollTo({left: step() * target, behavior: 'smooth'});
  };

  const sync = () => {
    const list = slides();
    const current = index();
    [...dots.children].forEach((dot, position) => dot.setAttribute('aria-current', String(position === current)));
    if (previous) previous.disabled = current <= 0;
    if (next) next.disabled = current >= list.length - 1;
  };

  previous?.addEventListener('click', () => go(index() - 1));
  next?.addEventListener('click', () => go(index() + 1));

  let pending = false;
  track.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; sync(); });
  }, {passive: true});
  window.addEventListener('resize', sync, {passive: true});

  // Delegado en el track: sobrevive a que los feeds reescriban los slides.
  track.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const poster = event.target.closest('.video__frame[data-video-id]');
    if (!poster || !track.contains(poster)) return;
    event.preventDefault();
    const frame = document.createElement('div');
    frame.className = 'video__frame video__frame--embed';
    const player = document.createElement('iframe');
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(poster.dataset.videoId)}?autoplay=1&rel=0`;
    player.title = poster.dataset.videoTitle || 'YouTube';
    player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allowFullscreen = true;
    player.loading = 'eager';
    frame.append(player);
    poster.replaceWith(frame);
  });

  return () => {
    const list = slides();
    dots.replaceChildren();
    if (!controls) return;
    if (list.length < 2) { controls.hidden = true; return; }
    list.forEach((slide, position) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'video__dot';
      dot.setAttribute('aria-label', slide.querySelector('[data-video-title]')?.dataset.videoTitle?.trim() || String(position + 1));
      dot.addEventListener('click', () => go(position));
      dots.append(dot);
    });
    controls.hidden = false;
    sync();
  };
})();
videoCarousel();

feeds.then(([log, events, tags, videos]) => {
  const update = (selector, markup) => {
    const element = document.querySelector(selector);
    if (!element || !markup.trim()) return false;
    element.innerHTML = markup;
    return true;
  };
  if (log.status === 'fulfilled') update('[data-feed-unified]', logMarkup(log.value?.items));
  if (videos.status === 'fulfilled' && update('[data-videos]', videosMarkup(videos.value?.items))) videoCarousel();
  if (tags.status === 'fulfilled') {
    document.querySelectorAll('[data-obsesion-posts]').forEach(element => {
      update(`[data-obsesion-posts="${element.dataset.obsesionPosts}"]`, tagMarkup(tags.value?.[element.dataset.obsesionPosts]));
    });
  }
  if (events.status === 'fulfilled') {
    update('[data-events]', eventsMarkup(events.value?.events || events.value?.items));
    update('[data-media]', mediaMarkup(events.value?.media));
  }
  updateNavigation();
});
