const DAY = 86400000;
const dateValue = (date) => new Date(`${date}T12:00:00Z`);
const iso = (date) => date.toISOString().slice(0, 10);
const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const formatDate = (date) => date.split('-').reverse().join('/');

export function resolveSnakePeriod(requested, configured = 'month') {
  const value = !requested || requested === 'configured' ? configured : requested;
  if (!['month', 'year'].includes(value)) throw new Error('snakePeriod must be month or year.');
  return value;
}

export function buildSnakeModel(days, { today, period = 'month', maxSegments = 18 }) {
  resolveSnakePeriod(period);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || iso(dateValue(today)) !== today) throw new Error('Invalid current date.');
  if (!Number.isInteger(maxSegments) || maxSegments < 3 || maxSegments > 40) throw new Error('snakeMaxSegments must be an integer between 3 and 40.');
  const year = today.slice(0, 4);
  const start = period === 'month' ? `${today.slice(0, 7)}-01` : `${year}-01-01`;
  const selected = days.filter((day) => day.date >= start && day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const expected = Math.round((dateValue(today) - dateValue(start)) / DAY) + 1;
  if (selected.length !== expected || new Set(selected.map((d) => d.date)).size !== expected) throw new Error('The selected contribution period is incomplete.');
  for (const day of selected) {
    if (!Number.isInteger(day.count) || day.count < 0 || !Number.isInteger(day.level) || day.level < 0 || day.level > 4) throw new Error('Invalid contribution data.');
  }
  const first = dateValue(start);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const index = (date) => Math.round((dateValue(date) - first) / DAY);
  const routeWeeks = Math.floor(index(today) / 7) + 1;
  const displayEnd = period === 'year' ? `${year}-12-31` : today;
  const displayWeeks = Math.floor(index(displayEnd) / 7) + 1;
  const byDate = new Map(selected.map((d) => [d.date, d]));
  const display = [];
  for (let date = dateValue(start); iso(date) <= displayEnd; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = iso(date), day = byDate.get(key);
    const n = index(key);
    display.push({ date: key, count: day?.count ?? 0, level: day?.level ?? 0, future: key > today, x: Math.floor(n / 7), y: n % 7 });
  }
  const route = [[-1, 0]];
  for (let x = 0; x < routeWeeks; x++) for (let k = 0; k < 7; k++) route.push([x, x % 2 ? 6 - k : k]);
  let [x, y] = route.at(-1);
  route.push([++x, y]);
  while (y >= 0) route.push([x, --y]);
  while (x > -1) route.push([--x, y]);
  const visit = new Map(route.slice(1, routeWeeks * 7 + 1).map(([cx, cy], i) => [`${cx},${cy}`, i + 1]));
  let consumed = 0;
  const events = display.filter((d) => !d.future && d.count > 0).map((d) => ({ ...d, at: visit.get(`${d.x},${d.y}`) / route.length })).sort((a, b) => a.at - b.at).map((d) => ({ ...d, consumed: consumed += d.count }));
  const total = selected.reduce((sum, d) => sum + d.count, 0);
  const baseSegments = Math.min(3, route.length - 2);
  const segments = Math.min(maxSegments, baseSegments + total, route.length - 2);
  return { today, period, start, displayEnd, display, displayWeeks, route, visit, events, total, baseSegments, segments, duration: period === 'year' ? 48 : 16 };
}

export function createSnakeSvg(days, { today, period = 'month', username = 'Aryell-KR', dark = true, maxSegments = 18 }) {
  const m = buildSnakeModel(days, { today, period, maxSegments });
  const annual = period === 'year';
  const width = 900, height = annual ? 310 : 320;
  const step = annual ? Math.min(15, 810 / m.displayWeeks) : 30;
  const cell = annual ? 10 : 22, left = annual ? 48 : 650, top = annual ? 118 : 42;
  const bg = dark ? '#0d1117' : '#ffffff', border = dark ? '#30363d' : '#d0d7de';
  const muted = dark ? '#8b949e' : '#57606a', text = dark ? '#f0f6fc' : '#1f2328';
  const colors = dark ? ['#161b22', '#123b48', '#216476', '#3295a3', '#6bd0c5'] : ['#ebedf0', '#bde7df', '#7ec7bb', '#359b8a', '#116d60'];
  const head = dark ? '#b8a3e0' : '#6d28d9';
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateValue(today));
  const label = annual ? `Ano de ${today.slice(0,4)}` : month[0].toUpperCase() + month.slice(1);
  const duration = `${m.duration}s`, number = (n) => Number(n.toFixed(8));
  const cells = m.display.map((day) => {
    const color = colors[day.level], at = m.visit.get(`${day.x},${day.y}`) / m.route.length;
    const animation = day.count ? `<animate attributeName="fill" values="${color};${colors[0]};${colors[0]}" keyTimes="0;${number(at)};1" calcMode="discrete" dur="${duration}" repeatCount="indefinite"/>` : '';
    return `<rect data-date="${day.date}" data-count="${day.count}" data-future="${day.future}" x="${left + day.x * step}" y="${top + day.y * step}" width="${cell}" height="${cell}" rx="${annual ? 2 : 4}" fill="${color}" opacity="${day.future ? .3 : 1}"><title>${day.date}: ${day.future ? 'dia futuro' : `${day.count} contribuições`}</title>${animation}</rect>${annual ? '' : `<text x="${left + day.x * step + cell/2}" y="${top + day.y * step + 15}" text-anchor="middle" fill="${muted}" font-size="9">${Number(day.date.slice(-2))}</text>`}`;
  }).join('\n');
  const segments = Array.from({ length: m.segments }, (_, i) => m.segments - i - 1).map((lag) => {
    const points = Array.from({ length: m.route.length + 1 }, (_, i) => m.route[(i - lag + m.route.length) % m.route.length]);
    const xs = points.map(([x]) => number(left + x * step)).join(';'), ys = points.map(([, y]) => top + y * step).join(';');
    const opacity = Math.max(.3, 1 - lag * .04), initial = lag < m.baseSegments;
    const growth = initial ? null : m.events.find((event) => event.consumed >= lag - m.baseSegments + 1);
    return `<rect data-segment="${lag}" x="${left + points[0][0] * step}" y="${top + points[0][1] * step}" width="${cell}" height="${cell}" rx="${annual ? 3 : 6}" fill="${head}" opacity="${initial ? opacity : 0}"><animate attributeName="x" values="${xs}" dur="${duration}" repeatCount="indefinite"/><animate attributeName="y" values="${ys}" dur="${duration}" repeatCount="indefinite"/>${growth ? `<animate attributeName="opacity" values="0;${opacity};${opacity}" keyTimes="0;${number(growth.at)};1" calcMode="discrete" dur="${duration}" repeatCount="indefinite"/>` : ''}</rect>`;
  }).join('\n');
  const bar = annual ? { x: 28, y: 263, width: 844, labelY: 249 } : { x: 32, y: 234, width: 380, labelY: 220 };
  const states = [{ at: 0, consumed: 0 }, ...m.events];
  const progressTimes = [0, ...m.events.map((e) => number(e.at)), 1].join(';');
  const progressValues = [0, ...m.events.map((e) => number(bar.width * e.consumed / m.total)), m.total ? bar.width : 0].join(';');
  const progress = `<text x="${bar.x}" y="${bar.labelY}" fill="${muted}" font-size="11">CONTRIBUIÇÕES CONSUMIDAS</text><rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="8" rx="4" fill="${colors[0]}"/><rect id="progress-fill" x="${bar.x}" y="${bar.y}" width="0" height="8" rx="4" fill="${head}">${m.events.length ? `<animate attributeName="width" values="${progressValues}" keyTimes="${progressTimes}" calcMode="discrete" dur="${duration}" repeatCount="indefinite"/>` : ''}</rect>${states.map((state, i) => {
    const next = states[i+1];
    const values = i === 0 ? (next ? '1;0;0' : null) : next ? '0;1;0;0' : '0;1;1';
    const times = i === 0 ? (next ? `0;${number(next.at)};1` : null) : next ? `0;${number(state.at)};${number(next.at)};1` : `0;${number(state.at)};1`;
    return `<text data-consumed="${state.consumed}" x="${bar.x + bar.width}" y="${bar.labelY}" text-anchor="end" fill="${head}" font-size="12" opacity="${i === 0 ? 1 : 0}">${state.consumed} / ${m.total}${values ? `<animate attributeName="opacity" values="${values}" keyTimes="${times}" calcMode="discrete" dur="${duration}" repeatCount="indefinite"/>` : ''}</text>`;
  }).join('')}`;
  const periodText = `${formatDate(m.start)} — ${formatDate(today)}`;
  const caption = `${m.total} ${m.total === 1 ? 'contribuição visível' : 'contribuições visíveis'}`;
  const heading = annual ? `<text x="28" y="28" fill="${muted}" font-size="11" letter-spacing="1.5">CONTRIBUIÇÕES DO ANO</text><text x="28" y="62" fill="${text}" font-size="27" font-weight="600">${label}</text><text x="872" y="62" text-anchor="end" fill="${head}" font-size="16">${caption}</text><text x="28" y="85" fill="${muted}" font-size="12">Dados de ${periodText}</text>` : `<text x="32" y="49" fill="${muted}" font-size="11" letter-spacing="1.5">CONTRIBUIÇÕES DO MÊS</text><text x="32" y="98" fill="${text}" font-size="30" font-weight="600">${label}</text><text x="32" y="137" fill="${head}" font-size="17">${caption}</text><text x="32" y="174" fill="${muted}" font-size="12">${periodText}</text><path d="M515 40v224" stroke="${border}"/>${['D','S','T','Q','Q','S','S'].map((day,i)=>`<text x="625" y="${top+i*step+15}" fill="${muted}" font-size="10">${day}</text>`).join('')}`;
  const monthLabels = annual ? Array.from({length:12},(_,i)=>{
    const date = `${today.slice(0,4)}-${String(i+1).padStart(2,'0')}-01`;
    const week = Math.floor((dateValue(date)-dateValue(m.start))/DAY/7 + dateValue(m.start).getUTCDay()/7);
    const name = new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(dateValue(date)).replace('.','');
    return `<text x="${left+week*step}" y="108" fill="${muted}" font-size="9">${name}</text>`;
  }).join('') : '';
  const legendY = annual ? 291 : 290, legendX = annual ? 680 : 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" data-period="${period}" data-start="${m.start}" data-end="${today}" data-total="${m.total}" data-cycle-seconds="${m.duration}" data-base-segments="${m.baseSegments}" data-max-segments="${m.segments}">
  <title id="title">Cobrinha de ${escape(username)} — ${label}</title><desc id="desc">${caption}, de ${periodText}. A barra e a cobra crescem com as contribuições consumidas e reiniciam a cada ${m.duration} segundos.</desc>
  <rect x=".5" y=".5" width="899" height="${height-1}" rx="12" fill="${bg}" stroke="${border}"/>
  <g font-family="Segoe UI,Arial,sans-serif">${heading}${monthLabels}${cells}${segments}${progress}<g font-size="10" fill="${muted}"><text x="${legendX}" y="${legendY}">Menos</text>${colors.map((color,i)=>`<rect x="${legendX+40+i*15}" y="${legendY-9}" width="11" height="11" rx="2" fill="${color}"/>`).join('')}<text x="${legendX+124}" y="${legendY}">Mais</text></g></g></svg>`;
}
