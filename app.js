(async () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fmtStamp = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = today.getFullYear();

  const todayEl = document.querySelector("[data-today]");
  if (todayEl) todayEl.textContent = fmtStamp(today);

  /* ─── i18n ──────────────────────────────────────────────────────────
     Idioma actual: ?lang=xx en URL → localStorage → 'es' por defecto.
     Aplicamos las traducciones SÍNCRONAMENTE antes de cualquier otra cosa
     (incluido el typing), para que el titular se monte ya con el idioma
     correcto. */
  const SUPPORTED_LANGS = ["es", "en", "ca"];
  const urlLang = new URLSearchParams(location.search).get("lang");
  const storedLang = (() => { try { return localStorage.getItem("jg.lang"); } catch { return null; } })();
  const lang = SUPPORTED_LANGS.includes(urlLang) ? urlLang
             : SUPPORTED_LANGS.includes(storedLang) ? storedLang
             : "es";
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
    try { localStorage.setItem("jg.lang", urlLang); } catch {}
  }

  // marcar el idioma activo en el switcher del nav
  document.querySelectorAll(".nav__lang [data-lang]").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.lang === lang);
  });
  document.documentElement.lang = lang;

  // Traducciones: las cargamos antes de continuar. En caso de fallo, se queda
  // en el idioma original del HTML (es). Usamos no-cache para que cualquier
  // cambio en el JSON (claves nuevas, ediciones) se refleje sin tener que
  // hacer hard-reload — el archivo es pequeño y la revalidación es barata.
  let i18nDict = null;
  try {
    const r = await fetch("data/i18n.json?v=20260502s", { cache: "no-cache" });
    if (r.ok) {
      const all = await r.json();
      i18nDict = all[lang] || null;
    }
  } catch (_) {}

  if (i18nDict) {
    const lookup = (key) => i18nDict[key];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = lookup(el.dataset.i18n);
      if (v == null) return;
      const attr = el.dataset.i18nAttr;
      if (attr) el.setAttribute(attr, v);
      else el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const v = lookup(el.dataset.i18nHtml);
      if (v == null) return;
      el.innerHTML = v;
    });
  }

  const nav = document.querySelector("[data-nav]");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const reveals = document.querySelectorAll(".reveal");
  if (reveals.length && !reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ─── helpers (subidos para que el typing pueda usarlos) ─── */
  const fmtDate = (iso) => (iso || "").replace(/-/g, ".");
  const escapeHtml = (s) =>
    String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  /* ─── hero typing — versión blindada ─────────────────────────
     Estructura: cada palabra es un <span class="word">; dentro, cada char es
     un <span class="char">. Espacios entre palabras son literales (permiten wrap).
     Char no escritos llevan .char--pending (opacity:0).
     Defensas:
       - try/catch externo: si algo falla, restauramos el HTML original y seguimos.
       - watchdog: si tras 25s el typing no terminó, completamos todo de golpe.
       - sin guard de scroll-restoration (era frágil). Click sí completa de golpe.
     Logs en consola con prefijo [typing] para debug rápido. */
  const helloEl = document.querySelector("[data-typing-hello]");
  const titleEl = document.querySelector("[data-typing-title]");

  if (helloEl && titleEl) {
    const titleOriginalHTML = titleEl.innerHTML;       // backup por si algo falla
    let cancelled = false;
    let charSpans = [];

    const finishAllNow = () => {
      if (cancelled) return;
      cancelled = true;
      try {
        helloEl.innerHTML = 'Hola :)<span class="caret" aria-hidden="true">▌</span>';
        charSpans.forEach((el) => el.classList.remove("char--pending"));
        titleEl.classList.add("is-typed");
      } catch (_) {
        // último recurso: restaurar HTML original
        titleEl.innerHTML = titleOriginalHTML;
      }
    };

    // posiciones globales de char donde acaba una phrase (para pausa extra)
    const phraseEndIdx = new Set();

    try {
      // Buscar phrases. Si no hay, tratar todo el titular como una.
      let phraseEls = Array.from(titleEl.querySelectorAll(".phrase"));
      if (!phraseEls.length) phraseEls = [titleEl];

      for (let p = 0; p < phraseEls.length; p++) {
        const phraseEl = phraseEls[p];
        const phraseHTML = phraseEl.innerHTML;
        const tempContainer = document.createElement("div");
        tempContainer.innerHTML = phraseHTML;
        const phrasePlain = (tempContainer.textContent || "").replace(/\s+/g, " ").trim();

        // Detectar <em> dentro de la phrase via DOM (no via i18n)
        const emEl = tempContainer.querySelector("em");
        const emText = emEl ? emEl.textContent.replace(/\s+/g, " ").trim() : null;
        const emRange = emText
          ? (() => {
              const m = phrasePlain.match(new RegExp(emText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
              return m ? { start: m.index, end: m.index + m[0].length } : null;
            })()
          : null;

        const tokens = phrasePlain.split(/(\s+)/);
        const fragments = [];
        let offset = 0;
        for (const token of tokens) {
          if (token === "") continue;
          if (/^\s+$/.test(token)) {
            fragments.push(token);
            offset += token.length;
            continue;
          }
          const wordChars = [];
          for (let k = 0; k < token.length; k++) {
            const globalIdx = offset + k;
            const isEm = emRange && globalIdx >= emRange.start && globalIdx < emRange.end;
            wordChars.push(
              `<span class="char${isEm ? " char--em" : ""} char--pending">${escapeHtml(token[k])}</span>`
            );
          }
          fragments.push(`<span class="word">${wordChars.join("")}</span>`);
          offset += token.length;
        }
        phraseEl.innerHTML = fragments.join("");

        const phraseChars = Array.from(phraseEl.querySelectorAll(".char"));
        charSpans = charSpans.concat(phraseChars);
        if (p < phraseEls.length - 1 && phraseChars.length > 0) {
          phraseEndIdx.add(charSpans.length - 1);
        }
      }

      titleEl.insertAdjacentHTML("beforeend", '<span class="caret-inline" aria-hidden="true">▌</span>');
      console.log("[typing] setup ok ·", charSpans.length, "chars · phrases:", phraseEls.length);

      if (reduceMotion) {
        finishAllNow();
      } else {
        const helloCaret = '<span class="caret" aria-hidden="true">▌</span>';
        const helloText = "Hola :)";
        helloEl.innerHTML = helloCaret;

        const helloSpeed = 90;
        const titleBaseSpeed = 28;
        const PHRASE_PAUSE = 600;
        const pauseFor = (ch) => {
          if (ch === "." || ch === "?" || ch === "!") return 180;
          if (ch === "," || ch === ";" || ch === ":") return 90;
          return 0;
        };

        const typeTitle = () => {
          let k = 0;
          const tickT = () => {
            if (cancelled) return;
            if (k >= charSpans.length) {
              titleEl.classList.add("is-typed");
              console.log("[typing] title done");
              return;
            }
            charSpans[k].classList.remove("char--pending");
            const ch = (charSpans[k].textContent || "").trim();
            const variance = 4 + Math.random() * 12;
            const phraseExtra = phraseEndIdx.has(k) ? PHRASE_PAUSE : 0;
            k++;
            setTimeout(tickT, titleBaseSpeed + variance + pauseFor(ch) + phraseExtra);
          };
          tickT();
        };

        let i = 0;
        const tickH = () => {
          if (cancelled) return;
          if (i >= helloText.length) {
            helloEl.innerHTML = helloText + helloCaret;
            console.log("[typing] hello done, starting title");
            setTimeout(() => { if (!cancelled) typeTitle(); }, 450);
            return;
          }
          i++;
          helloEl.innerHTML = helloText.slice(0, i) + helloCaret;
          setTimeout(tickH, helloSpeed);
        };

        console.log("[typing] starting in 300ms");
        setTimeout(tickH, 300);

        document.addEventListener("click", finishAllNow, { once: true });

        // Watchdog: si en 25s no terminó, completar todo
        setTimeout(() => {
          if (!cancelled) {
            console.warn("[typing] watchdog: completando todo");
            finishAllNow();
          }
        }, 25000);
      }
    } catch (err) {
      console.error("[typing] error, restaurando contenido original:", err);
      titleEl.innerHTML = titleOriginalHTML;
      titleEl.classList.add("is-typed");
      helloEl.innerHTML = 'Hola :)<span class="caret" aria-hidden="true">▌</span>';
    }
  }

  /* ─── render log unificado: una sola lista, etiqueta por origen ─── */
  const tagFor = (kind) => {
    if (kind === "ecpol") return { label: "ecpol", cls: "log__tag log__tag--ecpol" };
    if (kind === "columna") return { label: "el país", cls: "log__tag log__tag--elpais" };
    return { label: kind, cls: "log__tag" };
  };

  const renderUnified = (items, limit = 20) => {
    const el = document.querySelector("[data-feed-unified]");
    if (!el) return;
    if (!items.length) {
      el.innerHTML = `<li class="log__item"><div class="log__body"><p class="log__excerpt">// pronto.</p></div></li>`;
      return;
    }
    el.innerHTML = items.slice(0, limit).map((it) => {
      const tag = tagFor(it.kind);
      return `
        <li class="log__item">
          <span class="log__date">${escapeHtml(fmtDate(it.date))}</span>
          <span class="${tag.cls}">${escapeHtml(tag.label)}</span>
          <h3 class="log__title-link"><a href="${escapeHtml(it.url)}" rel="noopener">${escapeHtml(it.title)}</a></h3>
        </li>`;
    }).join("");
  };

  /* ─── tres bloques de obsesiones, cada uno con los 3 últimos posts del tag ───
     data/newsletter-tags.json viene con cada tag mapeado a [{slug, title, date, image}, ...]
     enriquecido por el builder directamente desde /t/<tag> en Substack. */
  const renderObsesionPosts = (tagMap) => {
    document.querySelectorAll("[data-obsesion-posts]").forEach((el) => {
      const tag = el.dataset.obsesionPosts;
      const items = (tagMap && Array.isArray(tagMap[tag])) ? tagMap[tag] : [];
      if (!items.length) {
        el.innerHTML = `<li><p class="obsesion-block__empty">// pronto.</p></li>`;
        return;
      }
      el.innerHTML = items.slice(0, 3).map((it) => `
        <li>
          <span class="obsesion-block__post-date">${escapeHtml(fmtDate(it.date))}</span>
          <a class="obsesion-block__post-link" href="${escapeHtml(it.url)}" rel="noopener">${escapeHtml(it.title)}</a>
        </li>
      `).join("");
    });
  };

  /* ─── eventos ─── */
  const eventsEl = document.querySelector("[data-events]");
  const renderEvents = (events) => {
    if (!eventsEl || !Array.isArray(events)) return;
    eventsEl.innerHTML = events.map((e) => `
      <li class="directo__item">
        <p class="directo__when">${escapeHtml(e.when)}</p>
        <p class="directo__title">${escapeHtml(e.title)}</p>
        <p class="directo__where">${e.where || ""}</p>
      </li>
    `).join("");
  };

  /* ─── medios destacados ─── */
  const mediaEl = document.querySelector("[data-media]");
  const renderMedia = (items) => {
    if (!mediaEl || !Array.isArray(items)) return;
    // m.title puede traer HTML inline (<em>...</em>, comillas tipográficas) — se renderiza tal cual
    mediaEl.innerHTML = items.map((m) => `
      <li class="directo__item directo__item--media">
        <p class="directo__when">${escapeHtml(m.outlet)}</p>
        <p class="directo__title"><a href="${escapeHtml(m.url)}" rel="noopener">${m.title || ""}</a></p>
        <p class="directo__where">${escapeHtml(m.date || "")}</p>
      </li>
    `).join("");
  };

  /* ─── carga ─── */
  const loadAll = async () => {
    const j = (path) =>
      fetch(path, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

    try {
      const [log, newsletter, events, tagMap] = await Promise.all([
        j("data/log.json").catch(() => null),
        j("data/newsletter.json").catch(() => null),
        j("data/events.json").catch(() => null),
        j("data/newsletter-tags.json").catch(() => null),
      ]);

      const items = (log?.items || []).slice().sort((a, b) =>
        (b.date || "").localeCompare(a.date || "")
      );

      // solo items desde el 1 ene 2025 en adelante
      const SINCE = "2025-01-01";
      const unified = items.filter((x) =>
        (x.kind === "ecpol" || x.kind === "columna") && (x.date || "") >= SINCE
      );
      renderUnified(unified);

      renderObsesionPosts(tagMap || {});
      const eventsList = events?.events || events?.items || (Array.isArray(events) ? events : []);
      const mediaList = events?.media || [];
      renderEvents(eventsList);
      renderMedia(mediaList);
    } catch (e) {
      console.error("feed load:", e);
    }
  };

  loadAll();
})();
