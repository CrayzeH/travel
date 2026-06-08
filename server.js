const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
const JWT_REFRESH_SECRET = 'your-refresh-secret-key-change-this';
const DATA_DIR = process.env.DATA_DIR || process.env.PERSISTENT_STORAGE_DIR || __dirname;
const DB_PATH = process.env.SQLITE_DB_PATH || process.env.DB_PATH || path.join(DATA_DIR, 'tours.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
const ADMIN_IMAGES_DIR = process.env.ADMIN_IMAGES_DIR || path.join(DATA_DIR, 'img');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function prepareDatabaseFile() {
    ensureDir(path.dirname(DB_PATH));
    const bundledDbPath = path.join(__dirname, 'tours.db');
    if (DB_PATH !== bundledDbPath && !fs.existsSync(DB_PATH) && fs.existsSync(bundledDbPath)) {
        fs.copyFileSync(bundledDbPath, DB_PATH);
    }
}

prepareDatabaseFile();
ensureDir(UPLOADS_DIR);
ensureDir(ADMIN_IMAGES_DIR);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/img', express.static(ADMIN_IMAGES_DIR));
app.use(express.static(path.join(__dirname, '/')));

// Настройка загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

const imageExtensionsByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

function safeImageBaseName(value) {
    return String(value || 'image')
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';
}

const adminImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, ADMIN_IMAGES_DIR);
    },
    filename: (req, file, cb) => {
        const extension = imageExtensionsByMime[file.mimetype] || path.extname(file.originalname).toLowerCase();
        const baseName = safeImageBaseName(req.body.slug || req.body.title || file.originalname);
        cb(null, `${baseName}-${Date.now()}${extension}`);
    }
});

const adminImageUpload = multer({
    storage: adminImageStorage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!imageExtensionsByMime[file.mimetype]) {
            return cb(new Error('Можно загружать только JPG, PNG, WEBP или GIF'));
        }
        cb(null, true);
    }
});

// Подключение к базе данных
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('Подключено к базе данных SQLite');
    }
});

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

// Функция для выполнения запросов с промисами
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
    const value = String(phone || '').trim();
    return value ? value.replace(/[^\d]/g, '') : '';
}

function cleanOptionalText(value) {
    const text = String(value || '').trim();
    return text || null;
}

function numberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
    if (value === undefined || value === null || value === '') return 0;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

const travelIdeaCategories = [
    { slug: 'russia', name: 'Россия', order_index: 1 },
    { slug: 'europe', name: 'Европа', order_index: 2 },
    { slug: 'asia', name: 'Азия', order_index: 3 },
    { slug: 'antarctica', name: 'Антарктида', order_index: 4 },
    { slug: 'cruises', name: 'Круизы', order_index: 5 }
];

const travelIdeasSeed = [
    ['russia', 'Камчатка без спешки', 'Август', '23', 'Камчатка', 'Гейзеры, вулканы и тихие бухты для тех, кто хочет увидеть дикий восток России без перегруза в программе.', 'travel-idea-russia-kamchatka.jpg', 'ideas.html', 1],
    ['russia', 'Териберка и северное сияние', 'Февраль', '11', 'Кольский', 'Короткая поездка к Баренцеву морю: океан, скалы, арктический ветер и шанс поймать северное сияние.', 'travel-idea-russia-teriberka.jpg', 'ideas.html', 2],
    ['russia', 'Алтайские озера', 'Июль', '28', 'Алтай', 'Маршрут по горным озерам, перевалам и долинам для первой большой поездки в Алтай.', 'travel-idea-russia-altai.jpg', 'ideas.html', 3],
    ['europe', 'Исландия по кольцу', 'Июнь', '09', 'Исландия', 'Водопады, черные пляжи, ледниковые лагуны и геотермальные долины в одном мощном маршруте.', 'travel-idea-europe-iceland.jpg', 'ideas.html', 1],
    ['europe', 'Доломиты на рассвете', 'Сентябрь', '17', 'Италия', 'Горные тропы, озера и уютные альпийские города для путешествия с красивыми пешими днями.', 'travel-idea-europe-dolomites.jpg', 'ideas.html', 2],
    ['europe', 'Норвежские фьорды', 'Май', '24', 'Норвегия', 'Дорога вдоль фьордов, обзорные площадки и спокойный ритм северной Европы.', 'travel-idea-europe-norway.jpg', 'ideas.html', 3],
    ['asia', 'Непал: тропа к Аннапурне', 'Октябрь', '05', 'Непал', 'Высокие горы, чайные домики и мягкая акклиматизация для первого гималайского маршрута.', 'travel-idea-asia-nepal.jpg', 'ideas.html', 1],
    ['asia', 'Япония вне сезона', 'Ноябрь', '14', 'Япония', 'Храмы, горные деревни, горячие источники и спокойные города без плотного туристического потока.', 'travel-idea-asia-japan.jpg', 'ideas.html', 2],
    ['asia', 'Бали и вулканы', 'Март', '19', 'Индонезия', 'Ранние подъемы к вулканам, океан, рисовые террасы и несколько дней на восстановление.', 'travel-idea-asia-bali.jpg', 'ideas.html', 3],
    ['antarctica', 'Первый круиз в Антарктиду', 'Декабрь', '01', 'Антарктида', 'Экспедиционный лайнер, высадки на Зодиаке и ледовые пейзажи, которые выглядят как другая планета.', 'travel-idea-antarctica-first.jpg', 'ideas.html', 1],
    ['antarctica', 'Фототур среди айсбергов', 'Январь', '16', 'Антарктида', 'Маршрут для сильных кадров: мягкий полярный свет, колонии пингвинов и огромные ледовые формы.', 'travel-idea-antarctica-photo.jpg', 'ideas.html', 2],
    ['antarctica', 'Южная Георгия', 'Февраль', '08', 'Южная Атлантика', 'Редкий маршрут к королевским пингвинам, китам и суровым берегам Южной Атлантики.', 'travel-idea-antarctica-georgia.jpg', 'ideas.html', 3],
    ['cruises', 'Круиз вдоль Камчатки', 'Август', '15', 'Круизы', 'Морские стоянки, бухты, вулканы на горизонте и выходы к местам, куда сложно добраться по суше.', 'travel-idea-cruise-kamchatka.jpg', 'cruises.html', 1],
    ['cruises', 'Арктический маршрут', 'Июль', '04', 'Круизы', 'Северные острова, ледовая кромка и экспедиционный формат для тех, кто любит редкие направления.', 'travel-idea-cruise-arctic.jpg', 'cruises.html', 2],
    ['cruises', 'Средиземное море без суеты', 'Май', '30', 'Круизы', 'Порты, старые города, мягкий климат и комфортный темп для спокойного путешествия по морю.', 'travel-idea-cruise-mediterranean.jpg', 'cruises.html', 3]
];

const travelIdeaDetails = [
    {
        title: 'Камчатка без спешки',
        slug: 'kamchatka-bez-speshki',
        intro: 'Маршрут для первого знакомства с Камчаткой без гонки за всеми точками сразу: вулканы, горячие источники, океан и дни с запасом на погоду.',
        full_description: 'Эта идея подходит тем, кто хочет почувствовать Камчатку спокойно и глубоко. В программе лучше сочетать один-два вулкана, морскую прогулку, термальные источники и свободный день на случай тумана или ветра. Такой темп оставляет силы на впечатления, а не только на переезды.',
        highlights_json: JSON.stringify(['Вулканические панорамы без перегруза', 'Термальные источники после активных дней', 'Морская прогулка к бухтам и скалам', 'Запасной день на погоду']),
        route_json: JSON.stringify(['Петропавловск-Камчатский', 'Авачинская бухта', 'Вулканический район', 'Термальные источники', 'Тихоокеанское побережье']),
        best_time: 'Июль - сентябрь',
        duration_hint: '7-10 дней',
        budget_hint: 'средний и выше',
        difficulty_hint: 'комфортный активный формат',
        packing_list_json: JSON.stringify(['мембранная куртка', 'треккинговые ботинки', 'купальник для источников', 'гермомешок для техники'])
    },
    {
        title: 'Териберка и северное сияние',
        slug: 'teriberka-severnoe-siyanie',
        intro: 'Короткая арктическая поездка к Баренцеву морю с океаном, скалами, ветром и шансом увидеть северное сияние.',
        full_description: 'Териберка хорошо работает как насыщенный уикенд или часть большого маршрута по Кольскому полуострову. Главное - заложить гибкость: сияние зависит от погоды, а дорога к океану зимой может закрываться. Зато при удачных условиях поездка дает очень сильное ощущение края земли.',
        highlights_json: JSON.stringify(['Баренцево море и каменные пляжи', 'Охота за северным сиянием', 'Арктические пейзажи без сложной логистики', 'Морепродукты и северная кухня']),
        route_json: JSON.stringify(['Мурманск', 'Териберка', 'Побережье Баренцева моря', 'Локации для наблюдения сияния']),
        best_time: 'Ноябрь - март',
        duration_hint: '3-5 дней',
        budget_hint: 'доступный короткий выезд',
        difficulty_hint: 'легкий, но погодозависимый',
        packing_list_json: JSON.stringify(['теплый пуховик', 'термобелье', 'перчатки', 'штатив для фото'])
    },
    {
        title: 'Алтайские озера',
        slug: 'altayskie-ozera',
        intro: 'Горные озера, перевалы и долины Алтая для поездки, где красивые дороги становятся частью маршрута.',
        full_description: 'Алтай лучше раскрывается в формате автомобильного путешествия с короткими пешими выходами. Идея хороша для тех, кто хочет увидеть горы, но не готов к тяжелому автономному походу. Основу маршрута можно собрать вокруг Чуйского тракта, озер, смотровых площадок и спокойных ночевок.',
        highlights_json: JSON.stringify(['Чуйский тракт и горные перевалы', 'Бирюзовые озера и долины', 'Короткие треки без тяжелых рюкзаков', 'Фотогеничные рассветы']),
        route_json: JSON.stringify(['Горно-Алтайск', 'Чуйский тракт', 'Гейзерное озеро', 'Курайская степь', 'Горные долины']),
        best_time: 'Июнь - сентябрь',
        duration_hint: '6-9 дней',
        budget_hint: 'средний',
        difficulty_hint: 'легкий активный',
        packing_list_json: JSON.stringify(['ветровка', 'удобные кроссовки', 'очки от солнца', 'пауэрбанк'])
    },
    {
        title: 'Исландия по кольцу',
        slug: 'islandiya-po-koltsu',
        intro: 'Классический круг по Исландии: водопады, черные пляжи, ледниковые лагуны и лавовые поля в одном маршруте.',
        full_description: 'Кольцевая дорога Исландии дает цельную картинку страны, если не пытаться проехать ее слишком быстро. Лучший сценарий - 9-12 дней с остановками у южных водопадов, ледниковой лагуны, восточных фьордов и северных геотермальных зон.',
        highlights_json: JSON.stringify(['Водопады южного побережья', 'Ледниковая лагуна', 'Черные пляжи', 'Геотермальные зоны']),
        route_json: JSON.stringify(['Рейкьявик', 'Южное побережье', 'Йокульсарлон', 'Восточные фьорды', 'Север Исландии']),
        best_time: 'Июнь - сентябрь',
        duration_hint: '9-12 дней',
        budget_hint: 'выше среднего',
        difficulty_hint: 'комфортный road trip',
        packing_list_json: JSON.stringify(['дождевик', 'слои одежды', 'непромокаемая обувь', 'маска для сна летом'])
    },
    {
        title: 'Доломиты на рассвете',
        slug: 'dolomity-na-rassvete',
        intro: 'Идея для тех, кто любит горные тропы, озера, канатки и рассветы в Альпах.',
        full_description: 'Доломиты можно собрать как мягкий hiking-маршрут: жить в нескольких базовых точках, выходить на тропы утром и возвращаться к комфортной инфраструктуре вечером. Важно бронировать жилье заранее и не перегружать дни переездами.',
        highlights_json: JSON.stringify(['Озера Брайес и Сорапис', 'Рассветные смотровые', 'Канатки и панорамные тропы', 'Альпийские городки']),
        route_json: JSON.stringify(['Больцано', 'Кортина-д’Ампеццо', 'Озеро Брайес', 'Тре Чиме', 'Валь-Гардена']),
        best_time: 'Июнь - октябрь',
        duration_hint: '5-8 дней',
        budget_hint: 'средний и выше',
        difficulty_hint: 'легкий или средний',
        packing_list_json: JSON.stringify(['треккинговые палки', 'флиска', 'солнцезащитный крем', 'маленький рюкзак'])
    },
    {
        title: 'Норвежские фьорды',
        slug: 'norvezhskie-fordy',
        intro: 'Спокойный северный маршрут вдоль фьордов, обзорных площадок и маленьких прибрежных городов.',
        full_description: 'Норвегия хороша для путешествия, где каждый день построен вокруг дороги и вида. Можно сочетать короткие паромы, смотровые, железную дорогу и легкие треки. Это не самый дешевый формат, но он очень предсказуем по качеству впечатлений.',
        highlights_json: JSON.stringify(['Фьорды и паромные переправы', 'Смотровые площадки', 'Северная архитектура', 'Легкие треки']),
        route_json: JSON.stringify(['Берген', 'Флом', 'Гейрангер-фьорд', 'Олесунн', 'Атлантическая дорога']),
        best_time: 'Май - сентябрь',
        duration_hint: '7-10 дней',
        budget_hint: 'выше среднего',
        difficulty_hint: 'комфортный',
        packing_list_json: JSON.stringify(['ветрозащита', 'удобная обувь', 'дождевик', 'термос'])
    },
    {
        title: 'Непал: тропа к Аннапурне',
        slug: 'nepal-annapurna',
        intro: 'Первый гималайский маршрут с чайными домиками, высокими видами и постепенной акклиматизацией.',
        full_description: 'Тропа в районе Аннапурны подходит для первого знакомства с Непалом, если грамотно выбрать высоты и темп. Это не прогулка по парку, но и не экспедиция: ночевки в лоджах, понятная тропа и сильное ощущение гор каждый день.',
        highlights_json: JSON.stringify(['Панорамы Аннапурны', 'Чайные домики на маршруте', 'Гималайские деревни', 'Мягкая акклиматизация']),
        route_json: JSON.stringify(['Катманду', 'Покхара', 'Горные деревни', 'Смотровая на Аннапурну', 'Возврат в Покхару']),
        best_time: 'Март - май, октябрь - ноябрь',
        duration_hint: '10-14 дней',
        budget_hint: 'средний',
        difficulty_hint: 'средний треккинг',
        packing_list_json: JSON.stringify(['спальник', 'треккинговые ботинки', 'пуховка', 'аптечка'])
    },
    {
        title: 'Япония вне сезона',
        slug: 'yaponiya-vne-sezona',
        intro: 'Храмы, горячие источники, горные деревни и спокойные города без максимального туристического потока.',
        full_description: 'Вне пиков сакуры и красных кленов Япония становится мягче по темпу. Можно сочетать Токио или Осаку с маленькими городами, онсэнами, храмами и железнодорожными переездами. Это идея для аккуратного культурного маршрута.',
        highlights_json: JSON.stringify(['Онсэны и рёканы', 'Храмы без толп', 'Железные дороги', 'Горные деревни']),
        route_json: JSON.stringify(['Токио', 'Канадзава', 'Такаяма', 'Киото', 'Осака']),
        best_time: 'Февраль, июнь, ноябрь',
        duration_hint: '8-12 дней',
        budget_hint: 'средний и выше',
        difficulty_hint: 'легкий городской маршрут',
        packing_list_json: JSON.stringify(['удобная обувь', 'адаптер питания', 'наличные йены', 'легкая куртка'])
    },
    {
        title: 'Бали и вулканы',
        slug: 'bali-i-vulkany',
        intro: 'Ранние подъемы к вулканам, рисовые террасы, океан и несколько дней на восстановление.',
        full_description: 'Бали можно сделать не только пляжным направлением. Сильная программа строится вокруг Убуда, вулканов, водопадов и океана. Главное - не ставить активные подъемы каждый день подряд и оставить время на отдых.',
        highlights_json: JSON.stringify(['Вулканические рассветы', 'Рисовые террасы', 'Водопады', 'Океан после активных дней']),
        route_json: JSON.stringify(['Денпасар', 'Убуд', 'Вулкан Батур', 'Северные водопады', 'Побережье']),
        best_time: 'Апрель - октябрь',
        duration_hint: '8-11 дней',
        budget_hint: 'гибкий',
        difficulty_hint: 'легкий активный',
        packing_list_json: JSON.stringify(['легкая треккинговая обувь', 'дождевик', 'солнцезащита', 'купальник'])
    },
    {
        title: 'Первый круиз в Антарктиду',
        slug: 'pervy-kruiz-v-antarktidu',
        intro: 'Экспедиционный лайнер, высадки на лодках и ледовые пейзажи для первого полярного путешествия.',
        full_description: 'Антарктида требует бюджета и подготовки, но формат экспедиционного круиза делает маршрут понятным. Дни зависят от погоды и льда: команда выбирает места высадок, а путешественники получают максимум из доступных окон.',
        highlights_json: JSON.stringify(['Пролив Дрейка', 'Высадки на Зодиаке', 'Айсберги и ледники', 'Лекции экспедиционной команды']),
        route_json: JSON.stringify(['Ушуайя', 'Пролив Дрейка', 'Антарктический полуостров', 'Экспедиционные высадки', 'Возврат в Ушуайю']),
        best_time: 'Ноябрь - март',
        duration_hint: '10-13 дней',
        budget_hint: 'премиальный',
        difficulty_hint: 'комфортный, но погодный',
        packing_list_json: JSON.stringify(['теплая парка', 'непромокаемые брюки', 'морская аптечка', 'бинокль'])
    },
    {
        title: 'Фототур среди айсбергов',
        slug: 'fototur-sredi-aysbergov',
        intro: 'Полярный свет, ледовые формы и маршрут, где день строится вокруг сильных кадров.',
        full_description: 'Фототур в полярных широтах требует терпения: свет, ветер и лед постоянно меняют планы. Зато именно здесь можно получить кадры, которые невозможно повторить в стандартном маршруте. Лучше выбирать небольшой экспедиционный формат.',
        highlights_json: JSON.stringify(['Мягкий полярный свет', 'Айсберги крупным планом', 'Фото с лодок', 'Гибкий график под погоду']),
        route_json: JSON.stringify(['Экспедиционное судно', 'Ледовые поля', 'Фотолокации у айсбергов', 'Наблюдение за животными']),
        best_time: 'Декабрь - февраль',
        duration_hint: '9-12 дней',
        budget_hint: 'премиальный',
        difficulty_hint: 'для увлеченных фотографией',
        packing_list_json: JSON.stringify(['защита камеры от влаги', 'запасные батареи', 'телевик', 'теплые перчатки'])
    },
    {
        title: 'Южная Георгия',
        slug: 'yuzhnaya-georgiya',
        intro: 'Редкое направление Южной Атлантики с огромными колониями птиц, суровыми берегами и экспедиционным духом.',
        full_description: 'Южная Георгия часто становится главным открытием для тех, кто уже видел классическую Антарктиду. Здесь меньше привычной инфраструктуры, зато больше ощущения настоящей экспедиции и невероятных природных сцен.',
        highlights_json: JSON.stringify(['Колонии королевских пингвинов', 'История полярных экспедиций', 'Суровые берега', 'Редкий маршрут']),
        route_json: JSON.stringify(['Ушуайя', 'Фолклендские острова', 'Южная Георгия', 'Южная Атлантика']),
        best_time: 'Октябрь - март',
        duration_hint: '15-20 дней',
        budget_hint: 'премиальный',
        difficulty_hint: 'длинная экспедиция',
        packing_list_json: JSON.stringify(['морская аптечка', 'теплые слои', 'бинокль', 'непромокаемый рюкзак'])
    },
    {
        title: 'Круиз вдоль Камчатки',
        slug: 'kruiz-vdol-kamchatki',
        intro: 'Морской маршрут к бухтам, вулканам и диким стоянкам, куда сложно добраться по суше.',
        full_description: 'Камчатка с воды выглядит иначе: береговые линии, бухты, птичьи базары и вулканы на горизонте. Такой формат хорош для тех, кто хочет больше природы и меньше дорожной логистики.',
        highlights_json: JSON.stringify(['Бухты и дикие стоянки', 'Вулканы с моря', 'Морская рыбалка', 'Наблюдение за птицами']),
        route_json: JSON.stringify(['Петропавловск-Камчатский', 'Авачинская бухта', 'Дикие бухты', 'Побережье Камчатки']),
        best_time: 'Июль - сентябрь',
        duration_hint: '5-8 дней',
        budget_hint: 'средний и выше',
        difficulty_hint: 'морской комфортный',
        packing_list_json: JSON.stringify(['ветровка', 'таблетки от укачивания', 'гермомешок', 'теплая шапка'])
    },
    {
        title: 'Арктический маршрут',
        slug: 'arkticheskiy-marshrut',
        intro: 'Северные острова, ледовая кромка и экспедиционный формат для тех, кто любит редкие направления.',
        full_description: 'Арктический маршрут строится вокруг погоды, льда и возможностей судна. Здесь ценят не расписание по минутам, а шанс оказаться в местах, куда попадает очень мало людей.',
        highlights_json: JSON.stringify(['Ледовая кромка', 'Северные острова', 'Экспедиционные лекции', 'Редкие высадки']),
        route_json: JSON.stringify(['Арктический порт', 'Северные острова', 'Ледовая зона', 'Экспедиционные стоянки']),
        best_time: 'Июнь - август',
        duration_hint: '8-14 дней',
        budget_hint: 'высокий',
        difficulty_hint: 'экспедиционный комфорт',
        packing_list_json: JSON.stringify(['термобелье', 'непромокаемые перчатки', 'бинокль', 'теплая обувь'])
    },
    {
        title: 'Средиземное море без суеты',
        slug: 'sredizemnoe-more-bez-suety',
        intro: 'Порты, старые города, мягкий климат и спокойный темп морского путешествия.',
        full_description: 'Средиземноморский маршрут хорош, когда хочется красивых городов без постоянной смены отелей. Днем можно гулять по старым кварталам, вечером возвращаться на борт, а программу легко сделать комфортной даже для первого круиза.',
        highlights_json: JSON.stringify(['Старые портовые города', 'Мягкий климат', 'Комфорт без частых переездов', 'Кухня разных побережий']),
        route_json: JSON.stringify(['Барселона', 'Лазурный берег', 'Италия', 'Греческие острова']),
        best_time: 'Май - июнь, сентябрь - октябрь',
        duration_hint: '6-9 дней',
        budget_hint: 'гибкий',
        difficulty_hint: 'легкий комфортный',
        packing_list_json: JSON.stringify(['легкая одежда', 'удобная обувь', 'солнцезащита', 'вечерний комплект'])
    }
];

async function ensureUserProfileColumns() {
    const columns = await dbAll('PRAGMA table_info(users)');
    const existingColumns = new Set(columns.map(column => column.name));
    const requiredColumns = [
        ['phone', 'VARCHAR(50)'],
        ['birth_date', 'DATE'],
        ['city', 'VARCHAR(100)'],
        ['avatar_url', 'VARCHAR(500)'],
        ['registration_date', 'DATETIME'],
        ['last_login', 'DATETIME'],
        ['is_active', 'BOOLEAN DEFAULT 1'],
        ['is_admin', 'BOOLEAN DEFAULT 0'],
        ['email_notifications', 'BOOLEAN DEFAULT 1'],
        ['sms_notifications', 'BOOLEAN DEFAULT 0'],
        ['promo_notifications', 'BOOLEAN DEFAULT 1'],
        ['created_at', 'DATETIME'],
        ['updated_at', 'DATETIME']
    ];

    for (const [columnName, columnType] of requiredColumns) {
        if (!existingColumns.has(columnName)) {
            await dbRun(`ALTER TABLE users ADD COLUMN ${columnName} ${columnType}`);
        }
    }

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(lower(trim(email)))');
    await dbRun('DROP TRIGGER IF EXISTS users_phone_unique_insert');
    await dbRun('DROP TRIGGER IF EXISTS users_phone_unique_update');
    await dbRun(`
        CREATE TRIGGER users_phone_unique_insert
        BEFORE INSERT ON users
        WHEN trim(coalesce(NEW.phone, '')) <> ''
        BEGIN
            SELECT RAISE(ABORT, 'PHONE_ALREADY_EXISTS')
            WHERE EXISTS (
                SELECT 1
                FROM users
                WHERE replace(replace(replace(replace(replace(coalesce(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                      replace(replace(replace(replace(replace(coalesce(NEW.phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            );
        END
    `);
    await dbRun(`
        CREATE TRIGGER users_phone_unique_update
        BEFORE UPDATE OF phone ON users
        WHEN trim(coalesce(NEW.phone, '')) <> ''
        BEGIN
            SELECT RAISE(ABORT, 'PHONE_ALREADY_EXISTS')
            WHERE EXISTS (
                SELECT 1
                FROM users
                WHERE id <> NEW.id
                  AND replace(replace(replace(replace(replace(coalesce(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                      replace(replace(replace(replace(replace(coalesce(NEW.phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            );
        END
    `);
}

async function ensureTravelIdeas() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS travel_idea_categories (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            order_index INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS travel_ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_slug TEXT NOT NULL,
            title TEXT NOT NULL,
            month_label TEXT NOT NULL,
            day_label TEXT NOT NULL,
            tag TEXT,
            description TEXT NOT NULL,
            image_url TEXT NOT NULL,
            slug TEXT,
            intro TEXT,
            full_description TEXT,
            highlights_json TEXT,
            route_json TEXT,
            best_time TEXT,
            duration_hint TEXT,
            budget_hint TEXT,
            difficulty_hint TEXT,
            packing_list_json TEXT,
            link_url TEXT DEFAULT 'ideas.html',
            order_index INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_slug) REFERENCES travel_idea_categories(slug)
        )
    `);

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_ideas_category_title ON travel_ideas(category_slug, title)');
    const ideaColumns = await dbAll('PRAGMA table_info(travel_ideas)');
    const existingIdeaColumns = new Set(ideaColumns.map(column => column.name));
    const requiredIdeaColumns = [
        ['slug', 'TEXT'],
        ['intro', 'TEXT'],
        ['full_description', 'TEXT'],
        ['highlights_json', 'TEXT'],
        ['route_json', 'TEXT'],
        ['best_time', 'TEXT'],
        ['duration_hint', 'TEXT'],
        ['budget_hint', 'TEXT'],
        ['difficulty_hint', 'TEXT'],
        ['packing_list_json', 'TEXT']
    ];

    for (const [columnName, columnType] of requiredIdeaColumns) {
        if (!existingIdeaColumns.has(columnName)) {
            await dbRun(`ALTER TABLE travel_ideas ADD COLUMN ${columnName} ${columnType}`);
        }
    }

    for (const category of travelIdeaCategories) {
        await dbRun(
            `INSERT OR IGNORE INTO travel_idea_categories (slug, name, order_index, is_active)
             VALUES (?, ?, ?, 1)`,
            [category.slug, category.name, category.order_index]
        );
    }

    for (const idea of travelIdeasSeed) {
        await dbRun(
            `INSERT OR IGNORE INTO travel_ideas
             (category_slug, title, month_label, day_label, tag, description, image_url, link_url, order_index, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            idea
        );
    }

    for (const detail of travelIdeaDetails) {
        await dbRun(
            `UPDATE travel_ideas
             SET slug = ?,
                 intro = ?,
                 full_description = ?,
                 highlights_json = ?,
                 route_json = ?,
                 best_time = ?,
                 duration_hint = ?,
                 budget_hint = ?,
                 difficulty_hint = ?,
                 packing_list_json = ?,
                 link_url = ?
             WHERE title = ?`,
            [
                detail.slug,
                detail.intro,
                detail.full_description,
                detail.highlights_json,
                detail.route_json,
                detail.best_time,
                detail.duration_hint,
                detail.budget_hint,
                detail.difficulty_hint,
                detail.packing_list_json,
                `idea.html?slug=${detail.slug}`,
                detail.title
            ]
        );
    }

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_ideas_slug ON travel_ideas(slug)');
}

async function ensureDreamRequests() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS dream_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            email VARCHAR(255),
            destination VARCHAR(255),
            budget VARCHAR(100),
            date_from DATE,
            date_to DATE,
            people INTEGER,
            message TEXT,
            status VARCHAR(50) DEFAULT 'new',
            admin_comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
}

// Middleware для проверки JWT токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
}

// Middleware для проверки прав администратора
function authenticateAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
}

// =====================================================
// GIGACHAT AI АССИСТЕНТ ДЛЯ TRAVEL-САЙТА
// =====================================================

const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const GIGACHAT_AUTHORIZATION_KEY = "MDE5ZDVlYTktMjRmNy03NDZlLWEzMjktZWI4ODg0ZWQwNGFiOmUyMTM4YWMzLTRkYzItNDEwYy1hOTAyLTk0MTI0NTBhZWY0Yg==";

let gigachatTokenCache = { token: null, expiresAt: 0 };

// Функция для HTTPS запросов
function httpsRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

async function getGigaChatToken() {
    if (gigachatTokenCache.token && gigachatTokenCache.expiresAt > Date.now() / 1000) {
        return gigachatTokenCache.token;
    }

    try {
        const rquid = crypto.randomUUID();
        console.log('🔄 Получение токена GigaChat для Travel-сайта...');

        const options = {
            hostname: 'ngw.devices.sberbank.ru',
            port: 9443,
            path: '/api/v2/oauth',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': rquid,
                'Authorization': `Basic ${GIGACHAT_AUTHORIZATION_KEY}`
            },
            rejectUnauthorized: false
        };

        const response = await httpsRequest(options, 'scope=GIGACHAT_API_PERS');

        if (response.status === 200 && response.data.access_token) {
            gigachatTokenCache.token = response.data.access_token;
            gigachatTokenCache.expiresAt = (Date.now() / 1000) + (response.data.expires_in || 1800) - 60;
            console.log('✅ Токен GigaChat получен для Travel-сайта');
            return response.data.access_token;
        }

        console.error('❌ Ошибка получения токена:', response.data);
        return null;
    } catch (error) {
        console.error('❌ Ошибка получения токена:', error.message);
        return null;
    }
}

// Функция получения данных из БД для контекста
async function getTravelContextData(userId = null) {
    const context = {
        popularTours: [],
        upcomingTours: [],
        guides: [],
        stats: null
    };

    // Популярные туры
    try {
        context.popularTours = await new Promise((resolve) => {
            db.all(`
                SELECT id, title, destination, price_usd, duration_days, slug
                FROM tours 
                WHERE status IN ('active', 'upcoming')
                ORDER BY booking_count DESC, views_count DESC
                LIMIT 5
            `, (err, rows) => {
                resolve(rows || []);
            });
        });
    } catch(e) { console.error(e); }

    // Предстоящие туры
    try {
        context.upcomingTours = await new Promise((resolve) => {
            db.all(`
                SELECT id, title, destination, start_date, price_usd, duration_days, slug
                FROM tours 
                WHERE status IN ('active', 'upcoming') AND start_date >= date('now')
                ORDER BY start_date ASC
                LIMIT 5
            `, (err, rows) => {
                resolve(rows || []);
            });
        });
    } catch(e) { console.error(e); }

    // Гиды
    try {
        context.guides = await new Promise((resolve) => {
            db.all(`
                SELECT name, specialization, rating, experience_years, slug
                FROM guides 
                WHERE is_active = 1
                ORDER BY rating DESC
                LIMIT 4
            `, (err, rows) => {
                resolve(rows || []);
            });
        });
    } catch(e) { console.error(e); }

    return context;
}

async function askTravelAssistant(userMessage, userId = null) {
    const token = await getGigaChatToken();
    if (!token) return null;

    const context = await getTravelContextData(userId);

    const systemPrompt = `Ты дружелюбный ИИ-ассистент туристического агентства "Travel & Discover".

КОМАНДЫ:
🔹 /tours — популярные туры
🔹 /upcoming — ближайшие туры
🔹 /guides — наши гиды
🔹 /cruises — круизы
🔹 /contacts — контакты
🔹 /help — помощь

ИНФОРМАЦИЯ:
Популярные туры: ${context.popularTours.map(t => t.title).join(', ') || 'Мальдивы, Турция, Египет, Таиланд, Италия'}
Наши гиды: ${context.guides.map(g => g.name).join(', ') || 'опытные гиды'}

ЦЕНЫ:
- Мальдивы: от 1500$ (7 дней)
- Турция: от 800$ (7 дней)
- Египет: от 600$ (7 дней)
- Таиланд: от 1200$ (10 дней)
- Италия: от 1000$ (7 дней)
- Круиз SH Vega: от 2500$ (10 дней)

КОНТАКТЫ:
Телефон: +7 (3532) 78-88-88
Email: travel@discover.ru
Адрес: г. Оренбург, ул. Сергея Лазо, 14

ПРАВИЛА:
1. Отвечай коротко (2-4 предложения)
2. Используй эмодзи ✈️🌴🏖️🚢⭐
3. Всегда предлагай помощь`;

    try {
        const requestId = crypto.randomUUID();

        let userMessageProcessed = userMessage;
        const lowerMessage = userMessage.toLowerCase().trim();

        if (lowerMessage === '/tours') {
            userMessageProcessed = 'Покажи популярные туры';
        } else if (lowerMessage === '/upcoming') {
            userMessageProcessed = 'Какие ближайшие туры?';
        } else if (lowerMessage === '/guides') {
            userMessageProcessed = 'Расскажи о гидах';
        } else if (lowerMessage === '/cruises') {
            userMessageProcessed = 'Расскажи о круизах';
        } else if (lowerMessage === '/contacts') {
            userMessageProcessed = 'Контактная информация';
        } else if (lowerMessage === '/help') {
            userMessageProcessed = 'Что ты умеешь?';
        }

        const requestBody = JSON.stringify({
            model: 'GigaChat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessageProcessed }
            ],
            temperature: 0.7,
            max_tokens: 600
        });

        const options = {
            hostname: 'gigachat.devices.sberbank.ru',
            port: 443,
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-Id': requestId,
                'Content-Length': Buffer.byteLength(requestBody)
            },
            rejectUnauthorized: false
        };

        console.log('📤 Отправка запроса к GigaChat...');
        const response = await httpsRequest(options, requestBody);

        if (response.status === 200 && response.data.choices && response.data.choices[0]) {
            let reply = response.data.choices[0].message.content;
            console.log('✅ Ответ от GigaChat получен');

            if (lowerMessage === '/help') {
                reply += '\n\n💡 **Команды:** /tours, /upcoming, /guides, /cruises, /contacts';
            }

            return reply;
        }

        console.error('❌ Ошибка GigaChat API:', response.status);
        return null;
    } catch (error) {
        console.error('❌ Ошибка GigaChat:', error.message);
        return null;
    }
}

// Эндпоинт для чата
app.post('/api/chat', async (req, res) => {
    console.log('🤖 Запрос к ИИ-ассистенту:', req.body?.message);

    const { message } = req.body;

    if (!message) {
        return res.json({ reply: '👋 Напишите, чем я могу помочь в выборе путешествия!' });
    }

    try {
        const aiReply = await askTravelAssistant(message);

        if (aiReply) {
            return res.json({ reply: aiReply });
        }

        // Fallback ответы
        const lower = message.toLowerCase().trim();

        if (lower === '/tours') {
            const tours = await new Promise((resolve) => {
                db.all(`
                    SELECT title, destination, price_usd, duration_days
                    FROM tours 
                    WHERE status IN ('active', 'upcoming')
                    ORDER BY booking_count DESC
                    LIMIT 5
                `, (err, rows) => resolve(rows || []));
            });

            if (tours.length > 0) {
                let reply = '✈️ **Популярные туры:**\n\n';
                tours.forEach((tour, i) => {
                    reply += `${i+1}. **${tour.title}** — ${tour.destination}\n`;
                    reply += `   💰 от ${tour.price_usd}$ | 📅 ${tour.duration_days} дней\n\n`;
                });
                return res.json({ reply });
            }
            return res.json({ reply: '✈️ Популярные направления: Мальдивы, Турция, Египет, Таиланд, Италия' });
        }

        if (lower === '/guides') {
            return res.json({ reply: '👨‍🏫 **Наши гиды** — профессионалы с опытом работы более 5 лет, знающие лучшие места и говорящие на русском языке!' });
        }

        if (lower === '/cruises') {
            return res.json({ reply: '🚢 **Круизы SH Vega:** от 2500$, 10-14 дней, всё включено. Маршруты: Средиземноморье, Северная Европа' });
        }

        if (lower === '/contacts') {
            return res.json({ reply: '📞 **Контакты:** +7 (3532) 78-88-88, travel@discover.ru, г. Оренбург, ул. Сергея Лазо, 14' });
        }

        if (lower === '/help') {
            return res.json({ reply: '💡 **Команды:**\n/tours — туры\n/upcoming — ближайшие\n/guides — гиды\n/cruises — круизы\n/contacts — контакты' });
        }

        if (lower.includes('привет')) {
            return res.json({ reply: '🌍 Здравствуйте! Я помогу подобрать идеальный тур. Введите /help для списка команд. Куда мечтаете поехать?' });
        }

        return res.json({ reply: '🌴 Я помогу найти идеальное путешествие! Спросите о турах, ценах или направлениях. Или введите /help для команд.' });

    } catch (error) {
        console.error('Ошибка:', error);
        res.json({ reply: '😔 Ошибка. Позвоните нам: +7 (3532) 78-88-88' });
    }
});
// =====================================================
// АУТЕНТИФИКАЦИЯ И ПОЛЬЗОВАТЕЛИ
// =====================================================

// Регистрация пользователя
app.post('/api/auth/register', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');
        const full_name = cleanOptionalText(req.body.full_name);
        const phone = cleanOptionalText(req.body.phone);
        const birth_date = cleanOptionalText(req.body.birth_date);
        const city = cleanOptionalText(req.body.city);
        const normalizedPhone = normalizePhone(phone);

        if (!email || !password || !full_name) {
            return res.status(400).json({ error: 'Укажите имя, email и пароль' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Укажите корректный email' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
        }

        if (phone && normalizedPhone.length < 10) {
            return res.status(400).json({ error: 'Укажите корректный телефон' });
        }

        // Проверяем, существует ли пользователь
        const existingUser = await dbGet('SELECT id FROM users WHERE lower(trim(email)) = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        if (normalizedPhone) {
            const existingPhone = await dbGet(
                `SELECT id FROM users
                 WHERE replace(replace(replace(replace(replace(coalesce(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?`,
                [normalizedPhone]
            );
            if (existingPhone) {
                return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
            }
        }

        // Хешируем пароль
        const password_hash = await bcrypt.hash(password, 10);

        // Создаем пользователя
        const result = await dbRun(
            `INSERT INTO users (email, password_hash, full_name, phone, birth_date, city, registration_date, email_notifications, sms_notifications, promo_notifications)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1, 0, 1)`,
            [email, password_hash, full_name, phone, birth_date, city]
        );

        // Создаем токен
        const token = jwt.sign(
            { id: result.lastID, email, full_name, is_admin: 0 },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: result.lastID,
                email,
                full_name,
                phone,
                birth_date,
                city
            }
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
            const message = error.message.includes('PHONE_ALREADY_EXISTS')
                ? 'Пользователь с таким телефоном уже существует'
                : 'Пользователь с таким email уже существует';
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Вход пользователя
app.post('/api/auth/login', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        const user = await dbGet(
            `SELECT id, email, password_hash, full_name, phone, birth_date, city, avatar_url, is_admin, 
                    email_notifications, sms_notifications, promo_notifications
             FROM users WHERE lower(trim(email)) = ? AND is_active = 1`,
            [email]
        );

        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Обновляем время последнего входа
        await dbRun('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, full_name: user.full_name, is_admin: user.is_admin },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone,
                birth_date: user.birth_date,
                city: user.city,
                avatar_url: user.avatar_url,
                is_admin: user.is_admin,
                email_notifications: user.email_notifications,
                sms_notifications: user.sms_notifications,
                promo_notifications: user.promo_notifications
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение профиля пользователя
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await dbGet(
            `SELECT id, email, full_name, phone, birth_date, city, avatar_url, registration_date, last_login,
                    email_notifications, sms_notifications, promo_notifications, is_admin
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Получаем статистику поездок пользователя
        const stats = await dbGet(
            `SELECT 
                COUNT(DISTINCT b.id) as total_trips,
                COUNT(DISTINCT t.country) as total_countries,
                SUM(t.duration_days) as total_days
             FROM bookings b
             JOIN tours t ON b.tour_id = t.id
             WHERE b.user_id = ? AND b.status IN ('confirmed', 'paid', 'completed')`,
            [req.user.id]
        );

        // Получаем последние бронирования
        const recentBookings = await dbAll(
            `SELECT b.*, t.title as tour_title, t.destination, t.main_image_url,
                    t.start_date as tour_start_date, t.end_date as tour_end_date
             FROM bookings b
             JOIN tours t ON b.tour_id = t.id
             WHERE b.user_id = ?
             ORDER BY b.booking_date DESC
             LIMIT 5`,
            [req.user.id]
        );

        res.json({
            user,
            stats: {
                total_trips: stats.total_trips || 0,
                total_countries: stats.total_countries || 0,
                total_days: stats.total_days || 0
            },
            recentBookings
        });
    } catch (error) {
        console.error('Ошибка получения профиля:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Обновление профиля пользователя
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const full_name = cleanOptionalText(req.body.full_name);
        const phone = cleanOptionalText(req.body.phone);
        const birth_date = cleanOptionalText(req.body.birth_date);
        const city = cleanOptionalText(req.body.city);
        const normalizedPhone = normalizePhone(phone);
        const email_notifications = req.body.email_notifications ? 1 : 0;
        const sms_notifications = req.body.sms_notifications ? 1 : 0;
        const promo_notifications = req.body.promo_notifications ? 1 : 0;

        if (!email || !full_name) {
            return res.status(400).json({ error: 'Укажите имя и email' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Укажите корректный email' });
        }

        if (phone && normalizedPhone.length < 10) {
            return res.status(400).json({ error: 'Укажите корректный телефон' });
        }

        const existingEmail = await dbGet(
            'SELECT id FROM users WHERE lower(trim(email)) = ? AND id <> ?',
            [email, req.user.id]
        );
        if (existingEmail) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        if (normalizedPhone) {
            const existingPhone = await dbGet(
                `SELECT id FROM users
                 WHERE id <> ?
                   AND replace(replace(replace(replace(replace(coalesce(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?`,
                [req.user.id, normalizedPhone]
            );
            if (existingPhone) {
                return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
            }
        }

        await dbRun(
            `UPDATE users 
             SET email = ?, full_name = ?, phone = ?, birth_date = ?, city = ?,
                 email_notifications = ?, sms_notifications = ?, promo_notifications = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [email, full_name, phone, birth_date, city, email_notifications, sms_notifications, promo_notifications, req.user.id]
        );

        res.json({ success: true, message: 'Профиль успешно обновлен' });
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
            const message = error.message.includes('PHONE_ALREADY_EXISTS')
                ? 'Пользователь с таким телефоном уже существует'
                : 'Пользователь с таким email уже существует';
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Загрузка аватара пользователя
app.post('/api/users/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const avatarUrl = `/uploads/${req.file.filename}`;
        await dbRun('UPDATE users SET avatar_url = ?, updated_at = datetime("now") WHERE id = ?', [avatarUrl, req.user.id]);

        res.json({ success: true, avatar_url: avatarUrl });
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ТУРЫ
// =====================================================

// Получение всех туров с фильтрацией
app.get('/api/tours', async (req, res) => {
    try {
        const { destination, country, difficulty, min_price, max_price, start_date, status, limit, offset, is_cruise } = req.query;

        let sql = `
            SELECT t.*, 
                   COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.tour_id = t.id AND b.status IN ('confirmed', 'paid')), 0) as booked_count,
                   COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.tour_id = t.id AND r.is_published = 1), 0) as avg_rating,
                   COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.tour_id = t.id AND r.is_published = 1), 0) as total_reviews
            FROM tours t
            WHERE 1=1
        `;
        const params = [];

        if (destination) {
            sql += ' AND t.destination LIKE ?';
            params.push(`%${destination}%`);
        }
        if (country) {
            sql += ' AND t.country = ?';
            params.push(country);
        }
        if (difficulty) {
            sql += ' AND t.difficulty_level = ?';
            params.push(difficulty);
        }
        if (min_price) {
            sql += ' AND t.price_usd >= ?';
            params.push(parseFloat(min_price));
        }
        if (max_price) {
            sql += ' AND t.price_usd <= ?';
            params.push(parseFloat(max_price));
        }
        if (status) {
            sql += ' AND t.status IN (?, ?, ?)';
            params.push(status, 'active', 'upcoming');
        } else {
            sql += " AND t.status IN ('active', 'upcoming')";
        }
        if (start_date) {
            sql += ' AND t.start_date >= ?';
            params.push(start_date);
        }
        if (is_cruise === '1' || is_cruise === 'true') {
            sql += ' AND t.is_cruise = 1';
        } else if (is_cruise === '0' || is_cruise === 'false') {
            sql += ' AND COALESCE(t.is_cruise, 0) = 0';
        }

        sql += ' ORDER BY t.start_date ASC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(limit));
        }
        if (offset) {
            sql += ' OFFSET ?';
            params.push(parseInt(offset));
        }

        const tours = await dbAll(sql, params);
        res.json({ tours, total: tours.length });
    } catch (error) {
        console.error('Ошибка получения туров:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение популярных туров
app.get('/api/tours/popular', async (req, res) => {
    try {
        const tours = await dbAll(`
            SELECT t.*, COUNT(b.id) as booking_count
            FROM tours t
            LEFT JOIN bookings b ON t.id = b.tour_id AND b.status IN ('confirmed', 'paid')
            WHERE t.status IN ('active', 'upcoming')
            GROUP BY t.id
            ORDER BY booking_count DESC, t.views_count DESC
            LIMIT 6
        `);
        res.json({ tours });
    } catch (error) {
        console.error('Ошибка получения популярных туров:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение тура по slug
app.get('/api/tours/:slug', async (req, res) => {
    try {
        const tour = await dbGet(`
            SELECT t.*, 
                   COALESCE(AVG(r.rating), 0) as avg_rating,
                   COUNT(DISTINCT r.id) as total_reviews
            FROM tours t
            LEFT JOIN reviews r ON t.id = r.tour_id AND r.is_published = 1
            WHERE t.slug = ?
            GROUP BY t.id
        `, [req.params.slug]);

        if (!tour) {
            return res.status(404).json({ error: 'Тур не найден' });
        }

        // Увеличиваем счетчик просмотров
        await dbRun('UPDATE tours SET views_count = views_count + 1 WHERE id = ?', [tour.id]);

        // Получаем гидов для тура
        const guides = await dbAll(`
            SELECT g.*, tg.is_main_guide
            FROM guides g
            JOIN tour_guides tg ON g.id = tg.guide_id
            WHERE tg.tour_id = ?
        `, [tour.id]);

        // Получаем отзывы для тура
        const reviews = await dbAll(`
            SELECT r.*, u.full_name, u.avatar_url
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.tour_id = ? AND r.is_published = 1
            ORDER BY r.created_at DESC
            LIMIT 10
        `, [tour.id]);

        // Получаем похожие туры
        const similarTours = await dbAll(`
            SELECT id, title, slug, destination, price_usd, price_rub, duration_days, main_image_url
            FROM tours
            WHERE country = ? AND id != ? AND status IN ('active', 'upcoming')
            LIMIT 4
        `, [tour.country, tour.id]);

        res.json({ tour, guides, reviews, similarTours });
    } catch (error) {
        console.error('Ошибка получения тура:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// БРОНИРОВАНИЯ
// =====================================================

// Создание бронирования
app.post('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const { tour_id, number_of_people, special_requests, start_date, end_date } = req.body;

        // Получаем информацию о туре
        const tour = await dbGet('SELECT price_usd, price_rub, available_spots FROM tours WHERE id = ?', [tour_id]);

        if (!tour) {
            return res.status(404).json({ error: 'Тур не найден' });
        }

        if (tour.available_spots < number_of_people) {
            return res.status(400).json({ error: 'Недостаточно свободных мест' });
        }

        const total_price_usd = tour.price_usd * number_of_people;
        const total_price_rub = tour.price_rub * number_of_people;
        const booking_number = 'BK-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        const result = await dbRun(
            `INSERT INTO bookings (booking_number, user_id, tour_id, number_of_people, total_price_usd, total_price_rub, 
                                   special_requests, start_date, end_date, status, payment_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid')`,
            [booking_number, req.user.id, tour_id, number_of_people, total_price_usd, total_price_rub, special_requests, start_date, end_date]
        );

        // Обновляем количество доступных мест
        await dbRun('UPDATE tours SET available_spots = available_spots - ?, booking_count = booking_count + 1 WHERE id = ?',
                    [number_of_people, tour_id]);

        res.json({
            success: true,
            booking: {
                id: result.lastID,
                booking_number,
                total_price_usd,
                total_price_rub,
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('Ошибка создания бронирования:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение бронирований пользователя
app.get('/api/bookings/my', authenticateToken, async (req, res) => {
    try {
        const bookings = await dbAll(`
            SELECT b.*, t.title, t.destination, t.main_image_url, t.start_date as tour_start_date, t.end_date as tour_end_date
            FROM bookings b
            JOIN tours t ON b.tour_id = t.id
            WHERE b.user_id = ?
            ORDER BY b.booking_date DESC
        `, [req.user.id]);

        res.json({ bookings });
    } catch (error) {
        console.error('Ошибка получения бронирований:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Отмена бронирования
app.put('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { cancel_reason } = req.body;
        const bookingId = req.params.id;

        const booking = await dbGet(
            'SELECT tour_id, number_of_people, status FROM bookings WHERE id = ? AND user_id = ?',
            [bookingId, req.user.id]
        );

        if (!booking) {
            return res.status(404).json({ error: 'Бронирование не найдено' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ error: 'Бронирование уже отменено' });
        }

        await dbRun(
            `UPDATE bookings 
             SET status = 'cancelled', cancel_date = datetime('now'), cancel_reason = ?
             WHERE id = ?`,
            [cancel_reason, bookingId]
        );

        // Возвращаем места обратно
        await dbRun('UPDATE tours SET available_spots = available_spots + ? WHERE id = ?',
                    [booking.number_of_people, booking.tour_id]);

        res.json({ success: true, message: 'Бронирование отменено' });
    } catch (error) {
        console.error('Ошибка отмены бронирования:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ОТЗЫВЫ
// =====================================================

// Добавление отзыва
app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { tour_id, booking_id, rating, title, comment, pros, cons } = req.body;

        // Проверяем, что пользователь действительно был на туре
        const booking = await dbGet(
            `SELECT id FROM bookings 
             WHERE user_id = ? AND tour_id = ? AND status IN ('confirmed', 'paid', 'completed')`,
            [req.user.id, tour_id]
        );

        if (!booking) {
            return res.status(403).json({ error: 'Вы можете оставить отзыв только после посещения тура' });
        }

        const result = await dbRun(
            `INSERT INTO reviews (user_id, tour_id, booking_id, rating, title, comment, pros, cons, is_verified, is_published)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [req.user.id, tour_id, booking_id, rating, title, comment, pros, cons]
        );

        // Обновляем рейтинг тура
        await dbRun(`
            UPDATE tours 
            SET rating = (SELECT AVG(rating) FROM reviews WHERE tour_id = ? AND is_published = 1),
                reviews_count = (SELECT COUNT(*) FROM reviews WHERE tour_id = ? AND is_published = 1)
            WHERE id = ?
        `, [tour_id, tour_id, tour_id]);

        res.json({ success: true, review_id: result.lastID });
    } catch (error) {
        console.error('Ошибка добавления отзыва:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ИЗБРАННОЕ
// =====================================================

// Добавление тура в избранное
app.post('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const { tour_id } = req.body;

        await dbRun(
            'INSERT OR IGNORE INTO favorites (user_id, tour_id) VALUES (?, ?)',
            [req.user.id, tour_id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка добавления в избранное:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Удаление тура из избранного
app.delete('/api/favorites/:tour_id', authenticateToken, async (req, res) => {
    try {
        await dbRun(
            'DELETE FROM favorites WHERE user_id = ? AND tour_id = ?',
            [req.user.id, req.params.tour_id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления из избранного:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение избранных туров
app.get('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const favorites = await dbAll(`
            SELECT t.*
            FROM tours t
            JOIN favorites f ON t.id = f.tour_id
            WHERE f.user_id = ?
        `, [req.user.id]);

        res.json({ favorites });
    } catch (error) {
        console.error('Ошибка получения избранного:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ГИДЫ
// =====================================================

// Получение всех гидов
app.get('/api/guides', async (req, res) => {
    try {
        const guides = await dbAll(`
            SELECT * FROM guides WHERE is_active = 1 ORDER BY rating DESC
        `);
        res.json({ guides });
    } catch (error) {
        console.error('Ошибка получения гидов:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение гида по slug
app.get('/api/guides/:slug', async (req, res) => {
    try {
        const guide = await dbGet('SELECT * FROM guides WHERE slug = ? AND is_active = 1', [req.params.slug]);

        if (!guide) {
            return res.status(404).json({ error: 'Гид не найден' });
        }

        // Получаем туры, которые ведет гид
        const tours = await dbAll(`
            SELECT t.*
            FROM tours t
            JOIN tour_guides tg ON t.id = tg.tour_id
            WHERE tg.guide_id = ? AND t.status IN ('active', 'upcoming')
        `, [guide.id]);

        res.json({ guide, tours });
    } catch (error) {
        console.error('Ошибка получения гида:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ПОДПИСКА
// =====================================================

// Подписка на новости
app.get('/api/travel-ideas', async (req, res) => {
    try {
        const { category, limit = 3 } = req.query;
        const params = [];

        let sql = `
            SELECT ti.*, tic.name as category_name, tic.order_index as category_order
            FROM travel_ideas ti
            JOIN travel_idea_categories tic ON tic.slug = ti.category_slug
            WHERE ti.is_active = 1 AND tic.is_active = 1
        `;

        if (category) {
            sql += ' AND ti.category_slug = ?';
            params.push(category);
        }

        sql += ' ORDER BY tic.order_index ASC, ti.order_index ASC, ti.id ASC';

        const rows = await dbAll(sql, params);
        const maxPerCategory = Math.max(1, parseInt(limit, 10) || 3);
        const ideasByCategory = {};

        rows.forEach((idea) => {
            if (!ideasByCategory[idea.category_slug]) ideasByCategory[idea.category_slug] = [];
            if (ideasByCategory[idea.category_slug].length < maxPerCategory) {
                ideasByCategory[idea.category_slug].push(idea);
            }
        });

        const categories = await dbAll(`
            SELECT slug, name, order_index
            FROM travel_idea_categories
            WHERE is_active = 1
            ORDER BY order_index ASC
        `);

        res.json({ categories, ideasByCategory });
    } catch (error) {
        console.error('Ошибка получения идей для путешествий:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/travel-ideas/:slug', async (req, res) => {
    try {
        const idea = await dbGet(`
            SELECT ti.*, tic.name as category_name
            FROM travel_ideas ti
            JOIN travel_idea_categories tic ON tic.slug = ti.category_slug
            WHERE ti.slug = ? AND ti.is_active = 1 AND tic.is_active = 1
        `, [req.params.slug]);

        if (!idea) {
            return res.status(404).json({ error: 'Идея не найдена' });
        }

        const parseList = (value) => {
            try {
                const parsed = JSON.parse(value || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                return [];
            }
        };

        const related = await dbAll(`
            SELECT id, slug, title, tag, image_url, link_url
            FROM travel_ideas
            WHERE category_slug = ? AND slug != ? AND is_active = 1
            ORDER BY order_index ASC, id ASC
            LIMIT 3
        `, [idea.category_slug, idea.slug]);

        res.json({
            idea: {
                ...idea,
                highlights: parseList(idea.highlights_json),
                route: parseList(idea.route_json),
                packing_list: parseList(idea.packing_list_json)
            },
            related
        });
    } catch (error) {
        console.error('Ошибка получения идеи путешествия:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email, name } = req.body;

        await dbRun(
            `INSERT OR REPLACE INTO subscribers (email, name, is_active, subscribed_at)
             VALUES (?, ?, 1, datetime('now'))`,
            [email, name || null]
        );

        res.json({ success: true, message: 'Вы успешно подписались на рассылку' });
    } catch (error) {
        console.error('Ошибка подписки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// КОНТАКТЫ
// =====================================================

// Отправка контактной формы
app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        await dbRun(
            `INSERT INTO contacts (name, email, phone, subject, message, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'new', datetime('now'))`,
            [name, email, phone, subject, message]
        );

        res.json({ success: true, message: 'Сообщение отправлено. Мы свяжемся с вами в ближайшее время.' });
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/dream-requests', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let userId = null;

        if (token) {
            try {
                const user = jwt.verify(token, JWT_SECRET);
                userId = user.id;
            } catch (error) {}
        }

        const name = cleanOptionalText(req.body.name);
        const phone = cleanOptionalText(req.body.phone);
        const email = cleanOptionalText(req.body.email);
        const destination = cleanOptionalText(req.body.destination);
        const budget = cleanOptionalText(req.body.budget);
        const date_from = cleanOptionalText(req.body.date_from);
        const date_to = cleanOptionalText(req.body.date_to);
        const people = Number(req.body.people || 0) || null;
        const message = cleanOptionalText(req.body.message);

        if (!name || !phone) {
            return res.status(400).json({ error: 'Укажите имя и телефон' });
        }

        if (date_from && date_to && date_to < date_from) {
            return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' });
        }

        const result = await dbRun(
            `INSERT INTO dream_requests
             (user_id, name, phone, email, destination, budget, date_from, date_to, people, message, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'), datetime('now'))`,
            [userId, name, phone, email, destination, budget, date_from, date_to, people, message]
        );

        res.json({
            success: true,
            request: { id: result.lastID },
            message: 'Заявка отправлена. Менеджер свяжется с вами для сборки путешествия.'
        });
    } catch (error) {
        console.error('Ошибка заявки мечты:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// СТАТИСТИКА (ТОЛЬКО ДЛЯ АДМИНА)
// =====================================================

app.get('/api/admin/stats', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const totalUsers = await dbGet('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
        const totalTours = await dbGet('SELECT COUNT(*) as count FROM tours WHERE status IN ("active", "upcoming")');
        const totalBookings = await dbGet('SELECT COUNT(*) as count FROM bookings');
        const totalRevenue = await dbGet('SELECT SUM(total_price_rub) as total FROM bookings WHERE status IN ("confirmed", "paid")');
        const recentBookings = await dbAll(`
            SELECT b.*, u.full_name, t.title
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN tours t ON b.tour_id = t.id
            ORDER BY b.created_at DESC
            LIMIT 10
        `);

        res.json({
            stats: {
                users: totalUsers.count,
                tours: totalTours.count,
                bookings: totalBookings.count,
                revenue: totalRevenue.total || 0
            },
            recentBookings
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/admin/dream-requests', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const requests = await dbAll(`
            SELECT dr.*, u.full_name as user_name, u.email as user_email
            FROM dream_requests dr
            LEFT JOIN users u ON u.id = dr.user_id
            ORDER BY dr.created_at DESC
        `);
        res.json({ requests });
    } catch (error) {
        console.error('Ошибка админ-заявок мечты:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.put('/api/admin/dream-requests/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const status = cleanOptionalText(req.body.status) || 'new';
        const adminComment = cleanOptionalText(req.body.admin_comment);
        await dbRun(
            `UPDATE dream_requests SET status = ?, admin_comment = ?, updated_at = datetime('now') WHERE id = ?`,
            [status, adminComment, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления заявки мечты:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/admin/contacts', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const contacts = await dbAll('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json({ contacts });
    } catch (error) {
        console.error('Ошибка админ-контактов:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.put('/api/admin/contacts/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const status = cleanOptionalText(req.body.status) || 'new';
        await dbRun('UPDATE contacts SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления контакта:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/admin/bookings', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const bookings = await dbAll(`
            SELECT b.*, u.full_name, u.email, u.phone, t.title
            FROM bookings b
            LEFT JOIN users u ON u.id = b.user_id
            LEFT JOIN tours t ON t.id = b.tour_id
            ORDER BY b.booking_date DESC, b.created_at DESC
        `);
        res.json({ bookings });
    } catch (error) {
        console.error('Ошибка админ-броней:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.put('/api/admin/bookings/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const status = cleanOptionalText(req.body.status) || 'pending';
        const paymentStatus = cleanOptionalText(req.body.payment_status) || 'unpaid';
        await dbRun(
            `UPDATE bookings SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?`,
            [status, paymentStatus, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления брони:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

function tourPayload(body) {
    return {
        title: cleanOptionalText(body.title),
        slug: cleanOptionalText(body.slug),
        destination: cleanOptionalText(body.destination),
        country: cleanOptionalText(body.country),
        region: cleanOptionalText(body.region),
        duration_days: numberOrNull(body.duration_days),
        duration_nights: numberOrZero(body.duration_nights),
        price_rub: numberOrNull(body.price_rub),
        price_usd: numberOrZero(body.price_usd),
        difficulty_level: cleanOptionalText(body.difficulty_level) || 'moderate',
        max_group_size: numberOrNull(body.max_group_size),
        is_cruise: body.is_cruise ? 1 : 0,
        start_date: cleanOptionalText(body.start_date),
        end_date: cleanOptionalText(body.end_date),
        main_image_url: cleanOptionalText(body.main_image_url),
        short_description: cleanOptionalText(body.short_description),
        full_description: cleanOptionalText(body.full_description),
        available_spots: numberOrNull(body.available_spots),
        total_spots: numberOrNull(body.total_spots),
        status: cleanOptionalText(body.status) || 'active'
    };
}

app.get('/api/admin/tours', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const tours = await dbAll('SELECT * FROM tours ORDER BY updated_at DESC, id DESC');
        res.json({ tours });
    } catch (error) {
        console.error('Ошибка админ-туров:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/admin/tours/image', authenticateToken, authenticateAdmin, (req, res) => {
    adminImageUpload.single('image')(req, res, (error) => {
        if (error) {
            return res.status(400).json({ error: error.message || 'Не удалось загрузить картинку' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Выберите картинку' });
        }
        res.json({
            success: true,
            image_url: `img/${req.file.filename}`,
            filename: req.file.filename
        });
    });
});

app.post('/api/admin/tours', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const tour = tourPayload(req.body);
        if (!tour.title || !tour.slug) {
            return res.status(400).json({ error: 'Укажите название и slug' });
        }

        const result = await dbRun(
            `INSERT INTO tours
             (title, slug, destination, country, region, duration_days, duration_nights, price_rub, price_usd,
              difficulty_level, max_group_size, is_cruise, start_date, end_date, main_image_url,
              short_description, full_description, available_spots, total_spots, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [tour.title, tour.slug, tour.destination, tour.country, tour.region, tour.duration_days, tour.duration_nights,
                tour.price_rub, tour.price_usd, tour.difficulty_level, tour.max_group_size, tour.is_cruise,
                tour.start_date, tour.end_date, tour.main_image_url, tour.short_description, tour.full_description,
                tour.available_spots, tour.total_spots, tour.status]
        );
        res.json({ success: true, id: result.lastID });
    } catch (error) {
        console.error('Ошибка создания тура:', error);
        res.status(500).json({ error: error.message?.includes('UNIQUE') ? 'Такой slug уже существует' : 'Внутренняя ошибка сервера' });
    }
});

app.put('/api/admin/tours/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const tour = tourPayload(req.body);
        if (!tour.title || !tour.slug) {
            return res.status(400).json({ error: 'Укажите название и slug' });
        }

        await dbRun(
            `UPDATE tours SET
                title = ?, slug = ?, destination = ?, country = ?, region = ?, duration_days = ?, duration_nights = ?,
                price_rub = ?, price_usd = ?, difficulty_level = ?, max_group_size = ?, is_cruise = ?,
                start_date = ?, end_date = ?, main_image_url = ?, short_description = ?, full_description = ?,
                available_spots = ?, total_spots = ?, status = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [tour.title, tour.slug, tour.destination, tour.country, tour.region, tour.duration_days, tour.duration_nights,
                tour.price_rub, tour.price_usd, tour.difficulty_level, tour.max_group_size, tour.is_cruise,
                tour.start_date, tour.end_date, tour.main_image_url, tour.short_description, tour.full_description,
                tour.available_spots, tour.total_spots, tour.status, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления тура:', error);
        res.status(500).json({ error: error.message?.includes('UNIQUE') ? 'Такой slug уже существует' : 'Внутренняя ошибка сервера' });
    }
});

app.delete('/api/admin/tours/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        if (req.query.hard === '1' || req.query.hard === 'true') {
            const tour = await dbGet('SELECT id FROM tours WHERE id = ?', [req.params.id]);
            if (!tour) {
                return res.status(404).json({ error: 'Тур не найден' });
            }

            await dbRun('BEGIN TRANSACTION');
            try {
                await dbRun('DELETE FROM favorites WHERE tour_id = ?', [req.params.id]);
                await dbRun('DELETE FROM reviews WHERE tour_id = ?', [req.params.id]);
                await dbRun('DELETE FROM bookings WHERE tour_id = ?', [req.params.id]);
                await dbRun('DELETE FROM tour_guides WHERE tour_id = ?', [req.params.id]);
                await dbRun('DELETE FROM tours WHERE id = ?', [req.params.id]);
                await dbRun('COMMIT');
                return res.json({ success: true, deleted: true });
            } catch (deleteError) {
                await dbRun('ROLLBACK');
                throw deleteError;
            }
        }

        await dbRun('UPDATE tours SET status = "cancelled", updated_at = datetime("now") WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка архивации тура:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/admin/users', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT id, email, full_name, phone, city, is_admin, is_active, registration_date, last_login
            FROM users
            ORDER BY registration_date DESC, id DESC
        `);
        res.json({ users });
    } catch (error) {
        console.error('Ошибка админ-пользователей:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

ensureUserProfileColumns()
    .then(() => ensureTravelIdeas())
    .then(() => ensureDreamRequests())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
            console.log(`http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Ошибка подготовки базы данных:', error);
        process.exit(1);
    });

// Обработка закрытия приложения
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Ошибка закрытия БД:', err.message);
        } else {
            console.log('Соединение с БД закрыто');
        }
        process.exit(0);
    });
});
