
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const { testConnection } = require('./src/config/database');
const initDatabase = require('./src/config/initDB');

const app = express();


app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/auth',    require('./src/routes/authRoutes'));


app.use('/api/users',   require('./src/routes/userRoutes'));


app.use('/api/posts',   require('./src/routes/postRoutes'));


app.use('/api/reports', require('./src/routes/reportRoutes'));

app.use('/api/admin',   require('./src/routes/adminRoutes'));

app.use('/api/stories',       require('./src/routes/storyRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/chat',          require('./src/routes/chatRoutes'));
app.use('/api/hashtags',      require('./src/routes/hashtagRoutes'));


app.get('/', (req, res) => {
  res.json({
    success: true,
    app: 'Social Media API',
    matkul: 'Arsitektur dan Pengembangan Backend - Pertemuan 7',
    topik: 'Web Service dengan Autentikasi JWT',
    cara_pakai: {
      step1: 'POST /api/auth/register  → daftar akun',
      step2: 'POST /api/auth/login     → dapat token JWT',
      step3: 'Gunakan token di header  → Authorization: Bearer <token>',
      step4: 'Akses endpoint proteksi  → GET /api/users/profile, dll',
    },
    endpoints: {
      auth:    { register: 'POST /api/auth/register', login: 'POST /api/auth/login' },
      users:   { profile: 'GET /api/users/profile', update: 'PUT /api/users/profile' },
      posts:   { feed: 'GET /api/posts/feed', create: 'POST /api/posts' },
      reports: 'POST /api/reports',
      admin:   'GET /api/admin/dashboard',
    },
    roles: ['user', 'moderator', 'admin'],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
});


app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan server.'
      : err.message,
  });
});


const PORT = process.env.PORT || 3000;

const start = async () => {
  await initDatabase();
  await testConnection();
  app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  Server  : http://localhost:${PORT}                ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  Role: user | moderator | admin                  ║');
    console.log('║  Admin: admin@socialmedia.com / Admin@123        ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
  });
};

start();

module.exports = app;
