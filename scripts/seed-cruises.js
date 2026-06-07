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

const cruises = [
  {
    title: 'Камчатка и Курилы: экспедиционный круиз',
    slug: 'kamchatka-kurils-expedition',
    destination: 'Камчатка и Курильские острова',
    country: 'Россия',
    region: 'Дальний Восток',
    duration_days: 12,
    duration_nights: 11,
    price_usd: 7400,
    price_rub: 666000,
    old_price_usd: 8200,
    old_price_rub: 738000,
    difficulty_level: 'moderate',
    min_age: 12,
    max_group_size: 28,
    min_group_size: 8,
    start_date: '2026-07-18',
    end_date: '2026-07-29',
    main_image_url: 'img/cruise-kamchatka-kurils.jpg',
    gallery_images: JSON.stringify(['img/cruise-kamchatka-kurils.jpg', 'img/travel-idea-cruise-kamchatka.jpg']),
    short_description: 'Вулканы, бухты, морские высадки и Курильская гряда в одном большом экспедиционном маршруте.',
    full_description: 'Круиз для тех, кто хочет увидеть Дальний Восток с воды: Авачинская бухта, дикие берега Камчатки, морские птицы, горячие источники и вулканические силуэты Курил. Маршрут гибкий: капитан и экспедиционная команда подстраивают высадки под погоду и состояние моря.',
    itinerary: JSON.stringify(['Петропавловск-Камчатский и посадка на судно', 'Авачинская бухта и выход к океану', 'Дикие бухты юга Камчатки', 'Переход к Северным Курилам', 'Высадки на вулканических островах', 'Морские наблюдения и возвращение']),
    included_services: JSON.stringify(['каюта выбранной категории', 'питание на борту', 'экспедиционная команда', 'высадки на лодках при погоде', 'групповые трансферы по программе']),
    excluded_services: JSON.stringify(['авиабилеты до Петропавловска-Камчатского', 'личные расходы', 'страховка', 'одноместное размещение']),
    what_to_take: JSON.stringify(['непромокаемая куртка', 'теплый слой', 'таблетки от укачивания', 'гермомешок', 'бинокль']),
    meeting_point: 'Петропавловск-Камчатский, морской вокзал',
    available_spots: 12,
    total_spots: 28,
    status: 'upcoming',
    rating: 4.9,
    reviews_count: 18,
    views_count: 240,
    booking_count: 7
  },
  {
    title: 'Шпицберген: ледовая кромка',
    slug: 'svalbard-ice-edge',
    destination: 'Шпицберген',
    country: 'Норвегия',
    region: 'Арктика',
    duration_days: 10,
    duration_nights: 9,
    price_usd: 8900,
    price_rub: 801000,
    old_price_usd: 9600,
    old_price_rub: 864000,
    difficulty_level: 'easy',
    min_age: 14,
    max_group_size: 96,
    min_group_size: 1,
    start_date: '2026-06-22',
    end_date: '2026-07-01',
    main_image_url: 'img/cruise-svalbard-ice.jpg',
    gallery_images: JSON.stringify(['img/cruise-svalbard-ice.jpg', 'img/travel-idea-cruise-arctic.jpg']),
    short_description: 'Арктические фьорды, ледовая кромка и экспедиционные высадки в районе Шпицбергена.',
    full_description: 'Маршрут вокруг Шпицбергена для первого знакомства с Арктикой: ледники, фьорды, полярные станции и наблюдения за дикой природой с борта. Каждый день строится вокруг ледовой обстановки и погодных окон.',
    itinerary: JSON.stringify(['Лонгйир и посадка', 'Фьорды западного Шпицбергена', 'Ледники и зодиак-круизы', 'Поиск ледовой кромки', 'Экспедиционные высадки', 'Возвращение в Лонгйир']),
    included_services: JSON.stringify(['каюта', 'полный пансион', 'лекции экспедиционной команды', 'резиновые сапоги на время круиза', 'портовые сборы']),
    excluded_services: JSON.stringify(['перелет до Лонгйира', 'страховка эвакуации', 'алкоголь', 'чаевые']),
    what_to_take: JSON.stringify(['термобелье', 'теплые перчатки', 'шапка', 'солнцезащитные очки', 'камера']),
    meeting_point: 'Лонгйир, порт посадки',
    available_spots: 34,
    total_spots: 96,
    status: 'upcoming',
    rating: 4.8,
    reviews_count: 22,
    views_count: 310,
    booking_count: 11
  },
  {
    title: 'Норвегия: фьорды и Лофотены',
    slug: 'norway-fjords-lofoten',
    destination: 'Фьорды и Лофотены',
    country: 'Норвегия',
    region: 'Скандинавия',
    duration_days: 9,
    duration_nights: 8,
    price_usd: 5200,
    price_rub: 468000,
    old_price_usd: null,
    old_price_rub: null,
    difficulty_level: 'easy',
    min_age: 10,
    max_group_size: 42,
    min_group_size: 6,
    start_date: '2026-08-04',
    end_date: '2026-08-12',
    main_image_url: 'img/cruise-norway-fjords.jpg',
    gallery_images: JSON.stringify(['img/cruise-norway-fjords.jpg', 'img/travel-idea-europe-norway.jpg']),
    short_description: 'Маршрут по фьордам, рыбацким деревням и северным островам с мягким темпом.',
    full_description: 'Комфортный круиз по Норвегии: фьорды, Лофотены, короткие прогулки по берегу и северные города. Подходит тем, кто хочет красивый маршрут без тяжелых треков и частой смены отелей.',
    itinerary: JSON.stringify(['Берген', 'Согне-фьорд', 'Гейрангер', 'Тромсе', 'Лофотенские острова', 'Бодо']),
    included_services: JSON.stringify(['размещение на судне', 'завтраки и ужины', 'портовые сборы', 'экскурсии по программе']),
    excluded_services: JSON.stringify(['международный перелет', 'обеды на берегу', 'личные расходы', 'страховка']),
    what_to_take: JSON.stringify(['ветровка', 'дождевик', 'удобная обувь', 'флиска']),
    meeting_point: 'Берген, круизный терминал',
    available_spots: 18,
    total_spots: 42,
    status: 'active',
    rating: 4.7,
    reviews_count: 15,
    views_count: 190,
    booking_count: 8
  },
  {
    title: 'Эгейское море: острова и античные города',
    slug: 'aegean-islands-cruise',
    destination: 'Эгейское море',
    country: 'Греция',
    region: 'Средиземноморье',
    duration_days: 8,
    duration_nights: 7,
    price_usd: 3100,
    price_rub: 279000,
    old_price_usd: 3500,
    old_price_rub: 315000,
    difficulty_level: 'easy',
    min_age: 6,
    max_group_size: 60,
    min_group_size: 1,
    start_date: '2026-09-12',
    end_date: '2026-09-19',
    main_image_url: 'img/cruise-aegean-islands.jpg',
    gallery_images: JSON.stringify(['img/cruise-aegean-islands.jpg', 'img/travel-idea-cruise-mediterranean.jpg']),
    short_description: 'Острова, белые города, античные руины и теплое море без суеты высокого сезона.',
    full_description: 'Легкий средиземноморский круиз для первого морского путешествия. В маршруте острова Эгейского моря, старые порты, античные города и достаточно времени на прогулки без спешки.',
    itinerary: JSON.stringify(['Афины', 'Миконос', 'Санторини', 'Крит', 'Родос', 'Возвращение в Афины']),
    included_services: JSON.stringify(['каюта', 'питание на борту', 'портовые сборы', 'групповые экскурсии']),
    excluded_services: JSON.stringify(['перелет', 'визы при необходимости', 'напитки', 'личные расходы']),
    what_to_take: JSON.stringify(['легкая одежда', 'купальник', 'удобные сандалии', 'солнцезащитный крем']),
    meeting_point: 'Афины, порт Пирей',
    available_spots: 26,
    total_spots: 60,
    status: 'active',
    rating: 4.6,
    reviews_count: 31,
    views_count: 410,
    booking_count: 19
  },
  {
    title: 'Галапагосы: острова эволюции',
    slug: 'galapagos-expedition-cruise',
    destination: 'Галапагосские острова',
    country: 'Эквадор',
    region: 'Тихий океан',
    duration_days: 8,
    duration_nights: 7,
    price_usd: 6800,
    price_rub: 612000,
    old_price_usd: null,
    old_price_rub: null,
    difficulty_level: 'easy',
    min_age: 10,
    max_group_size: 16,
    min_group_size: 2,
    start_date: '2026-05-22',
    end_date: '2026-05-29',
    main_image_url: 'img/cruise-galapagos.jpg',
    gallery_images: JSON.stringify(['img/cruise-galapagos.jpg']),
    short_description: 'Небольшое судно, островные высадки, снорклинг и наблюдение за уникальной природой.',
    full_description: 'Галапагосы лучше всего смотреть с небольшого экспедиционного судна: каждый день новый остров, высадки с натуралистом, снорклинг и наблюдение за животными. Маршрут камерный и насыщенный.',
    itinerary: JSON.stringify(['Бальтра', 'Санта-Крус', 'Исабела', 'Фернандина', 'Сан-Кристобаль', 'Возвращение']),
    included_services: JSON.stringify(['каюта', 'питание', 'натуралист-гид', 'снаряжение для снорклинга', 'трансферы между островами']),
    excluded_services: JSON.stringify(['перелет до Эквадора', 'входные сборы национального парка', 'страховка', 'чаевые']),
    what_to_take: JSON.stringify(['легкая одежда', 'акваобувь', 'солнцезащита', 'водонепроницаемый чехол']),
    meeting_point: 'Аэропорт Бальтра',
    available_spots: 6,
    total_spots: 16,
    status: 'upcoming',
    rating: 4.9,
    reviews_count: 12,
    views_count: 260,
    booking_count: 5
  },
  {
    title: 'Аляска: Inside Passage',
    slug: 'alaska-inside-passage',
    destination: 'Аляска',
    country: 'США',
    region: 'Северная Америка',
    duration_days: 9,
    duration_nights: 8,
    price_usd: 5900,
    price_rub: 531000,
    old_price_usd: 6400,
    old_price_rub: 576000,
    difficulty_level: 'easy',
    min_age: 8,
    max_group_size: 72,
    min_group_size: 1,
    start_date: '2026-07-07',
    end_date: '2026-07-15',
    main_image_url: 'img/cruise-alaska-passage.jpg',
    gallery_images: JSON.stringify(['img/cruise-alaska-passage.jpg']),
    short_description: 'Ледники, хвойные берега, китовые маршруты и спокойный североамериканский круиз.',
    full_description: 'Inside Passage - классический маршрут по защищенным водам Аляски. Он сочетает ледники, небольшие порты, наблюдение за китами и комфортный темп без сложной физической нагрузки.',
    itinerary: JSON.stringify(['Ванкувер', 'Джуно', 'Скагуэй', 'Ледниковая бухта', 'Кетчикан', 'Ванкувер']),
    included_services: JSON.stringify(['каюта', 'питание на борту', 'портовые сборы', 'сопровождение']),
    excluded_services: JSON.stringify(['перелет', 'виза США/Канады', 'экскурсии по желанию', 'страховка']),
    what_to_take: JSON.stringify(['дождевик', 'бинокль', 'теплая кофта', 'удобная обувь']),
    meeting_point: 'Ванкувер, круизный терминал',
    available_spots: 21,
    total_spots: 72,
    status: 'upcoming',
    rating: 4.8,
    reviews_count: 24,
    views_count: 330,
    booking_count: 14
  },
  {
    title: 'Сахалин и Япония: северный морской путь',
    slug: 'sakhalin-japan-north-cruise',
    destination: 'Сахалин и Хоккайдо',
    country: 'Россия / Япония',
    region: 'Северная Пацифика',
    duration_days: 11,
    duration_nights: 10,
    price_usd: 6200,
    price_rub: 558000,
    old_price_usd: null,
    old_price_rub: null,
    difficulty_level: 'moderate',
    min_age: 12,
    max_group_size: 36,
    min_group_size: 8,
    start_date: '2026-10-03',
    end_date: '2026-10-13',
    main_image_url: 'img/cruise-sakhalin-japan.jpg',
    gallery_images: JSON.stringify(['img/cruise-sakhalin-japan.jpg']),
    short_description: 'Редкий маршрут между Сахалином и северной Японией: маяки, бухты, рыбацкие города и осеннее море.',
    full_description: 'Круиз для тех, кто любит нестандартные северные маршруты. Сахалинские берега, островная культура, переход к Хоккайдо и остановки в небольших портах создают спокойный, но необычный сценарий путешествия.',
    itinerary: JSON.stringify(['Южно-Сахалинск', 'Корсаков', 'Сахалинское побережье', 'Переход к Хоккайдо', 'Северные порты Японии', 'Завершение маршрута']),
    included_services: JSON.stringify(['размещение', 'питание', 'экскурсионная программа', 'портовые сборы']),
    excluded_services: JSON.stringify(['перелеты', 'визы и документы', 'личные расходы', 'страховка']),
    what_to_take: JSON.stringify(['ветровка', 'теплый слой', 'удобная обувь', 'загранпаспорт']),
    meeting_point: 'Южно-Сахалинск',
    available_spots: 14,
    total_spots: 36,
    status: 'upcoming',
    rating: 4.7,
    reviews_count: 9,
    views_count: 170,
    booking_count: 4
  },
  {
    title: 'Антарктида и Южная Георгия',
    slug: 'antarctica-south-georgia-expedition',
    destination: 'Антарктида и Южная Георгия',
    country: 'Антарктида',
    region: 'Южная Атлантика',
    duration_days: 18,
    duration_nights: 17,
    price_usd: 24500,
    price_rub: 2205000,
    old_price_usd: 26200,
    old_price_rub: 2358000,
    difficulty_level: 'moderate',
    min_age: 14,
    max_group_size: 120,
    min_group_size: 1,
    start_date: '2027-01-12',
    end_date: '2027-01-29',
    main_image_url: 'img/cruise-antarctica-georgia.jpg',
    gallery_images: JSON.stringify(['img/cruise-antarctica-georgia.jpg', 'img/travel-idea-antarctica-georgia.jpg']),
    short_description: 'Большая полярная экспедиция: Антарктический полуостров, Южная Георгия и Южная Атлантика.',
    full_description: 'Один из самых сильных экспедиционных маршрутов: лед Антарктики, колонии королевских пингвинов Южной Георгии, открытое море и насыщенная лекционная программа на борту. Подходит тем, кто готов к длинному путешествию ради редких мест.',
    itinerary: JSON.stringify(['Ушуайя', 'Пролив Дрейка', 'Антарктический полуостров', 'Южная Георгия', 'Южная Атлантика', 'Возвращение']),
    included_services: JSON.stringify(['каюта', 'питание', 'экспедиционная команда', 'высадки по погоде', 'лекционная программа']),
    excluded_services: JSON.stringify(['перелеты', 'страховка эвакуации', 'одноместное размещение', 'личные расходы']),
    what_to_take: JSON.stringify(['полярная одежда', 'морская аптечка', 'бинокль', 'защита техники от влаги']),
    meeting_point: 'Ушуайя, порт',
    available_spots: 39,
    total_spots: 120,
    status: 'upcoming',
    rating: 4.9,
    reviews_count: 27,
    views_count: 520,
    booking_count: 16
  }
];

async function main() {
  await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_tours_slug ON tours(slug)');

  const columns = [
    'title', 'slug', 'destination', 'country', 'region', 'duration_days', 'duration_nights',
    'price_usd', 'price_rub', 'old_price_usd', 'old_price_rub', 'difficulty_level',
    'min_age', 'max_group_size', 'min_group_size', 'is_individual', 'is_group', 'is_cruise',
    'start_date', 'end_date', 'is_flexible_dates', 'main_image_url', 'gallery_images',
    'short_description', 'full_description', 'itinerary', 'included_services',
    'excluded_services', 'what_to_take', 'meeting_point', 'available_spots', 'total_spots',
    'status', 'rating', 'reviews_count', 'views_count', 'booking_count'
  ];

  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.filter(column => column !== 'slug').map(column => `${column}=excluded.${column}`).join(', ');
  const sql = `
    INSERT INTO tours (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(slug) DO UPDATE SET ${updates}, updated_at = datetime('now')
  `;

  for (const cruise of cruises) {
    const values = columns.map(column => {
      if (column === 'is_individual') return 0;
      if (column === 'is_group') return 1;
      if (column === 'is_cruise') return 1;
      if (column === 'is_flexible_dates') return 0;
      return cruise[column] ?? null;
    });
    await dbRun(sql, values);
  }

  console.log(`Seeded ${cruises.length} cruises`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
