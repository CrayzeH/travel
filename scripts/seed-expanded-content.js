const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'tours.db'));

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

const baseIncluded = JSON.stringify(['программа по маршруту', 'сопровождение координатора', 'подбор проживания', 'помощь с подготовкой', 'групповой чат до старта']);
const baseExcluded = JSON.stringify(['авиабилеты', 'личные расходы', 'страховка', 'питание вне программы']);
const basePacking = JSON.stringify(['удобная обувь', 'ветровка', 'личная аптечка', 'документы', 'пауэрбанк']);

const priceFixes = [
  ['kamchatka-geysers', 245000, 0, 0, '2026-07-15', '2026-07-22'],
  ['klyuchevskoy-ascent', 189000, 0, 0, '2026-08-05', '2026-08-14'],
  ['sakhalin-adventure', 165000, 0, 0, '2026-09-10', '2026-09-16'],
  ['pakistan-karakoram', 288000, 0, 0, '2026-10-06', '2026-10-20'],
  ['baikal-ice', 99000, 0, 0, '2027-02-10', '2027-02-17'],
  ['altai-mountains', 89000, 0, 0, '2026-08-05', '2026-08-14'],
  ['antarctica-cruise', 1090000, 0, 1, '2027-01-09', '2027-01-20'],
  ['antarctica-south-georgia-expedition', 1190000, 0, 1, '2027-01-12', '2027-01-29']
];

const items = [
  ['Карелия: Рускеала и Ладожские шхеры','karelia-ruskeala-ladoga','Карелия','Россия','Северо-Запад',5,4,79000,'easy',14,18,0,'2026-07-04','2026-07-08','img/travel-idea-russia-teriberka.jpg','Мраморный каньон, шхеры Ладоги, водопады и спокойный северный ритм без сложной логистики.'],
  ['Дагестан: Сулакский каньон и аулы','dagestan-sulak-auls','Дагестан','Россия','Кавказ',6,5,95000,'moderate',14,16,0,'2026-09-05','2026-09-10','img/travel-idea-russia-altai.jpg','Каньоны, барханы, горные дороги, древние аулы и локальная кухня в компактной программе.'],
  ['Кольский полуостров: Териберка и северное сияние','kola-teriberka-aurora','Кольский полуостров','Россия','Арктика',5,4,72000,'easy',12,18,0,'2027-01-18','2027-01-22','img/travel-idea-russia-teriberka.jpg','Зимнее Баренцево море, побережье Териберки, северное сияние и охота за красивой погодой.'],
  ['Байкал летом: Ольхон и Малое море','baikal-summer-olkhon','Байкал','Россия','Сибирь',7,6,118000,'easy',10,18,0,'2026-07-19','2026-07-25','img/tour-baikal.png','Летний Байкал с островом Ольхон, бухтами Малого моря, прогулками и этнопарком.'],
  ['Алтай: Чуйский тракт и Марс','altai-chuya-mars','Алтай','Россия','Сибирь',8,7,112000,'moderate',12,16,0,'2026-08-15','2026-08-22','img/tour-altai.png','Автопутешествие по Чуйскому тракту: перевалы, долины, бирюзовые реки и марсианские пейзажи.'],
  ['Эльбрус без восхождения: Кавказские панорамы','elbrus-panoramas','Приэльбрусье','Россия','Кавказ',6,5,89000,'easy',10,18,0,'2026-06-26','2026-07-01','img/travel-idea-russia-altai.jpg','Комфортный Кавказ с канатными дорогами, ущельями, горячими источниками и видами на Эльбрус.'],
  ['Сахалин и Итуруп: океан, вулканы, термы','sakhalin-iturup-comfort','Сахалин и Итуруп','Россия','Дальний Восток',8,7,198000,'moderate',14,14,0,'2026-09-03','2026-09-10','img/cruise-sakhalin-japan.jpg','Островной маршрут с океанскими пляжами, лавовыми плато, горячими источниками и морепродуктами.'],
  ['Камчатка налегке: вулканы и океан','kamchatka-light-volcanoes','Камчатка','Россия','Дальний Восток',7,6,219000,'moderate',12,14,0,'2026-08-12','2026-08-18','img/travel-idea-russia-kamchatka.jpg','Доступная Камчатка с вулканами, Тихим океаном, морской прогулкой и термальными бассейнами.'],

  ['Грузия: Казбеги, Кахетия и Тбилиси','georgia-kazbegi-kakheti','Грузия','Грузия','Кавказ',7,6,125000,'easy',12,16,0,'2026-09-18','2026-09-24','img/travel-idea-europe-norway.jpg','Горы, винодельни, старый Тбилиси, Военно-Грузинская дорога и семейные застолья.'],
  ['Армения: монастыри, горы и Ереван','armenia-mountains-monasteries','Армения','Армения','Кавказ',6,5,99000,'easy',10,16,0,'2026-10-02','2026-10-07','img/travel-idea-asia-nepal.jpg','Камерный маршрут по Армении с древними монастырями, озером Севан и гастрономией.'],
  ['Узбекистан: Самарканд, Бухара, Хива','uzbekistan-silk-road','Узбекистан','Узбекистан','Центральная Азия',8,7,132000,'easy',10,18,0,'2026-10-11','2026-10-18','img/travel-idea-asia-japan.jpg','Большой маршрут по городам Шелкового пути с переездами на поездах и восточными базарами.'],
  ['Турция: Каппадокия и Ликийское побережье','turkey-cappadocia-lycia','Каппадокия и Ликия','Турция','Малая Азия',8,7,148000,'moderate',12,16,0,'2026-05-16','2026-05-23','img/travel-idea-europe-dolomites.jpg','Воздушные шары, долины Каппадокии, античные руины и бирюзовое побережье.'],
  ['Непал: комфортный трек к Аннапурне','nepal-annapurna-comfort','Аннапурна','Непал','Гималаи',12,11,225000,'challenging',16,12,0,'2026-11-03','2026-11-14','img/tour-nepal.png','Треккинг с красивыми лоджами, постепенной акклиматизацией и видами на восьмитысячники.'],
  ['Япония: Токио, Киото и Фудзи','japan-tokyo-kyoto-fuji','Токио, Киото, Фудзи','Япония','Восточная Азия',9,8,285000,'easy',12,14,0,'2026-11-12','2026-11-20','img/travel-idea-asia-japan.jpg','Города, храмы, онсэны, скоростные поезда и день у подножия Фудзи.'],
  ['Бали: вулканы, рисовые террасы и океан','bali-volcano-rice-ocean','Бали','Индонезия','Юго-Восточная Азия',10,9,175000,'easy',10,16,0,'2026-09-22','2026-10-01','img/travel-idea-asia-bali.jpg','Баланс океана, природы, храмов, легкого хайкинга и красивых вилл.'],
  ['Шри-Ланка: сафари, чай и океан','sri-lanka-tea-safari-ocean','Шри-Ланка','Шри-Ланка','Индийский океан',10,9,168000,'easy',10,16,0,'2026-12-03','2026-12-12','img/tour-thailand.png','Чайные плантации, поезд через горы, сафари в нацпарке и финал у океана.'],

  ['Исландия: кольцевая дорога','iceland-ring-road','Исландия','Исландия','Северная Европа',9,8,315000,'moderate',14,12,0,'2026-08-20','2026-08-28','img/tour-iceland-ring.jpg','Водопады, ледники, черные пляжи, геотермальные зоны и автопутешествие вокруг острова.'],
  ['Доломиты: хайкинг и озера','dolomites-hiking-lakes','Доломиты','Италия','Альпы',7,6,198000,'moderate',14,14,0,'2026-07-07','2026-07-13','img/travel-idea-europe-dolomites.jpg','Горные тропы, озера, перевалы и уютные альпийские городки без тяжелого рюкзака.'],
  ['Мадейра: левады и океанские тропы','madeira-levadas-ocean','Мадейра','Португалия','Атлантика',8,7,182000,'moderate',12,14,0,'2026-10-18','2026-10-25','img/travel-idea-europe-iceland.jpg','Зеленые левады, скалы над океаном, лавровые леса и мягкий климат круглый год.'],
  ['Норвегия: фьорды без круиза','norway-fjords-roadtrip','Фьорды Норвегии','Норвегия','Скандинавия',8,7,265000,'easy',12,12,0,'2026-08-06','2026-08-13','img/travel-idea-europe-norway.jpg','Автомаршрут по фьордам, видовые дороги, паромы и небольшие скандинавские города.'],
  ['Португалия: Лиссабон, Порту и океан','portugal-lisbon-porto-ocean','Португалия','Португалия','Европа',8,7,176000,'easy',10,16,0,'2026-09-09','2026-09-16','img/cruise-douro.jpg','Города, винодельни, побережье Атлантики и спокойный европейский ритм.'],
  ['Марокко: Атлас и Сахара','morocco-atlas-sahara','Марокко','Марокко','Северная Африка',9,8,155000,'moderate',12,16,0,'2026-11-06','2026-11-14','img/tour-morocco-sahara.jpg','Медины, перевалы Атласа, ночь в пустыне, касбы и восточная кухня.'],
  ['Кения: сафари и озера Рифт-Валли','kenya-safari-rift-valley','Кения','Кения','Восточная Африка',8,7,295000,'easy',10,12,0,'2027-02-08','2027-02-15','img/tour-morocco-sahara.jpg','Сафари в нацпарках, озера Рифт-Валли, лоджи и наблюдение за большой африканской фауной.'],
  ['Перу: Мачу-Пикчу и Священная долина','peru-machu-picchu-valley','Перу','Перу','Южная Америка',10,9,335000,'moderate',14,12,0,'2026-09-25','2026-10-04','img/tour-peru-machu.jpg','Куско, Священная долина, поезд к Мачу-Пикчу и мягкая акклиматизация.'],

  ['Средиземное море: Греция и Киклады','mediterranean-greece-cyclades','Греция и Киклады','Греция','Средиземное море',8,7,245000,'easy',8,42,1,'2026-06-14','2026-06-21','img/travel-idea-cruise-mediterranean.jpg','Острова Эгейского моря, белые города, купания, порты и комфортный темп на борту.'],
  ['Красное море: рифы и острова','red-sea-reef-cruise','Красное море','Египет','Красное море',7,6,185000,'easy',10,24,1,'2026-11-21','2026-11-27','img/travel-idea-cruise-mediterranean.jpg','Теплое море, снорклинг, коралловые рифы, острова и короткие переходы между стоянками.'],
  ['Адриатика: Хорватия на яхте','adriatic-croatia-yacht','Хорватия','Хорватия','Адриатика',8,7,225000,'easy',10,16,1,'2026-07-25','2026-08-01','img/cruise-aegean-islands.jpg','Яхтенный маршрут по островам Хорватии с купаниями, маринами и старинными городами.'],
  ['Дору: винный речной круиз','douro-river-wine-cruise','Долина Дору','Португалия','Река Дору',7,6,210000,'easy',12,36,1,'2026-09-19','2026-09-25','img/cruise-douro.jpg','Речной круиз по винной долине Дору с дегустациями, смотровыми площадками и Порту.'],
  ['Балтика: Стокгольмский архипелаг','baltic-stockholm-archipelago','Стокгольмский архипелаг','Швеция','Балтика',6,5,165000,'easy',8,40,1,'2026-08-18','2026-08-23','img/cruise-norway-fjords.jpg','Короткий северный круиз по островам, маякам, рыбацким поселкам и спокойной Балтике.'],
  ['Волга: Казань, Самара, Саратов','volga-river-cruise','Волга','Россия','Поволжье',6,5,82000,'easy',6,80,1,'2026-07-01','2026-07-06','img/Group%20193.png','Речной круиз по Волге с городскими прогулками, музеями и комфортом без перелетов.'],
  ['Мальдивы: катамаран и атоллы','maldives-catamaran-atolls','Мальдивы','Мальдивы','Индийский океан',8,7,295000,'easy',10,12,1,'2027-03-04','2027-03-11','img/travel-idea-cruise-mediterranean.jpg','Камерный морской маршрут по атоллам, снорклинг, песчаные банки и ночевки на катамаране.'],
  ['Сейшелы: острова на катамаране','seychelles-catamaran','Сейшелы','Сейшелы','Индийский океан',9,8,365000,'easy',10,12,1,'2027-04-10','2027-04-18','img/cruise-galapagos.jpg','Гранитные острова, пляжи, заповедники и мягкий яхтенный формат для небольшой группы.']
];

function buildItem(row) {
  const [title, slug, destination, country, region, days, nights, priceRub, difficulty, minAge, group, isCruise, start, end, image, short] = row;
  const totalSpots = isCruise ? group : group;
  return {
    title, slug, destination, country, region,
    duration_days: days, duration_nights: nights,
    price_rub: priceRub, price_usd: 0,
    old_price_rub: Math.round(priceRub * 1.12), old_price_usd: 0,
    difficulty_level: difficulty, min_age: minAge,
    max_group_size: group, min_group_size: isCruise ? 1 : 6,
    is_individual: 0, is_group: 1, is_cruise: isCruise,
    start_date: start, end_date: end, is_flexible_dates: 0,
    main_image_url: image, gallery_images: JSON.stringify([image]),
    short_description: short,
    full_description: `${short} Программа собрана так, чтобы маршрут был насыщенным, но без лишней гонки: понятная логистика, проверенные точки, время на отдых и сопровождение до старта.`,
    itinerary: JSON.stringify(['Встреча группы и брифинг', 'Главные природные и городские локации', 'Свободное время и локальные впечатления', 'Финальный день и возвращение']),
    included_services: baseIncluded,
    excluded_services: baseExcluded,
    what_to_take: basePacking,
    meeting_point: destination,
    available_spots: Math.max(4, Math.floor(totalSpots * 0.55)),
    total_spots: totalSpots,
    status: 'upcoming',
    rating: 4.7,
    reviews_count: Math.floor(6 + Math.random() * 28),
    views_count: Math.floor(80 + Math.random() * 500),
    booking_count: Math.floor(2 + Math.random() * 16)
  };
}

async function upsertTour(tour) {
  await dbRun(`
    INSERT INTO tours (
      title, slug, destination, country, region, duration_days, duration_nights, price_usd, price_rub,
      old_price_usd, old_price_rub, difficulty_level, min_age, max_group_size, min_group_size,
      is_individual, is_group, is_cruise, start_date, end_date, is_flexible_dates, main_image_url,
      gallery_images, short_description, full_description, itinerary, included_services, excluded_services,
      what_to_take, meeting_point, available_spots, total_spots, status, rating, reviews_count,
      views_count, booking_count, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
    )
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, destination=excluded.destination, country=excluded.country, region=excluded.region,
      duration_days=excluded.duration_days, duration_nights=excluded.duration_nights,
      price_usd=excluded.price_usd, price_rub=excluded.price_rub, old_price_usd=excluded.old_price_usd, old_price_rub=excluded.old_price_rub,
      difficulty_level=excluded.difficulty_level, min_age=excluded.min_age, max_group_size=excluded.max_group_size, min_group_size=excluded.min_group_size,
      is_individual=excluded.is_individual, is_group=excluded.is_group, is_cruise=excluded.is_cruise,
      start_date=excluded.start_date, end_date=excluded.end_date, is_flexible_dates=excluded.is_flexible_dates,
      main_image_url=excluded.main_image_url, gallery_images=excluded.gallery_images,
      short_description=excluded.short_description, full_description=excluded.full_description,
      itinerary=excluded.itinerary, included_services=excluded.included_services, excluded_services=excluded.excluded_services,
      what_to_take=excluded.what_to_take, meeting_point=excluded.meeting_point,
      available_spots=excluded.available_spots, total_spots=excluded.total_spots, status=excluded.status,
      rating=excluded.rating, reviews_count=excluded.reviews_count, views_count=excluded.views_count,
      booking_count=excluded.booking_count, updated_at=datetime('now')
  `, [
    tour.title, tour.slug, tour.destination, tour.country, tour.region, tour.duration_days, tour.duration_nights,
    tour.price_usd, tour.price_rub, tour.old_price_usd, tour.old_price_rub, tour.difficulty_level, tour.min_age,
    tour.max_group_size, tour.min_group_size, tour.is_individual, tour.is_group, tour.is_cruise,
    tour.start_date, tour.end_date, tour.is_flexible_dates, tour.main_image_url, tour.gallery_images,
    tour.short_description, tour.full_description, tour.itinerary, tour.included_services, tour.excluded_services,
    tour.what_to_take, tour.meeting_point, tour.available_spots, tour.total_spots, tour.status,
    tour.rating, tour.reviews_count, tour.views_count, tour.booking_count
  ]);
}

(async () => {
  await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_tours_slug ON tours(slug)');

  for (const [slug, priceRub, priceUsd, isCruise, startDate, endDate] of priceFixes) {
    await dbRun(
      `UPDATE tours
       SET price_rub = ?, price_usd = ?, old_price_rub = NULL, old_price_usd = NULL,
           is_cruise = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
       WHERE slug = ?`,
      [priceRub, priceUsd, isCruise, startDate, endDate, slug]
    );
  }

  for (const row of items) {
    await upsertTour(buildItem(row));
  }

  console.log(`Seeded ${items.length} expanded tours and cruises; fixed ${priceFixes.length} prices.`);
  db.close();
})().catch(error => {
  console.error(error);
  db.close();
  process.exit(1);
});
