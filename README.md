# 📱 Social Media API

Backend REST API untuk platform social media dengan fitur lengkap: feed, interaksi, moderasi konten, dan dashboard admin.

---

## 🚀 Cara Menjalankan

### 1. Clone / Download Project
```bash
cd social-media-api
npm install
```

### 2. Setup Database MySQL
```sql
-- Jalankan file schema di MySQL:
source src/config/schema.sql
```

### 3. Konfigurasi Environment
```bash
cp .env.example .env
# Edit .env sesuai konfigurasi database Anda
```

### 4. Jalankan Server
```bash
npm run dev   # development (nodemon)
npm start     # production
```

---

## 📁 Struktur Folder

```
social-media-api/
├── app.js                     # Entry point Express
├── .env.example               # Template konfigurasi
├── package.json
├── uploads/                   # Folder file upload
│   ├── images/                # Gambar post
│   └── avatars/               # Avatar profil
└── src/
    ├── config/
    │   ├── database.js        # Koneksi MySQL (pool)
    │   └── schema.sql         # DDL dan seed database
    ├── middleware/
    │   ├── auth.js            # verifyToken, authorize, optionalAuth
    │   └── upload.js          # Multer (post image & avatar)
    ├── controllers/
    │   ├── authController.js  # Register & Login
    │   ├── userController.js  # Profil, follow/unfollow
    │   ├── postController.js  # Post, like, bookmark, feed
    │   ├── commentController.js # Komentar
    │   ├── reportController.js  # Laporan konten
    │   └── adminController.js   # Dashboard & manajemen user
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── postRoutes.js
    │   ├── reportRoutes.js
    │   └── adminRoutes.js
    └── utils/
        ├── response.js        # Helper response standar
        └── logger.js          # Activity logger
```

---

## 🔐 Role User

| Role        | Akses |
|-------------|-------|
| `user`      | Register, login, buat post, komentar, like, bookmark, follow |
| `moderator` | Semua akses user + lihat & tindak laporan, hide/remove post |
| `admin`     | Semua akses + dashboard, kelola user, ubah role, ban user |

---

## 📡 Daftar Endpoint

### Auth
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/auth/register` | Registrasi user baru |
| POST | `/api/auth/login` | Login & dapatkan JWT |

### Users
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | `/api/users/profile` | ✅ | Profil diri sendiri |
| GET | `/api/users/:username` | Optional | Profil user lain |
| PUT | `/api/users/profile` | ✅ | Update profil + avatar |
| PUT | `/api/users/password` | ✅ | Ganti password |
| POST | `/api/users/:username/follow` | ✅ | Follow/unfollow |
| GET | `/api/users/:username/followers` | - | Daftar followers |
| GET | `/api/users/:username/following` | - | Daftar following |

### Posts
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| POST | `/api/posts` | ✅ | Buat post (+ upload gambar) |
| GET | `/api/posts` | Optional | Explore semua post |
| GET | `/api/posts/feed` | ✅ | Feed dari user yang diikuti |
| GET | `/api/posts/bookmarks` | ✅ | Daftar bookmark saya |
| GET | `/api/posts/:uuid` | Optional | Detail post |
| PUT | `/api/posts/:uuid` | ✅ | Edit post |
| DELETE | `/api/posts/:uuid` | ✅ | Hapus post |
| POST | `/api/posts/:uuid/like` | ✅ | Toggle like |
| POST | `/api/posts/:uuid/bookmark` | ✅ | Toggle bookmark |
| GET | `/api/posts/:uuid/comments` | Optional | Daftar komentar |
| POST | `/api/posts/:uuid/comments` | ✅ | Tambah komentar |
| DELETE | `/api/posts/comments/:id` | ✅ | Hapus komentar |

### Reports (Moderasi)
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| POST | `/api/reports` | ✅ | Laporkan konten |
| GET | `/api/reports` | Mod/Admin | Lihat laporan |
| PUT | `/api/reports/:id` | Mod/Admin | Tindak laporan |

### Admin
| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | `/api/admin/dashboard` | Admin | Statistik & grafik aktivitas |
| GET | `/api/admin/users` | Admin | Daftar semua user |
| PUT | `/api/admin/users/:uuid/role` | Admin | Ubah role user |
| PUT | `/api/admin/users/:uuid/ban` | Admin | Ban/unban user |
| GET | `/api/admin/users/:uuid/activity` | Admin | Log aktivitas user |

---

## 🌟 Fitur Feed Ranking

Feed mendukung parameter `?sort=` dengan 3 mode:
- `time` — urut berdasarkan waktu posting terbaru (default)
- `likes` — urut berdasarkan jumlah like terbanyak
- `comments` — urut berdasarkan jumlah komentar terbanyak

```
GET /api/posts/feed?sort=likes&page=1&limit=10
```

---

## 🔑 Autentikasi

Gunakan header `Authorization: Bearer <token>` untuk endpoint yang membutuhkan autentikasi.

### Contoh Request Register:
```json
POST /api/auth/register
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "full_name": "John Doe"
}
```

### Contoh Request Login:
```json
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}
```

### Contoh Upload Post dengan Gambar:
```
POST /api/posts
Content-Type: multipart/form-data
Authorization: Bearer <token>

Form fields:
  caption: "Caption post saya"
  image: [file]
```

---

## 👤 Akun Admin Default

```
Email    : admin@socialmedia.com
Password : Admin@123
```
