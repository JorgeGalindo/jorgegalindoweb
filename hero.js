/* La entrada funciona por sí sola, incluso si app.js o los datos no cargan. */
(() => {
  const hero = document.querySelector('.hero--intro');
  const title = hero?.querySelector('[data-typing-title]');
  if (!title || !title.animate) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animations = [], originalHTML = null, watchdog;
  let generation = 0, ready = false, played = false;

  const finish = () => {
    generation++;
    clearTimeout(watchdog);
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (originalHTML !== null) title.innerHTML = originalHTML;
    originalHTML = null;
    title.removeAttribute('aria-label');
    hero.classList.remove('is-animating');
    hero.dataset.motion = 'complete';
  };

  const play = () => {
    finish();
    played = true;
    // Entrada sin desplazamientos si se reduce el movimiento.
    const gentle = motion.matches;
    const run = generation;
    originalHTML = title.innerHTML;

    try {
      const visual = title.cloneNode(true);
      const walker = document.createTreeWalker(visual, NodeFilter.SHOW_TEXT);
      const nodes = [], words = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        for (const token of node.textContent.split(/(\s+)/)) {
          if (!token) continue;
          if (/^\s+$/.test(token)) { fragment.append(token); continue; }
          const word = document.createElement('span');
          word.className = 'hero__word';
          word.textContent = token;
          words.push(word);
          fragment.append(word);
        }
        node.replaceWith(fragment);
      }
      // Mantener la puntuación pegada a la palabra destacada al partir líneas.
      for (const emphasis of visual.querySelectorAll('em')) {
        const punctuation = emphasis.nextSibling;
        if (punctuation?.nodeType !== Node.ELEMENT_NODE || !/^[,.;:!?]+$/.test(punctuation.textContent)) continue;
        const group = document.createElement('span');
        group.className = 'hero__keep';
        emphasis.before(group);
        group.append(emphasis, punctuation);
      }
      if (!words.length) { finish(); return; }
      title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
      for (const element of visual.children) element.setAttribute('aria-hidden', 'true');
      title.replaceChildren(...visual.childNodes);
      hero.classList.toggle('is-animating', !gentle);
      hero.dataset.motion = 'playing';

      const stagger = Math.min(65, 1350 / words.length);
      for (const [index, word] of words.entries()) {
        animations.push(word.animate(
          gentle
            ? [{opacity: .08}, {opacity: 1}]
            : [{opacity: 0, transform: 'translateY(.45em)', filter: 'blur(3px)'},
               {opacity: 1, transform: 'translateY(0)', filter: 'blur(0)'}],
          {duration: gentle ? 900 : 750, delay: 140 + index * (gentle ? Math.min(40, stagger) : stagger),
            easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards'}
        ));
      }
      const signature = hero.querySelector('.hero__sig');
      if (signature && !gentle) animations.push(signature.animate(
        [{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'translateY(0)'}],
        {duration: 850, delay: 850, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards'}
      ));
      Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (generation === run) finish();
      });
      watchdog = setTimeout(finish, 4000);
    } catch {
      finish();
    }
  };

  const visible = () => {
    const rect = hero.getBoundingClientRect();
    const navBottom = document.querySelector('[data-nav]')?.getBoundingClientRect().bottom || 0;
    return !document.hidden && rect.top < innerHeight * .8 && rect.bottom > navBottom + 80;
  };
  const start = () => { if (ready && !played && visible()) play(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') finish(); });
  motion.addEventListener('change', () => { if (motion.matches) finish(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && hero.dataset.motion === 'playing') { finish(); played = false; }
    else start();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(start, {threshold: [0, .2, .6]}).observe(hero);
  else window.addEventListener('scroll', start, {passive: true});
  document.querySelector('.nav__brand[href="#top"]')?.addEventListener('click', () => {
    played = false;
    requestAnimationFrame(start);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { played = false; start(); } });

  // Los idiomas pueden actualizar el texto sin que una animación restaure una copia antigua.
  hero.addEventListener('hero:before-update', () => { finish(); played = false; });
  hero.addEventListener('hero:updated', () => { ready = true; start(); });
  // Este límite permite arrancar aunque los módulos o las peticiones fallen.
  setTimeout(() => { ready = true; start(); }, 200);
})();
