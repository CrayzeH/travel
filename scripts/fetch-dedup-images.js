const fs = require('fs');
const path = require('path');

const imgDir = path.join(__dirname, '..', 'img');
const sourcesPath = path.join(imgDir, 'IMAGE_SOURCES.md');

const targets = [
  ['tour-karelia-ruskeala.jpg', 'Ruskeala marble canyon Karelia lake'],
  ['tour-dagestan-sulak.jpg', 'Sulak canyon Dagestan landscape'],
  ['tour-georgia-kazbegi.jpg', 'Kazbegi Gergeti Trinity Church mountains'],
  ['tour-turkey-cappadocia.jpg', 'Cappadocia hot air balloons landscape'],
  ['tour-uzbekistan-samarkand.jpg', 'Registan Samarkand Uzbekistan'],
  ['tour-sri-lanka-tea.jpg', 'Sri Lanka tea plantations train'],
  ['tour-elbrus-caucasus.jpg', 'Mount Elbrus Caucasus mountains'],
  ['tour-japan-fuji.jpg', 'Mount Fuji Japan landscape'],
  ['tour-nepal-annapurna-comfort.jpg', 'Annapurna Nepal mountains village'],
  ['tour-altai-chuya.jpg', 'Altai Chuya highway mountains'],
  ['tour-sakhalin-iturup.jpg', 'Iturup island volcano coast'],
  ['tour-sakhalin-coast.jpg', 'Sakhalin island coast landscape'],
  ['cruise-adriatic.jpg', 'Dubrovnik Adriatic sea Croatia'],
  ['cruise-baltic.jpg', 'Stockholm archipelago sea'],
  ['cruise-red-sea.jpg', 'Red Sea coral reef Egypt'],
  ['cruise-maldives.jpg', 'Maldives atoll ocean'],
  ['cruise-mediterranean.jpg', 'Santorini Greece sea'],
  ['cruise-seychelles.jpg', 'Seychelles beach granite rocks'],
  ['cruise-antarctica-sh-vega.jpg', 'Antarctica cruise ship ice'],
  ['cruise-volga.jpg', 'Volga river Kazan Russia'],
];

const usedTitles = new Set();

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 travel-site-image-dedup' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function download(url, filePath, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 travel-site-image-dedup' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 30000) throw new Error('file too small');
    fs.writeFileSync(filePath, buffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function findImage(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1400&format=json`;
  const data = await fetchJson(url);
  const pages = Object.values(data.query?.pages || {});
  return pages
    .map(page => ({ title: page.title, info: page.imageinfo?.[0] }))
    .filter(item => item.info?.thumburl && item.info.mime?.startsWith('image/'))
    .filter(item => !usedTitles.has(item.title))
    .filter(item => (item.info.width || 0) >= 900 && (item.info.height || 0) >= 500)
    .sort((a, b) => (b.info.width * b.info.height) - (a.info.width * a.info.height))[0];
}

(async () => {
  const lines = [];
  for (const [fileName, query] of targets) {
    try {
      const found = await findImage(query);
      if (!found) {
        console.log(`MISS ${fileName}`);
        continue;
      }
      usedTitles.add(found.title);
      await download(found.info.thumburl, path.join(imgDir, fileName));
      lines.push(`- \`${fileName}\` - Wikimedia Commons search: \`${query}\`, ${found.title}`);
      console.log(`OK ${fileName} <= ${found.title}`);
    } catch (error) {
      console.log(`FAIL ${fileName}: ${error.message}`);
    }
  }
  if (lines.length) {
    fs.appendFileSync(sourcesPath, `\n## Wikimedia Commons dedup\n\n${lines.join('\n')}\n`);
  }
})();
