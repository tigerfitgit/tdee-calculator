import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const SITE = 'https://tigerfitness.com';
const OUTPUT = 'workouts';
const sitemap = await fetch(`${SITE}/sitemap_blogs_1.xml`).then((response) => response.text());
const workoutUrls = [...sitemap.matchAll(/<loc>(https:\/\/tigerfitness\.com\/blogs\/workouts\/[^<]+)<\/loc>/g)].map((match) => match[1]);

if (!workoutUrls.length) throw new Error('No Workout URLs were found in the live sitemap.');

const escapeHtml = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (value = '') => String(value).replace(/\s+/g, ' ').trim();

function documentHtml(data) {
  const meta = data.summary.slice(0, 8).map(([label, value]) => `<div><label>${escapeHtml(label)}</label><strong>${escapeHtml(value)}</strong></div>`).join('');
  const days = data.days.map((day) => {
    const rows = day.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    const head = day.head.length ? `<thead><tr>${day.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>` : '';
    return `<section class="day"><div class="dayhead"><h2>${escapeHtml(day.title)}</h2>${day.subtitle ? `<p>${escapeHtml(day.subtitle)}</p>` : ''}</div><table>${head}<tbody>${rows}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    :root{--orange:#FF4500;--ink:#222;--line:#ddd}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:var(--ink);font-family:Arial,sans-serif}.page{width:8.5in;margin:0 auto;background:#fff}.topbar{position:relative;min-height:205px;overflow:hidden;background:#000;color:#fff;padding:23px 34px 20px;border-bottom:7px solid var(--orange)}.brand{font-family:Arial,sans-serif;font-weight:900;letter-spacing:1.7px;font-size:23px;line-height:1}.brand span{color:var(--orange)}.kicker{margin-top:21px;color:#ffc0a5;font-family:Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}h1{position:relative;z-index:1;margin:7px 0 5px;max-width:470px;font-family:Arial,sans-serif;font-size:30px;line-height:1.08;letter-spacing:-.7px;text-transform:uppercase}.subhead{position:relative;z-index:1;margin:0;max-width:470px;color:#e6e6e6;font-size:13px;line-height:1.4}.header-logo{position:absolute;z-index:0;right:22px;top:16px;width:210px;height:170px;object-fit:contain;object-position:right center}.main{padding:23px 34px 0}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#fff;border:1px solid var(--line)}.meta div{min-height:66px;padding:10px 11px;background:#f7f7f7}.meta label{display:block;color:#777;font-size:8px;font-weight:800;letter-spacing:.7px;text-transform:uppercase}.meta strong{display:block;margin-top:5px;color:#000;font-size:13px;line-height:1.15}.copy{font-size:11px;line-height:1.45}.copy h2,.copy h3{margin:17px 0 10px;padding:10px 13px;background:#000;color:#fff;font-family:Arial,sans-serif;font-size:15px;text-transform:uppercase}.copy p{margin:0 0 12px}.day{margin:0 0 22px;break-inside:avoid;page-break-inside:avoid}.dayhead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:10px 13px;background:#000;color:#fff}.dayhead h2{margin:0;font-family:Arial,sans-serif;font-size:19px;line-height:1;letter-spacing:-.25px;text-transform:uppercase}.dayhead p{margin:0;color:#ffb391;font-size:10px;font-weight:700;white-space:nowrap}table{width:100%;border-collapse:collapse;font-size:11px}thead{display:table-header-group}th{padding:7px 10px;background:var(--orange);color:#fff;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.6px;text-align:left;text-transform:uppercase}th:nth-child(2),th:nth-child(3),td:nth-child(2),td:nth-child(3){text-align:center}td{padding:6px 10px;border:1px solid var(--line);vertical-align:middle;line-height:1.2}tbody tr:nth-child(even) td{background:#f7f7f7}td:first-child{font-weight:700}.brand-footer{margin:3px -34px 0;line-height:0;break-inside:avoid;page-break-inside:avoid}.brand-footer img{display:block;width:100%;height:auto}@page{size:letter;margin:0}
  </style></head><body><div class="page"><header class="topbar"><div class="brand">TIGER <span>FITNESS</span></div><div class="kicker">Workout plan</div><h1>${escapeHtml(data.title)}</h1>${data.summaryText ? `<p class="subhead">${escapeHtml(data.summaryText)}</p>` : ''}${data.logo ? `<img class="header-logo" src="${escapeHtml(data.logo)}" alt="Tiger Fitness">` : ''}</header><main class="main">${meta ? `<section class="meta">${meta}</section>` : ''}<section class="copy">${data.copy}</section>${days}${data.footer ? `<footer class="brand-footer"><img src="${escapeHtml(data.footer)}" alt="Tiger Fitness"></footer>` : ''}</main></div></body></html>`;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

for (const url of workoutUrls) {
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1 });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    const data = await page.evaluate(() => {
      const cleanText = (value = '') => value.replace(/\s+/g, ' ').trim();
      const root = document.querySelector('.tf-workout');
      if (!root) return null;
      const description = root.querySelector('.tf-workout__description');
      const copy = description ? description.cloneNode(true) : document.createElement('div');
      copy.querySelectorAll('table,.tf-workout-summary').forEach((element) => element.remove());
      const days = [...(description?.querySelectorAll('table') || [])].map((table) => {
        const rows = [...table.rows].map((row) => [...row.cells].map((cell) => cleanText(cell.textContent)).filter(Boolean)).filter((row) => row.length);
        let title = '', subtitle = '', head = [];
        if (rows[0]?.length === 1) title = rows.shift()[0];
        if (rows[0]?.length === 1) subtitle = rows.shift()[0];
        if (rows[0]?.[0]?.toLowerCase() === 'exercise') head = rows.shift();
        return { title, subtitle, head, rows };
      }).filter((day) => day.rows.length);
      return {
        title: cleanText(root.querySelector('h1')?.textContent) || document.title,
        summaryText: cleanText(root.querySelector('.tf-workout__summary')?.textContent),
        summary: [...root.querySelectorAll('.tf-workout-summary dl > div')].map((item) => [cleanText(item.querySelector('dt')?.textContent), cleanText(item.querySelector('dd')?.textContent)]).filter(([label, value]) => label && value),
        copy: copy.innerHTML,
        days,
        logo: root.querySelector('[data-workout-pdf-assets]')?.dataset.logo || '',
        footer: root.querySelector('[data-workout-pdf-assets]')?.dataset.footer || '',
        handle: location.pathname.split('/').pop()
      };
    });
    if (!data?.days?.length) throw new Error('No workout day tables found.');
    await page.setContent(documentHtml(data), { waitUntil: 'networkidle' });
    await page.pdf({ path: `${OUTPUT}/${data.handle}.pdf`, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`Generated ${data.handle}`);
  } catch (error) {
    console.error(`Failed ${url}: ${error.message}`);
    failures.push(url);
  } finally {
    await page.close();
  }
}

await browser.close();
if (failures.length) throw new Error(`Failed to generate ${failures.length} workout PDF(s).`);
