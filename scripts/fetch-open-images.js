const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const imgDir = path.join(root, 'img');

const images = [
  ['tour-karelia-ruskeala.jpg', 'Ruskeala Karelia lake marble canyon'],
  ['tour-dagestan-sulak.jpg', 'Sulak canyon Dagestan'],
  ['tour-georgia-kazbegi.jpg', 'Kazbegi Georgia mountains Gergeti'],
  ['tour-dolomites-hike.jpg', 'Seceda Dolomites mountains'],
  ['tour-morocco-sahara.jpg', 'Erg Chebbi Sahara Morocco dunes'],
  ['tour-turkey-cappadocia.jpg', 'Cappadocia balloons landscape'],
  ['tour-japan-fuji.jpg', 'Mount Fuji Japan landscape'],
  ['tour-madeira-levada.jpg', 'Madeira levada mountains'],
  ['tour-uzbekistan-samarkand.jpg', 'Samarkand Registan Uzbekistan'],
  ['tour-kenya-safari.jpg', 'Kenya safari savanna'],
  ['cruise-mediterranean.jpg', 'Santorini Greece sea'],
  ['cruise-red-sea.jpg', 'Red Sea coral reef'],
  ['cruise-adriatic.jpg', 'Dubrovnik Adriatic sea'],
  ['cruise-baltic.jpg', 'Stockholm archipelago Baltic sea'],
];

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 travel-site-content-seeder' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function download(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 travel-site-content-seeder' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(filePath, () => {});
        download(res.headers.location, filePath).then(resolve, reject);
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
    }).on('error', (error) => {
      file.close();
      fs.unlink(filePath, () => {});
      reject(error);
    });
  });
}

async function findImage(query) {
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1400&format=json`;
  const data = await requestJson(searchUrl);
  const pages = Object.values(data.query?.pages || {});
  return pages
    .map(page => ({ title: page.title, info: page.imageinfo?.[0] }))
    .filter(item => item.info?.thumburl && item.info.mime?.startsWith('image/'))
    .filter(item => (item.info.width || 0) >= 900 && (item.info.height || 0) >= 500)
    .sort((a, b) => (b.info.width * b.info.height) - (a.info.width * a.info.height))[0];
}

(async () => {
  const sourceLines = [];
  for (const [fileName, query] of images) {
    const filePath = path.join(imgDir, fileName);
    try {
      const found = await findImage(query);
      if (!found) {
        console.log(`MISS ${fileName}`);
        continue;
      }
      await download(found.info.thumburl, filePath);
      sourceLines.push(`- \`${fileName}\` - Wikimedia Commons search: \`${query}\`, ${found.title}`);
      console.log(`OK ${fileName} <= ${found.title}`);
    } catch (error) {
      console.log(`FAIL ${fileName}: ${error.message}`);
    }
  }

  if (sourceLines.length) {
    fs.appendFileSync(path.join(imgDir, 'IMAGE_SOURCES.md'), `\n## Wikimedia Commons auto-search\n\n${sourceLines.join('\n')}\n`);
  }
})();
