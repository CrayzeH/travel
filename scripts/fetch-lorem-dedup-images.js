const fs = require('fs');
const path = require('path');
const https = require('https');

const imgDir = path.join(__dirname, '..', 'img');
const sourcesPath = path.join(imgDir, 'IMAGE_SOURCES.md');

const targets = [
  ['tour-dagestan-sulak.jpg', 'dagestan,canyon,mountains'],
  ['tour-turkey-cappadocia.jpg', 'cappadocia,balloons,landscape'],
  ['tour-uzbekistan-samarkand.jpg', 'samarkand,uzbekistan,architecture'],
  ['tour-sri-lanka-tea.jpg', 'sri-lanka,tea,plantation'],
  ['tour-elbrus-caucasus.jpg', 'elbrus,caucasus,mountains'],
  ['tour-japan-fuji.jpg', 'fuji,japan,mountain'],
  ['tour-nepal-annapurna-comfort.jpg', 'annapurna,nepal,mountains'],
  ['tour-altai-chuya.jpg', 'altai,mountains,road'],
  ['tour-sakhalin-iturup.jpg', 'iturup,island,volcano'],
  ['tour-sakhalin-coast.jpg', 'sakhalin,coast,sea'],
  ['tour-kenya-safari.jpg', 'kenya,safari,savanna'],
  ['tour-portugal-ocean.jpg', 'portugal,lisbon,ocean'],
  ['cruise-adriatic.jpg', 'croatia,adriatic,sea'],
  ['cruise-baltic.jpg', 'stockholm,archipelago,sea'],
  ['cruise-red-sea.jpg', 'red-sea,coral,reef'],
  ['cruise-maldives.jpg', 'maldives,atoll,ocean'],
  ['cruise-mediterranean.jpg', 'santorini,greece,sea'],
  ['cruise-seychelles.jpg', 'seychelles,beach,ocean'],
  ['cruise-antarctica-sh-vega.jpg', 'antarctica,ice,ship'],
  ['cruise-volga.jpg', 'volga,river,russia'],
];

function download(url, filePath, timeoutMs = 18000) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    file.on('error', reject);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(filePath, () => {});
        const nextUrl = new URL(res.headers.location, url).toString();
        download(nextUrl, filePath, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(filePath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (error) => {
      file.close();
      fs.unlink(filePath, () => {});
      reject(error);
    });
  });
}

function isProbablyBad(filePath) {
  const size = fs.statSync(filePath).size;
  if (size < 45000) return true;
  const buffer = fs.readFileSync(filePath);
  const sample = buffer.subarray(0, Math.min(buffer.length, 16000));
  let redLike = 0;
  for (let i = 0; i < sample.length - 2; i += 97) {
    const r = sample[i], g = sample[i + 1], b = sample[i + 2];
    if (r > 180 && g < 80 && b < 80) redLike++;
  }
  return redLike > 65;
}

(async () => {
  const lines = [];
  let seed = 101;
  for (const [fileName, query] of targets) {
    const filePath = path.join(imgDir, fileName);
    let ok = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const lock = seed++;
      const tags = query.split(',').map(tag => tag.trim()).join(',');
      const url = new URL(`https://loremflickr.com/1400/900/${tags}`);
      url.searchParams.set('lock', String(lock));
      try {
        await download(url.toString(), filePath);
        if (isProbablyBad(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`BAD ${fileName} lock=${lock}`);
          continue;
        }
        lines.push(`- \`${fileName}\` - LoremFlickr checked: \`${url.toString()}\``);
        console.log(`OK ${fileName} lock=${lock}`);
        ok = true;
        break;
      } catch (error) {
        console.log(`FAIL ${fileName} lock=${lock}: ${error.message}`);
      }
    }
    if (!ok) console.log(`MISS ${fileName}`);
  }
  if (lines.length) {
    fs.appendFileSync(sourcesPath, `\n## LoremFlickr checked dedup\n\n${lines.join('\n')}\n`);
  }
})();
