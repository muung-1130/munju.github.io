import {readFile, writeFile} from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const periods = JSON.parse(await readFile(new URL('project-periods.json', root), 'utf8'));
const format = date => date.slice(2).replaceAll('-', '.');
let index = await readFile(new URL('index.html', root), 'utf8');
for (const [slug, {start, end}] of Object.entries(periods)) {
  for (const date of [start, end]) {
    if (date !== null && (!/^\d{4}-\d{2}(-\d{2})?$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,date.length) !== date)) throw Error(`Invalid date: ${slug}`);
  }
  if (start && end && start > end) throw Error(`Invalid period: ${slug}`);
  const content = start && end
    ? `<time datetime="${start}">${format(start)}</time>${start === end ? "" : `<span aria-hidden="true">~</span><time datetime="${end}">${format(end)}</time>`}`
    : '<span>기간 확인 중</span>';
  const badge = `<div class="project-period"><span class="period-label">PERIOD</span><span class="period-value">${content}</span></div>`;
  const anchor = index.indexOf(`href="projects/${slug}/"`);
  const endOfCard = index.indexOf('</a>', anchor);
  let card = index.slice(anchor, endOfCard).replace(/<div class="project-period"[\s\S]*?<\/div>/g, '');
  card = card.replace('<div class="project-bottom"><div>', `<div class="project-bottom"><div>${badge}`);
  index = index.slice(0, anchor) + card + index.slice(endOfCard);
  const file = new URL(`projects/${slug}/index.html`, root);
  let detail = (await readFile(file, 'utf8')).replace(/<div class="project-period"[\s\S]*?<\/div>/g, '');
  detail = detail.replace(/<h1\b/, `${badge}<h1`);
  await writeFile(file, detail);
}
await writeFile(new URL('index.html', root), index);
console.log('Project periods updated in six cards and six detail pages.');
