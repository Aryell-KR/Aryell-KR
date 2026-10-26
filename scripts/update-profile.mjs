import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createSnakeSvg, resolveSnakePeriod } from './contribution-snake.mjs';

const assets = new URL('../assets/', import.meta.url);
const username = process.env.PROFILE_USERNAME || 'Aryell-KR';
if (!/^[a-z\d-]+$/i.test(username)) throw new Error('Invalid GitHub username.');
const timezone = 'America/Fortaleza';
const configFile = new URL('../profile.config.json', import.meta.url);
const profileConfig = JSON.parse(await readFile(configFile, 'utf8'));
const snakePeriod = resolveSnakePeriod(process.env.SNAKE_PERIOD, profileConfig.snakePeriod);
const snakeMaxSegments = profileConfig.snakeMaxSegments ?? 18;
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
  ...['month', 'year'].flatMap(period => [false, true].map(dark =>
    writeFile(new URL(`github-snake-${period}${dark ? '-dark' : ''}.svg`, assets), createSnakeSvg(days, { today, period, username, dark, maxSegments: snakeMaxSegments }))
  )),
]);
try { await refreshStreak(); } catch (error) {
  // A temporary outage keeps the previous snapshot instead of breaking the README.
  await readFile(new URL('github-streak.svg', assets)).catch(() => { throw error; });
  console.warn(`Streak: keeping the last valid image (${error.message}).`);
}
if (profileConfig.snakePeriod !== snakePeriod) {
  await writeFile(configFile, JSON.stringify({ ...profileConfig, snakePeriod }, null, 2) + '\n');
}
const readmeFile = new URL('../README.md', import.meta.url);
const readme = await readFile(readmeFile, 'utf8');
const imageBlock = `<!-- snake:start -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/github-snake-${snakePeriod}-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/github-snake-${snakePeriod}.svg">
  <img src="./assets/github-snake-${snakePeriod}.svg" alt="Cobrinha e barra de progresso das contribuições no período escolhido" width="100%">
</picture>
<!-- snake:end -->`;
const blockPattern = /<!-- snake:start -->[\s\S]*?<!-- snake:end -->/;
if (!blockPattern.test(readme)) throw new Error('README is missing the snake image block.');
const updatedReadme = readme.replace(blockPattern, imageBlock);
if (updatedReadme !== readme) await writeFile(readmeFile, updatedReadme);
console.log(JSON.stringify({ username, today, timezone, snakePeriod, snakeMaxSegments, calendarDays: days.length, month: `${parts.year}-${parts.month}`, contributionsThisMonth: days.filter(d => d.date.startsWith(`${parts.year}-${parts.month}-`)).reduce((sum,d) => sum+d.count,0), contributionsThisYear: result.contributions, activeDaysThisYear: result.active, publicRepositories: repos.length }, null, 2));
