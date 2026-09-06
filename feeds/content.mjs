export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

export const validPost = item => Boolean(item && typeof item.title === 'string' && item.title.trim()
  && typeof item.url === 'string' && /^https?:\/\//i.test(item.url));

export const visibleLog = items => (Array.isArray(items) ? items : [])
  .filter(item => validPost(item) && ['ecpol', 'columna'].includes(item.kind) && item.date >= '2025-01-01')
  .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20);

const date = value => escapeHtml((value || '').replace(/-/g, '.'));

export const logMarkup = items => visibleLog(items).map(item => `
        <li class="log__item">
          <span class="log__date">${date(item.date)}</span>
          <span class="log__tag log__tag--${item.kind === 'ecpol' ? 'ecpol' : 'elpais'}">${item.kind === 'ecpol' ? 'ecpol' : 'el país'}</span>
          <h3 class="log__title-link"><a href="${escapeHtml(item.url)}" rel="noopener">${escapeHtml(item.title)}</a></h3>
        </li>`).join('');

export const tagMarkup = items => (Array.isArray(items) ? items : []).filter(validPost).slice(0, 3).map(item => `
        <li>
          <span class="obsesion-block__post-date">${date(item.date)}</span>
          <a class="obsesion-block__post-link" href="${escapeHtml(item.url)}" rel="noopener">${escapeHtml(item.title)}</a>
        </li>`).join('');

// Los campos con marcado editorial proceden del JSON manual del repositorio.
export const eventsMarkup = items => (Array.isArray(items) ? items : []).map(item => `
      <li class="directo__item">
        <p class="directo__when">${escapeHtml(item.when)}</p>
        <p class="directo__title">${escapeHtml(item.title)}</p>
        <p class="directo__where">${item.where || ''}</p>
      </li>`).join('');

export const mediaMarkup = items => (Array.isArray(items) ? items : []).filter(validPost).map(item => `
      <li class="directo__item directo__item--media">
        <p class="directo__when">${escapeHtml(item.outlet)}</p>
        <p class="directo__title"><a href="${escapeHtml(item.url)}" rel="noopener">${item.title}</a></p>
        <p class="directo__where">${escapeHtml(item.date)}</p>
      </li>`).join('');
