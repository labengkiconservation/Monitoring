# Smart Patrol Labengki

Peta hasil patroli SMART tim masyarakat Labengki Conservation, dengan filter,
ringkasan effort patroli, dan panel Kelola Data untuk impor laporan.

Aplikasi statis (HTML + JavaScript, Leaflet, Supabase). Tidak perlu build.

## Menjalankan

1. Isi `SUPABASE_URL` dan `SUPABASE_KEY` (publishable key) di `config.js`
   dengan proyek Supabase milik Labengki.
2. Deploy folder ini apa adanya (mis. Vercel, framework "Other", tanpa build command),
   atau buka lokal dengan server statis: `npx http-server -p 4310`.

Selama `config.js` kosong, halaman menampilkan "Database belum disiapkan".

## Database

Proyek Supabase baru disiapkan dengan menjalankan `supabase/setup.sql` sekali
(SQL Editor → tempel → Run). Ganti `GANTI_EMAIL_ADMIN` dulu dengan email akun
admin, lalu buat akun itu di Authentication → Users → Add user.

Tabel yang dipakai: `patroli`, `temuan_patroli`, `unggahan`, `kamus`, dan
storage bucket publik `foto-temuan`. Akses tulis lewat panel Kelola Data
memakai login email/password Supabase; keamanan diatur oleh RLS di database.
Jangan menaruh secret key / service_role key di file mana pun di repo ini.
