const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'tours.db'));

const updates = [
  ['karelia-ruskeala-ladoga', 'img/tour-karelia-ruskeala.jpg'],
  ['dagestan-sulak-auls', 'img/tour-dagestan-sulak.jpg'],
  ['georgia-kazbegi-kakheti', 'img/tour-georgia-kazbegi.jpg'],
  ['turkey-cappadocia-lycia', 'img/tour-turkey-cappadocia.jpg'],
  ['uzbekistan-silk-road', 'img/tour-uzbekistan-samarkand.jpg'],
  ['sri-lanka-tea-safari-ocean', 'img/tour-sri-lanka-tea.jpg'],
  ['elbrus-panoramas', 'img/tour-elbrus-caucasus.jpg'],
  ['japan-tokyo-kyoto-fuji', 'img/tour-japan-fuji.jpg'],
  ['nepal-annapurna-comfort', 'img/tour-nepal-annapurna-comfort.jpg'],
  ['altai-chuya-mars', 'img/tour-altai-chuya.jpg'],
  ['sakhalin-iturup-comfort', 'img/tour-sakhalin-iturup.jpg'],
  ['sakhalin-adventure', 'img/tour-sakhalin-coast.jpg'],
  ['kamchatka-geysers', 'img/travel-idea-russia-kamchatka.jpg'],
  ['kenya-safari-rift-valley', 'img/tour-kenya-safari.jpg'],
  ['portugal-lisbon-porto-ocean', 'img/travel-idea-europe-dolomites.jpg'],
  ['adriatic-croatia-yacht', 'img/cruise-adriatic.jpg'],
  ['baltic-stockholm-archipelago', 'img/cruise-baltic.jpg'],
  ['red-sea-reef-cruise', 'img/cruise-red-sea.jpg'],
  ['maldives-catamaran-atolls', 'img/cruise-maldives.jpg'],
  ['mediterranean-greece-cyclades', 'img/cruise-mediterranean.jpg'],
  ['seychelles-catamaran', 'img/cruise-seychelles.jpg'],
  ['antarctica-cruise', 'img/cruise-antarctica-sh-vega.jpg'],
  ['volga-river-cruise', 'img/cruise-volga.jpg']
];

db.serialize(() => {
  const stmt = db.prepare('UPDATE tours SET main_image_url = ?, gallery_images = ?, updated_at = datetime("now") WHERE slug = ?');
  for (const [slug, image] of updates) {
    stmt.run(image, JSON.stringify([image]), slug);
  }
  stmt.finalize();
});

db.close(() => console.log(`Updated ${updates.length} tour images`));
