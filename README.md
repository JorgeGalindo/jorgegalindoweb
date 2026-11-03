# jorgegalindo.eu

Página personal de Jorge Galindo. HTML / CSS / JS plano + cron mensual que sincroniza los feeds.

## Estructura

```
.
├── index.html
├── styles.css
├── app.js
├── hero.js                   ← animación independiente de la cabecera
├── CNAME                                    ← apunta a jorgegalindo.eu (GitHub Pages)
├── data/
│   ├── log.json              ← generado por feeds/build.mjs (ecpol + el país)
│   ├── newsletter.json       ← generado por feeds/build.mjs (substack)
│   ├── newsletter-tags.json  ← generado por feeds/build.mjs (tags + posts)
│   ├── videos.json           ← generado por feeds/build.mjs (youtube)
│   ├── events.json           ← manual (eventos + medios destacados)
│   └── i18n.json             ← traducciones es / en / ca
├── assets/
│   ├── jorge.jpg                       ← avatar circular del hero
│   ├── jorge-portrait.png              ← retrato editorial b/n en "quién"
│   ├── libro.png                       ← portada Tres millones de viviendas
│   ├── la-urna-rota.png                ← portadas Politikon
│   ├── el-muro-invisible.png
│   ├── un-pais-posible.png
│   ├── paper-iberian-exception.png     ← portada del paper destacado
│   ├── log/<hash>.<ext>                ← caché de imágenes de los posts
│   ├── newsletter/<hash>.<ext>         ← caché de imágenes Substack
│   └── video/<hash>.<ext>              ← caché de miniaturas de YouTube
├── feeds/
│   └── build.mjs                        ← normalizador de feeds
└── .github/workflows/feeds.yml          ← cron mensual
```

## Desarrollo local

```bash
npm run dev
# → http://localhost:5173
```

`npm run build` incluye los listados de artículos, newsletter y eventos en el HTML existente. Hay que ejecutarlo después de editar sus JSON. Así el contenido y los anclajes funcionan incluso si JavaScript o una petición de datos fallan. `npm test` comprueba que una actualización fallida no borre contenido publicado.

La estructura, los textos y los seis anclajes de la portada se conservan. La paleta usa el verde agua de la cubierta del libro para fondos y un verde más oscuro para los textos. Las imágenes de `assets/optimized/` son versiones WebP sin pérdida, con los mismos píxeles que los originales.

## Sincronizar feeds

```bash
npm run feeds:build       # produce los JSONs y cachea imágenes
npm run feeds:dry         # no escribe nada, log a stdout
npm run feeds:no-images   # solo JSON, sin descargar imágenes
node feeds/build.mjs --source=substack --dry --no-images  # diagnosticar Substack sin escribir
```

Si una fuente falla o devuelve artículos vacíos, se conserva su última copia válida, incluidas las imágenes ya cacheadas. La fecha de sincronización solo avanza si la fuente responde con artículos válidos. La actualización también regenera los listados del HTML, que el workflow publica junto con los JSON.

Fuentes activas:

- **El País** — RSS oficial por autor.
- **EsadeEcPol** — scraping de la página de autor + filtrado por mención de "Jorge Galindo" en el cuerpo del post.
- **Substack (Rango abierto)** — RSS estándar + scraping de los tags `desbloquear-oportunidades`, `trabajo-con-maquinas` y `europa-sola`.
- **YouTube** — feed Atom del canal (`youtube.com/@jorgegalindoa`, id `UCi57aaNOJItv1uEfRowDVbQ`). Sin API key ni cuota. El id del canal está en `YOUTUBE_CHANNEL_ID` dentro de `feeds/build.mjs`: el handle `@…` puede cambiar, el id no.

Si una fuente cambia URL o markup, ajustar `SOURCES` en `feeds/build.mjs`.

## Cadencia

`.github/workflows/feeds.yml` corre **mensual** (día 1 a las 06:00 UTC). Para activar **bisemanal**, descomenta el segundo `cron`. También puede dispararse a mano desde la pestaña Actions.

## Sección de vídeo

La sección `#video` va justo debajo de la cabecera, antes del libro, y muestra los **dos vídeos más recientes** del canal (`visibleVideos` en `feeds/content.mjs`, límite 2). **Solo los vídeos**: sin titular, sin pie y sin enlace al canal. El título de cada vídeo vive en el `alt` de la miniatura y en el `aria-label` del enlace, que es lo que leen buscadores y lectores de pantalla.

- En móvil es un carrusel: un vídeo a la vista, con scroll-snap horizontal, flechas y puntos. El desplazamiento con el dedo funciona aunque falle el JavaScript; las flechas y los puntos los activa `app.js`.
- Desde 900 px de ancho caben los dos a la vez y el carrusel se convierte en una pareja de tarjetas (los controles se ocultan por CSS).
- La miniatura es un **enlace real a YouTube**. `app.js` intercepta el clic y lo sustituye por el embed de `youtube-nocookie.com`, así que ninguna visita carga el reproductor de YouTube si no se pide. Sin JavaScript, el enlace lleva al vídeo.
- Las miniaturas se cachean en el repo: se prueba `maxresdefault` (1280×720, sin bandas negras) y se cae a `sddefault` o a la del feed.
- Para publicar un vídeo nuevo basta con `npm run feeds:build` (o esperar al cron): el builder reescribe `data/videos.json` y los listados del HTML.

## Idiomas

`data/i18n.json` contiene las traducciones para `es`, `en` y `ca`. El idioma se selecciona con el switcher del nav (que añade `?lang=xx` a la URL, conservando el anclaje) y se persiste en `localStorage`.

La cabecera oscura presenta el mismo titular con una entrada automática por palabras y un subrayado verde sobre «criterio». `hero.js` es independiente del módulo de datos: arranca cuando la cabecera está a la vista, incluso si fallan las traducciones o los feeds. Los clics normales no cancelan la entrada; Escape la termina. Con movimiento reducido se usa solo un fundido por palabras, sin desplazamientos. El HTML completo sirve de respaldo si JavaScript falla y se restaura al finalizar (con un límite de 4 segundos).

## Deploy: GitHub Pages + jorgegalindo.eu

### 1. Push del repo a GitHub

```bash
cd /Users/jorgegalindo/Desktop/projects/jorgegalindoweb
git init
git add -A
git commit -m "initial"
gh repo create jorgegalindoweb --public --source=. --push   # o crearlo a mano en github.com
```

### 2. Habilitar Pages

En GitHub → Settings → Pages:
- **Source**: Deploy from a branch
- **Branch**: `main` / root
- Guardar.

GitHub te dará una URL `<usuario>.github.io/jorgegalindoweb/`. La detectará el `CNAME` del repo y servirá también desde `jorgegalindo.eu` cuando los DNS estén listos.

### 3. Cambiar DNS de jorgegalindo.eu

En el panel de tu registrador (donde tienes el dominio contratado) borra cualquier registro existente que apunte al Google Sites y añade:

**Apex `jorgegalindo.eu` — registros A:**
```
A    @    185.199.108.153
A    @    185.199.109.153
A    @    185.199.110.153
A    @    185.199.111.153
```

**(Opcional) IPv6 — registros AAAA:**
```
AAAA @    2606:50c0:8000::153
AAAA @    2606:50c0:8001::153
AAAA @    2606:50c0:8002::153
AAAA @    2606:50c0:8003::153
```

**Subdominio `www` — CNAME:**
```
CNAME    www    <tu-usuario>.github.io.
```

(Sustituye `<tu-usuario>` por tu nombre de usuario de GitHub.)

La propagación tarda entre 5 minutos y un par de horas. Comprueba con:
```bash
dig +short jorgegalindo.eu
```

Tienen que aparecer las IPs de GitHub Pages.

### 4. Marcar HTTPS

Cuando GitHub Pages detecte el dominio (verás un check verde en Settings → Pages), marca **Enforce HTTPS**. Tarda unos minutos en emitirse el certificado de Let's Encrypt.

A partir de ese momento `https://jorgegalindo.eu` sirve el sitio.

### Cosas a tener en cuenta

- El `CNAME` en la raíz del repo es **obligatorio** para que GitHub respete tu dominio personalizado (no solo lo configuras en Settings → Pages, también necesita estar el archivo).
- El servidor de GitHub Pages **cachea agresivamente**. Si subes una nueva versión y no la ves, hard-refresh (Cmd+Shift+R). Las URLs `?v=...` del HTML ayudan, pero si cambias HTML directamente puede tardar 5–10 minutos.
- Pages **solo sirve archivos estáticos**. El cron de feeds sigue corriendo en GitHub Actions y commitea los JSONs/imágenes generadas al repo, lo cual dispara un nuevo build y publish automáticos.

## Reemplazar imágenes

Si quieres cambiar alguna foto/portada, sobrescribe el archivo en `assets/` con el mismo nombre y commitea. Se desplegará automáticamente.
