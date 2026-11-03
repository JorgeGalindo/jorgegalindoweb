#!/usr/bin/env node
/**
 * feeds/build.mjs — normaliza feeds y scraping para jorgegalindo.eu
 *
 * Fuentes:
 *   1. El País       — RSS por autor (https://elpais.com/autor/jorge-galindo/a/rss/)
 *   2. EsadeEcPol    — scraping de la página de autor (no expone RSS por autor)
 *   3. Letras Libres — RSS por autor (https://letraslibres.com/autor/jorge-galindo/feed/)
 *   4. Jot Down      — scraping de la página de autor (RSS por autor inestable)
 *   5. Substack      — RSS estándar (https://jorgegalindo.substack.com/feed)
 *   6. YouTube       — feed Atom del canal (https://www.youtube.com/feeds/videos.xml?channel_id=...)
 *
 * Salidas:
 *   - data/log.json         { syncedAt, items: [...] }   (todo menos newsletter y vídeo)
 *   - data/newsletter.json  { syncedAt, items: [...] }   (substack)
 *   - data/videos.json      { syncedAt, items: [...] }   (youtube)
 *   - assets/log/<hash>.<ext>          imágenes cacheadas
 *   - assets/newsletter/<hash>.<ext>   imágenes cacheadas
 *   - assets/video/<hash>.<ext>        miniaturas cacheadas
 *
 * Uso:
 *   node feeds/build.mjs              # corre todo
 *   node feeds/build.mjs --dry        # no escribe ficheros, log a stdout
 *   node feeds/build.mjs --no-images  # no descarga imágenes
 *
 * Cadencia: pensado para correr mensual via GitHub Action.
 * Lo robusto: aunque alguna fuente falle, las demás se generan igual.
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retainPosts } from "./retain.mjs";
import { validPost, validVideo } from "./content.mjs";
import { renderFeeds } from "./render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has("--dry");
const NO_IMAGES = ARGS.has("--no-images");
const ONLY_SOURCE = [...ARGS].find(arg => arg.startsWith('--source='))?.split('=')[1];

// User-Agent de navegador real: muchos medios bloquean UA "bot" con 403/Cloudflare.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/* ─────────────────────────  config de fuentes  ───────────────────────── */

// Canal de Jorge Galindo (youtube.com/@jorgegalindoa). El id UC… es estable;
// el handle @… puede cambiar, así que el feed se pide siempre por channel_id.
const YOUTUBE_CHANNEL_ID = "UCi57aaNOJItv1uEfRowDVbQ";
const YOUTUBE_HANDLE = "jorgegalindoa";

const SOURCES = [
  // El País publica RSS oficial por autor — descubierto inspeccionando la página.
  // Funciona con headers de navegador completos.
  {
    id: "elpais",
    kind: "columna",
    kindLabel: "El País",
    source: "El País",
    type: "rss",
    url: "https://elpais.com/arc/outboundfeeds/rss/author/jorge_galindo_a/?outputType=xml",
  },
  // Letras Libres y Jot Down ya no se muestran en el sitio — solo ecpol y el país.
  // Si en el futuro vuelven a hacer falta, se reactivan aquí.
  // EcPol: una sola fuente — la página oficial de autor `/author/jorge-galindoesade-edu/`.
  // Es lo que EcPol declara públicamente como "publicaciones de Jorge". Si algún post
  // listado ahí no es suyo en realidad, es un dato erróneo del lado de EcPol que solo
  // ellos pueden corregir; no hay otra señal técnica más fiable disponible.
  {
    id: "ecpol",
    kind: "ecpol",
    kindLabel: "EsadeEcPol",
    source: "EsadeEcPol",
    type: "ecpol-combined",
    sources: [
      "https://www.esade.edu/ecpol/es/author/jorge-galindoesade-edu/",
    ],
    blogPattern: /href=["'](https:\/\/www\.esade\.edu\/ecpol\/es\/blog\/[a-z0-9\-]+\/?)["']/g,
    requiredAuthor: /jorge\s+galindo/i,
  },
  {
    id: "substack",
    kind: "newsletter",
    kindLabel: "Newsletter",
    source: "Rango abierto",
    type: "rss",
    url: "https://jorgegalindo.substack.com/feed",
    bucket: "newsletter",
  },
  // YouTube publica un feed Atom por canal, sin API key ni cuota. Devuelve los
  // 15 últimos vídeos; el sitio muestra los 2 más recientes.
  {
    id: "youtube",
    kind: "video",
    kindLabel: "YouTube",
    source: "YouTube",
    type: "youtube-atom",
    channelId: YOUTUBE_CHANNEL_ID,
    url: `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
    bucket: "video",
  },
];

/* ─────────────────────────  http helpers  ───────────────────────── */

// Headers de navegador. Importante: pedir solo gzip (no brotli), porque algunos
// servidores (Substack en concreto) devuelven cuerpo vacío con br aunque el status
// sea 200. gzip/deflate funciona en todos los casos que probamos.
const BROWSER_HEADERS = {
  "user-agent": UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.8",
  "accept-language": "es-ES,es;q=0.9,en;q=0.8",
  "accept-encoding": "gzip, deflate",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
};

const fetchText = async (url) => {
  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return await res.text();
};

const fetchBuffer = async (url) => {
  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

/* ─────────────────────────  XML / RSS parsing (sin deps)  ─────────────────────────
   Parser minimalista: suficiente para extraer <item> y campos básicos.
   Si el feed se complica, se puede sustituir por rss-parser. */

const decodeEntities = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const stripCdata = (s) =>
  String(s || "").replace(/^\s*<!\[CDATA\[(.*?)\]\]>\s*$/s, "$1");

const stripTags = (s) =>
  decodeEntities(stripCdata(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const matchTag = (xml, tag) => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
};

const matchAttr = (xml, tag, attr) => {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?\\s*>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
};

const parseRssItems = (xml) => {
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  for (const block of xml.match(itemRe) || []) {
    const title = stripTags(matchTag(block, "title"));
    const link = stripTags(matchTag(block, "link")) || matchAttr(block, "link", "href");
    const pubDate = stripTags(matchTag(block, "pubDate")) || stripTags(matchTag(block, "dc:date"));
    const description = stripCdata(matchTag(block, "description"));
    const contentEncoded = stripCdata(matchTag(block, "content:encoded"));

    // imagen: media:content / media:thumbnail / enclosure / primera <img> en contenido
    let image =
      matchAttr(block, "media:content", "url") ||
      matchAttr(block, "media:thumbnail", "url") ||
      matchAttr(block, "enclosure", "url") ||
      "";
    if (!image) {
      const html = contentEncoded || description || "";
      const m = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
      if (m) image = m[1];
    }
    image = decodeEntities(image);

    const parsedDate = new Date(pubDate);
    const isoDate = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString().slice(0, 10);
    const excerpt = stripTags(description).slice(0, 220);

    if (title && link) items.push({ title, url: link, date: isoDate, excerpt, image });
  }
  return items;
};

/* ─────────────────────────  YouTube (Atom)  ─────────────────────────
   El feed del canal es Atom: <entry> en lugar de <item>, con los campos de
   YouTube en el namespace yt:/media:. Guardamos el videoId porque el frontend
   construye con él la miniatura y el embed. */

const parseAtomVideos = (xml) => {
  const videos = [];
  for (const block of xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []) {
    const videoId = stripTags(matchTag(block, "yt:videoId"));
    const title = stripTags(matchTag(block, "title"));
    const published = stripTags(matchTag(block, "published"));
    const parsed = new Date(published);
    const date = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
    // La descripción de YouTube suele traer capítulos y enlaces detrás de una
    // línea en blanco: nos quedamos solo con el párrafo de entrada.
    const description = decodeEntities(stripCdata(matchTag(block, "media:description")));
    const lead = description.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
    // Cortar por palabra: una descripción partida a mitad de palabra se lee mal.
    const excerpt = lead.length > 200
      ? lead.slice(0, 200).replace(/[\s,;:.…]+\S*$/, "") + "…"
      : lead;
    const feedThumb = decodeEntities(matchAttr(block, "media:thumbnail", "url"));
    if (!videoId || !title) continue;
    videos.push({
      videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      date,
      excerpt,
      // maxres (1280×720) es la única sin bandas negras; si el vídeo no la tiene,
      // YouTube responde 404 y se cae a la siguiente.
      images: [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
        feedThumb,
      ].filter(Boolean),
    });
  }
  return videos;
};

/* ─────────────────────────  image cache  ───────────────────────── */

const ensureDir = async (p) => {
  try { await access(p); } catch { await mkdir(p, { recursive: true }); }
};

const cacheImage = async (url, bucket) => {
  if (!url || NO_IMAGES) return "";
  try {
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
    const ext = (url.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i)?.[1] || "jpg").toLowerCase();
    const rel = `assets/${bucket}/${hash}.${ext}`;
    const abs = path.join(ROOT, rel);

    try { await access(abs); return rel; } catch {}

    if (DRY) { console.log(`  [dry] cache ${url} → ${rel}`); return rel; }

    const buf = await fetchBuffer(url);
    await ensureDir(path.dirname(abs));
    await writeFile(abs, buf);
    return rel;
  } catch (e) {
    console.warn(`  ⚠ image ${url}: ${e.message}`);
    return "";
  }
};

// Varias candidatas para la misma imagen: se usa la primera que exista.
const cacheFirstImage = async (urls, bucket) => {
  for (const url of urls) {
    const rel = await cacheImage(url, bucket);
    if (rel) return rel;
  }
  return "";
};

/* ─────────────────────────  per-source runners  ───────────────────────── */

const enrichEcpolPost = async (url, requiredAuthor) => {
  const page = await fetchText(url);
  // Filtro reforzado: exigimos que "Jorge Galindo" aparezca en el CUERPO visible
  // del post (no solo en meta tags / JSON-LD / og:* del head, que EcPol pone
  // automáticamente). Para detectar coautoría real o autoría real, descontamos
  // el <head> y los <script> (incl. JSON-LD) y buscamos el nombre en lo que
  // queda — el contenido renderizado.
  const noHead = page.replace(/<head>[\s\S]*?<\/head>/i, "");
  const noScripts = noHead.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const visibleText = noScripts.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (requiredAuthor && !requiredAuthor.test(visibleText)) return null;

  const titleM =
    page.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    page.match(/<title>([^<]+)<\/title>/i);
  const title = titleM
    ? decodeEntities(titleM[1])
        .replace(/\s*[—\-|]\s*Center for Economic Policy.*$/i, "")
        .replace(/\s*[—\-|]\s*EsadeEcPol.*$/i, "")
        .trim()
    : "";

  const ogImage =
    page.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    page.match(/<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  const desc =
    page.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    page.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const time =
    page.match(/<time\b[^>]*datetime=["']([^"']+)["']/i) ||
    page.match(/"datePublished":\s*"([^"]+)"/i);
  const date = time ? new Date(time[1]).toISOString().slice(0, 10) : "";

  if (!title) return null;
  return {
    title,
    url,
    date,
    excerpt: desc ? decodeEntities(desc[1]).slice(0, 220) : "",
    image: ogImage ? decodeEntities(ogImage[1]) : "",
  };
};

const runEcpolCombined = async (src) => {
  // recoger todos los URLs de blog desde TODAS las fuentes
  const urls = new Set();
  for (const url of src.sources) {
    try {
      const html = await fetchText(url);
      let m;
      const re = new RegExp(src.blogPattern.source, src.blogPattern.flags);
      while ((m = re.exec(html))) {
        let u = m[1];
        if (!u.endsWith("/")) u += "/";
        urls.add(u);
      }
    } catch (e) {
      console.warn(`  ⚠ ecpol source ${url}: ${e.message}`);
    }
  }

  // enriquecer cada post y filtrar por autor
  const items = [];
  for (const url of urls) {
    try {
      const it = await enrichEcpolPost(url, src.requiredAuthor);
      if (it) items.push(it);
    } catch (e) {
      console.warn(`  ⚠ ecpol enrich ${url}: ${e.message}`);
    }
  }
  return items;
};

const runSource = async (src) => {
  console.log(`→ ${src.id} (${src.type})`);
  let raw = [];
  try {
    if (src.type === "rss") {
      const xml = await fetchText(src.url);
      raw = parseRssItems(xml);
      if (!raw.length) throw new Error('RSS vacío o respuesta sin artículos; se conservará la copia anterior');
    } else if (src.type === "ecpol-combined") {
      raw = await runEcpolCombined(src);
    } else if (src.type === "youtube-atom") {
      const xml = await fetchText(src.url);
      raw = parseAtomVideos(xml);
      if (!raw.length) throw new Error('Feed de YouTube vacío; se conservará la copia anterior');
    }
  } catch (e) {
    console.warn(`  ✗ ${src.id} failed: ${e.message}`);
    return [];
  }

  const bucket = src.bucket || "log";
  const items = [];
  for (const it of raw) {
    const cached = it.images ? await cacheFirstImage(it.images, bucket) : await cacheImage(it.image, bucket);
    items.push({
      kind: src.kind,
      kindLabel: src.kindLabel,
      source: src.source,
      date: it.date || "",
      title: it.title,
      excerpt: it.excerpt || "",
      url: it.url,
      image: cached,
      ...(it.videoId ? { videoId: it.videoId } : {}),
    });
  }
  console.log(`  ✓ ${items.length} items`);
  return items;
};

/* ─────────────────────────  substack tags  ─────────────────────────
   Para cada tag (/t/<slug>) extraemos los slugs de los posts asociados.
   El builder genera data/newsletter-tags.json con la forma:
   { "europa-sola": ["slug-1","slug-2",...], "trabajo-con-maquinas": [...], ... } */

const SUBSTACK_TAGS = ["desbloquear-oportunidades", "trabajo-con-maquinas", "europa-sola"];
const SUBSTACK_BASE = "https://jorgegalindo.substack.com";

/* Para cada tag, extraemos los slugs que aparecen en /t/<tag> en su orden natural
   (el más reciente arriba). Después enriquecemos cada slug con título, fecha y og:image
   fetcheando directamente la página del post. Devolvemos los 3 primeros (los más
   recientes) listos para el frontend, sin depender del feed RSS general. */

const enrichSubstackPost = async (url) => {
  try {
    const page = await fetchText(url);
    const titleM =
      page.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      page.match(/<title>([^<]+)<\/title>/i);
    const ogImage =
      page.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const time =
      page.match(/"datePublished":\s*"([^"]+)"/i) ||
      page.match(/<meta\b[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
      page.match(/<time\b[^>]*datetime=["']([^"']+)["']/i);
    const title = titleM ? decodeEntities(titleM[1]).replace(/\s*[-—|]\s*Rango abierto.*$/i, "").trim() : "";
    const image = ogImage ? decodeEntities(ogImage[1]) : "";
    const date = time ? new Date(time[1]).toISOString().slice(0, 10) : "";
    return { url, title, date, image };
  } catch (e) {
    return { url, title: "", date: "", image: "" };
  }
};

const buildSubstackTagMap = async () => {
  const map = {};
  for (const tag of SUBSTACK_TAGS) {
    try {
      const html = await fetchText(`${SUBSTACK_BASE}/t/${tag}`);
      // Conservar orden de aparición (Substack ordena por reciente). Excluir slugs
      // que no son posts (saco-libro = página de venta interna, etc).
      const seen = new Set();
      const slugs = [];
      const re = /href=["'](?:https:\/\/jorgegalindo\.substack\.com)?\/p\/([a-z0-9\-]+(?:-[0-9]+)?)["'?/]/g;
      let m;
      while ((m = re.exec(html))) {
        const slug = m[1].replace(/\\$/, "");
        if (slug === "saco-libro") continue;       // landing del libro, no post
        if (seen.has(slug)) continue;
        seen.add(slug);
        slugs.push(slug);
      }

      // enriquecer los primeros 3 (los más recientes según el orden del tag page)
      const top3 = slugs.slice(0, 3);
      const items = [];
      for (const slug of top3) {
        const url = `${SUBSTACK_BASE}/p/${slug}`;
        const enriched = await enrichSubstackPost(url);
        // cachear imagen localmente
        const cached = await cacheImage(enriched.image, "newsletter");
        if (validPost(enriched)) items.push({ ...enriched, image: cached || enriched.image, slug });
      }
      map[tag] = items;
      console.log(`  ✓ tag ${tag}: ${items.length} posts (${slugs.length} totales)`);
    } catch (e) {
      console.warn(`  ⚠ tag ${tag}: ${e.message}`);
      map[tag] = [];
    }
  }
  return map;
};

/* ─────────────────────────  main  ───────────────────────── */

const main = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const readPrevious = async name => {
    try { return JSON.parse(await readFile(path.join(ROOT, 'data', `${name}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  const [previousLog, previousNewsletter, previousTags, previousVideos] = await Promise.all([
    readPrevious('log'), readPrevious('newsletter'), readPrevious('newsletter-tags'), readPrevious('videos'),
  ]);
  if (ONLY_SOURCE && !SOURCES.some(source => source.id === ONLY_SOURCE)) throw new Error(`Fuente desconocida: ${ONLY_SOURCE}`);

  const all = [];
  for (const src of SOURCES.filter(source => !ONLY_SOURCE || source.id === ONLY_SOURCE)) {
    const items = await runSource(src);
    all.push(...items);
  }

  console.log(`→ substack tags`);
  const tagMap = !ONLY_SOURCE || ONLY_SOURCE === 'substack' ? await buildSubstackTagMap() : {};

  const freshNewsletter = all.filter(x => x.kind === 'newsletter' && validPost(x));
  const freshVideos = all.filter(x => x.kind === 'video' && validVideo(x));
  const freshLog = all.filter(x => !['newsletter', 'video'].includes(x.kind) && validPost(x));
  const newsletter = retainPosts(previousNewsletter.items, freshNewsletter, 30);
  const log = retainPosts(previousLog.items, freshLog, 60);
  const videos = retainPosts(previousVideos.items, freshVideos, 15).filter(validVideo);

  const logOut = { syncedAt: freshLog.length ? today : previousLog.syncedAt || null, items: log };
  const newsletterOut = { syncedAt: freshNewsletter.length ? today : previousNewsletter.syncedAt || null, items: newsletter };
  const videosOut = { syncedAt: freshVideos.length ? today : previousVideos.syncedAt || null, channel: `https://www.youtube.com/@${YOUTUBE_HANDLE}`, items: videos };
  if (!freshVideos.length && videos.length) console.warn(`  ↳ youtube: conservados ${videos.length} vídeos anteriores`);
  const freshTags = Object.values(tagMap).some(items => items.some(validPost));
  const tagOut = { syncedAt: freshTags ? today : previousTags.syncedAt || null };
  for (const tag of SUBSTACK_TAGS) {
    tagOut[tag] = retainPosts(previousTags[tag], tagMap[tag], 3);
    if (!tagMap[tag]?.length && previousTags[tag]?.length) console.warn(`  ↳ ${tag}: conservados ${tagOut[tag].length} artículos anteriores`);
  }

  if (DRY) {
    console.log("\n[dry] log:", log.length, "items");
    console.log("[dry] newsletter:", newsletter.length, "items");
    console.log("[dry] videos:", videos.length, "items");
    console.log("[dry] tags:", Object.fromEntries(SUBSTACK_TAGS.map(tag => [tag, tagOut[tag].length])));
    return;
  }

  await ensureDir(path.join(ROOT, "data"));
  await writeFile(path.join(ROOT, "data/log.json"), JSON.stringify(logOut, null, 2));
  await writeFile(path.join(ROOT, "data/newsletter.json"), JSON.stringify(newsletterOut, null, 2));
  await writeFile(path.join(ROOT, "data/newsletter-tags.json"), JSON.stringify(tagOut, null, 2));
  await writeFile(path.join(ROOT, "data/videos.json"), JSON.stringify(videosOut, null, 2));
  await renderFeeds(ROOT);
  console.log(`\n✓ data/log.json (${log.length})`);
  console.log(`✓ data/newsletter.json (${newsletter.length})`);
  console.log(`✓ data/newsletter-tags.json (${SUBSTACK_TAGS.length} tags)`);
  console.log(`✓ data/videos.json (${videos.length})`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
