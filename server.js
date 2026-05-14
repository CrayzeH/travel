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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/')));

// Настройка загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Подключение к базе данных
const db = new sqlite3.Database(path.join(__dirname, 'tours.db'), (err) => {
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
        const { email, password, full_name, phone, birth_date, city } = req.body;

        // Проверяем, существует ли пользователь
        const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
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
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Вход пользователя
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await dbGet(
            `SELECT id, email, password_hash, full_name, phone, birth_date, city, is_admin, 
                    email_notifications, sms_notifications, promo_notifications
             FROM users WHERE email = ? AND is_active = 1`,
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
            `SELECT id, email, full_name, phone, birth_date, city, registration_date, last_login,
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
        const { full_name, phone, birth_date, city, email_notifications, sms_notifications, promo_notifications } = req.body;

        await dbRun(
            `UPDATE users 
             SET full_name = ?, phone = ?, birth_date = ?, city = ?,
                 email_notifications = ?, sms_notifications = ?, promo_notifications = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [full_name, phone, birth_date, city, email_notifications || 0, sms_notifications || 0, promo_notifications || 0, req.user.id]
        );

        res.json({ success: true, message: 'Профиль успешно обновлен' });
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
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
        await dbRun('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

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

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`http://localhost:${PORT}`);
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