# jorgegalindo.eu

Página personal de Jorge Galindo. HTML / CSS / JS plano + cron mensual que sincroniza los feeds.

## Estructura

```
.
├── index.html
├── styles.css
├── app.js
├── CNAME                                    ← apunta a jorgegalindo.eu (GitHub Pages)
├── data/
│   ├── log.json              ← generado por feeds/build.mjs (ecpol + el país)
│   ├── newsletter.json       ← generado por feeds/build.mjs (substack)
│   ├── newsletter-tags.json  ← generado por feeds/build.mjs (tags + posts)
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
│   └── newsletter/<hash>.<ext>         ← caché de imágenes Substack
├── feeds/
│   └── build.mjs                        ← normalizador de feeds
└── .github/workflows/feeds.yml          ← cron mensual
```

## Desarrollo local

```bash
npm run dev
# → http://localhost:5173
```

## Sincronizar feeds

```bash
npm run feeds:build       # produce los JSONs y cachea imágenes
npm run feeds:dry         # no escribe nada, log a stdout
npm run feeds:no-images   # solo JSON, sin descargar imágenes
```

Fuentes activas:

- **El País** — RSS oficial por autor.
- **EsadeEcPol** — scraping de la página de autor + filtrado por mención de "Jorge Galindo" en el cuerpo del post.
- **Substack (Rango abierto)** — RSS estándar + scraping de los tags `desbloquear-oportunidades`, `trabajo-con-maquinas` y `europa-sola`.

Si una fuente cambia URL o markup, ajustar `SOURCES` en `feeds/build.mjs`.

## Cadencia

`.github/workflows/feeds.yml` corre **mensual** (día 1 a las 06:00 UTC). Para activar **bisemanal**, descomenta el segundo `cron`. También puede dispararse a mano desde la pestaña Actions.

## Idiomas

`data/i18n.json` contiene las traducciones para `es`, `en` y `ca`. El idioma se selecciona con el switcher del nav (que añade `?lang=xx` a la URL) y se persiste en `localStorage`. El typing del hero se ejecuta con el texto ya traducido.

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
