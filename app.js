import {logMarkup, tagMarkup, eventsMarkup, mediaMarkup} from './feeds/content.mjs';

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
const translations = getJSON('data/i18n.json?v=20260906').catch(() => null);
const feeds = Promise.allSettled(['log', 'events', 'newsletter-tags'].map(name => getJSON(`data/${name}.json`)));
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

feeds.then(([log, events, tags]) => {
  const update = (selector, markup) => {
    const element = document.querySelector(selector);
    if (element && markup.trim()) element.innerHTML = markup;
  };
  if (log.status === 'fulfilled') update('[data-feed-unified]', logMarkup(log.value?.items));
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
