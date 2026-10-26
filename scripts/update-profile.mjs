import { mkdir, readFile, writeFile } from 'node:fs/promises';

const assets = new URL('../assets/', import.meta.url);
const username = process.env.PROFILE_USERNAME || 'Aryell-KR';
if (!/^[a-z\d-]+$/i.test(username)) throw new Error('Invalid GitHub username.');
const timezone = 'America/Fortaleza';
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const year = Number(parts.year);
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

async function get(url, api = false) {
  const headers = { 'User-Agent': 'Aryell-KR-profile', Accept: api ? 'application/vnd.github+json' : 'text/html' };
  if (api && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${response.status} while fetching ${new URL(url).hostname}`);
  }
}

function parseCalendar(html) {
  const counts = new Map();
  for (const match of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)) {
    const attr = attributes(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const count = /^No contributions\b/i.test(text) ? 0 : Number(text.match(/^([\d,]+) contributions?\b/i)?.[1]?.replaceAll(',', ''));
    if (attr.for && Number.isFinite(count)) counts.set(attr.for, count);
  }
  const days = [...html.matchAll(/<td\b[^>]*data-date="\d{4}-\d{2}-\d{2}"[^>]*>/g)].map((match) => {
    const attr = attributes(match[0]);
    const count = counts.get(attr.id);
    if (!Number.isFinite(count)) throw new Error(`Contribution count missing for ${attr['data-date']}.`);
    return { date: attr['data-date'], level: Number(attr['data-level']), count };
  }).filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 300 || new Set(days.map((d) => d.date)).size !== days.length) {
    throw new Error('GitHub calendar changed format or is incomplete; existing SVGs were preserved.');
  }
  return days;
}

async function getRepositories() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = JSON.parse(await get(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`, true));
    if (!Array.isArray(batch)) throw new Error('Invalid repository response.');
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((repo) => !repo.private);
}

function statsSvg(days, repos) {
  const annual = days.filter((d) => d.date.startsWith(`${year}-`));
  const contributions = annual.reduce((sum, d) => sum + d.count, 0);
  const active = annual.filter((d) => d.count > 0).length;
  const metrics = [['CONTRIBUIÇÕES VISÍVEIS NO ANO', contributions], ['DIAS COM ATIVIDADE NO ANO', active], ['REPOSITÓRIOS PÚBLICOS', repos.length]];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="165" viewBox="0 0 900 165" role="img" aria-labelledby="title desc">
  <title id="title">Atividade de ${escape(username)} em ${year}</title>
  <desc id="desc">${contributions} contribuições em ${year}, ${active} dias ativos em ${year} e ${repos.length} repositórios públicos. Dados até ${today}.</desc>
  <rect x=".5" y=".5" width="899" height="164" rx="12" fill="#0d1117" stroke="#30363d"/>
  <g font-family="Segoe UI,Arial,sans-serif">
  <text x="28" y="35" fill="#f0f6fc" font-size="17" font-weight="600">GitHub · ${year}</text>
  <text x="872" y="35" text-anchor="end" fill="#8b949e" font-size="12">até ${parts.day}/${parts.month}/${parts.year}</text>
  ${metrics.map(([label, value], i) => `<text x="${28 + i * 294}" y="91" fill="#79a8ff" font-size="34" font-weight="600">${value.toLocaleString('pt-BR')}</text><text x="${28 + i * 294}" y="123" fill="#9da7b3" font-size="11" letter-spacing=".8">${label}</text>`).join('\n')}
  <path d="M306 63v70M600 63v70" stroke="#30363d"/>
  </g></svg>`;
  return { svg, contributions, active };
}

function snakeSvg(days, dark) {
  days = days.filter((day) => day.date.startsWith(`${parts.year}-${parts.month}-`));
  if (!days.length) throw new Error('Current-month contribution calendar is missing.');
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`));
  const monthLabel = monthName[0].toUpperCase() + monthName.slice(1);
  const monthlyContributions = days.reduce((sum, day) => sum + day.count, 0);
  const first = new Date(`${days[0].date}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const step = 30, cell = 22, left = 650, top = 37;
  const dayIndex = (date) => Math.round((new Date(`${date}T12:00:00Z`) - first) / 86400000);
  const weeks = Math.floor(dayIndex(days.at(-1).date) / 7) + 1;
  const width = 900, height = 280;
  const bg = dark ? '#0d1117' : '#ffffff';
  const border = dark ? '#30363d' : '#d0d7de';
  const muted = dark ? '#8b949e' : '#57606a';
  const colors = dark ? ['#161b22', '#123b48', '#216476', '#3295a3', '#6bd0c5'] : ['#ebedf0', '#bde7df', '#7ec7bb', '#359b8a', '#116d60'];
  const head = dark ? '#9dbdff' : '#345dc0';
  // A continuous sweep; a cell is eaten when the head reaches it.
  const route = [[-1, 0]];
  for (let x = 0; x < weeks; x++) for (let k = 0; k < 7; k++) route.push([x, x % 2 ? 6 - k : k]);
  let [rx, ry] = route.at(-1);
  route.push([++rx, ry]);
  while (ry >= 0) route.push([rx, --ry]);
  while (rx > -1) route.push([--rx, ry]);
  while (ry < -1) route.push([rx, ++ry]);
  const count = route.length, duration = Math.max(16, Math.round(count * .25));
  const routeIndex = new Map(route.slice(1, weeks * 7 + 1).map(([x, y], i) => [`${x},${y}`, i + 1]));
  const cells = days.map((day) => {
    const index = dayIndex(day.date), x = Math.floor(index / 7), y = index % 7;
    const consume = (routeIndex.get(`${x},${y}`) / count).toFixed(6), color = colors[day.level];
    if (!color) throw new Error(`Invalid contribution level for ${day.date}.`);
    return `<rect x="${left + x * step}" y="${top + y * step}" width="${cell}" height="${cell}" rx="4" fill="${color}"><title>${day.date}: ${day.count} contribuições</title>${day.count ? `<animate attributeName="fill" values="${color};${colors[0]};${colors[0]}" keyTimes="0;${consume};1" calcMode="discrete" dur="${duration}s" repeatCount="indefinite"/>` : ''}</rect><text x="${left + x * step + cell / 2}" y="${top + y * step + 15}" text-anchor="middle" fill="${muted}" font-family="Segoe UI,Arial,sans-serif" font-size="9">${Number(day.date.slice(-2))}</text>`;
  }).join('\n');
  const segments = [3, 2, 1, 0].map((lag) => {
    const points = Array.from({ length: count + 1 }, (_, i) => route[(i - lag + count) % count]);
    const xs = points.map(([x]) => left + x * step).join(';'), ys = points.map(([, y]) => top + y * step).join(';');
    return `<rect x="${left + points[0][0] * step}" y="${top + points[0][1] * step}" width="${cell}" height="${cell}" rx="6" fill="${head}" opacity="${1 - lag * .18}"><animate attributeName="x" values="${xs}" dur="${duration}s" repeatCount="indefinite"/><animate attributeName="y" values="${ys}" dur="${duration}s" repeatCount="indefinite"/></rect>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" data-month="${parts.year}-${parts.month}" data-cycle-seconds="${duration}">
  <title id="title">Cobrinha de ${escape(username)} — ${monthLabel}</title>
  <desc id="desc">Dados reais do calendário público do GitHub, de ${days[0].date} a ${days.at(-1).date}. A animação se repete a cada ${duration} segundos.</desc>
  <rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="12" fill="${bg}" stroke="${border}"/>
  <g font-family="Segoe UI,Arial,sans-serif"><text x="32" y="49" fill="${muted}" font-size="11" letter-spacing="1.5">CONTRIBUIÇÕES DO MÊS</text><text x="32" y="98" fill="${dark ? '#f0f6fc' : '#1f2328'}" font-size="30" font-weight="600">${monthLabel}</text><text x="32" y="137" fill="${head}" font-size="17">${monthlyContributions} ${monthlyContributions === 1 ? 'contribuição visível' : 'contribuições visíveis'}</text><text x="32" y="174" fill="${muted}" font-size="12">${days[0].date.split('-').reverse().join('/')} — ${days.at(-1).date.split('-').reverse().join('/')}</text></g>
  <path d="M515 40v193" stroke="${border}"/>
  ${['D','S','T','Q','Q','S','S'].map((label, i) => `<text x="625" y="${top + i * step + 15}" fill="${muted}" font-family="Segoe UI,Arial,sans-serif" font-size="10">${label}</text>`).join('')}
  ${cells}\n${segments}
  <g font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="${muted}"><text x="32" y="232">Menos</text>${colors.map((c, i) => `<rect x="${72 + i * 15}" y="223" width="11" height="11" rx="2" fill="${c}"/>`).join('')}<text x="156" y="232">Mais</text></g></svg>`;
}

async function refreshStreak() {
  const query = new URLSearchParams({
    user: username, theme: 'github-dark-blue', hide_border: 'true', locale: 'pt_BR', disable_animations: 'true',
    timezone, date_format: 'd/m/Y', starting_year: String(year),
    hide_total_contributions: 'true', card_width: '900', card_height: '195',
    background: '0D1117', ring: '79A8FF', fire: '79A8FF', currStreakLabel: '79A8FF',
    sideLabels: '9DA7B3', dates: '8B949E', stroke: '30363D',
  });
  const svg = await get(`https://streak-stats.demolab.com/?${query}`);
  if (!svg.includes('<svg') || !svg.includes('</svg>') || (svg.match(/<text\b/g) || []).length < 4 || /(?:Error Fetching|Something went wrong|rate limit)/i.test(svg)) throw new Error('Invalid streak card response.');
  await writeFile(new URL('github-streak.svg', assets), svg);
}

await mkdir(assets, { recursive: true });
const [html, repos] = await Promise.all([get(`https://github.com/users/${username}/contributions`), getRepositories()]);
const days = parseCalendar(html), result = statsSvg(days, repos);
await Promise.all([
  writeFile(new URL('github-stats.svg', assets), result.svg),
  writeFile(new URL('github-month.svg', assets), snakeSvg(days, false)),
  writeFile(new URL('github-month-dark.svg', assets), snakeSvg(days, true)),
]);
try { await refreshStreak(); } catch (error) {
  // A temporary outage keeps the previous snapshot instead of breaking the README.
  await readFile(new URL('github-streak.svg', assets)).catch(() => { throw error; });
  console.warn(`Streak: keeping the last valid image (${error.message}).`);
}
console.log(JSON.stringify({ username, today, timezone, calendarDays: days.length, month: `${parts.year}-${parts.month}`, contributionsThisMonth: days.filter(d => d.date.startsWith(`${parts.year}-${parts.month}-`)).reduce((sum,d) => sum+d.count,0), contributionsThisYear: result.contributions, activeDaysThisYear: result.active, publicRepositories: repos.length }, null, 2));
