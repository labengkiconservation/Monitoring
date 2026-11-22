-- Migrasi 02: variabel tambahan dari ekspor SMART Desktop (patroli_smart_gabungan.geojson).
-- Jalankan SEKALI di Supabase > SQL Editor setelah setup.sql. Aman dijalankan ulang (if not exists).

-- ================================================================== PATROLI
-- Jalur ekspor SMART Desktop berupa MultiLineString; LineString lama tetap valid.
alter table public.patroli alter column jalur type extensions.geometry(Geometry, 4326)
  using extensions.st_setsrid(jalur, 4326);
alter table public.patroli
  add column if not exists seri text,             -- seri ID patroli SMART, mis. TLGC
  add column if not exists tipe_patroli text,     -- GROUND / MARINE
  add column if not exists stasiun text,
  add column if not exists ketua_tim text,        -- privat
  add column if not exists anggota text,          -- privat, dipisah "; "
  add column if not exists bersenjata boolean,
  add column if not exists istirahat_menit numeric,
  add column if not exists komentar text;         -- privat
grant select (seri, tipe_patroli, stasiun, bersenjata, istirahat_menit) on public.patroli to anon;

-- =========================================================== TEMUAN PATROLI
alter table public.temuan_patroli
  add column if not exists perlu_tindak_lanjut boolean,
  add column if not exists status_tindak_lanjut text,   -- Terselesaikan / Masih proses / Lainnya
  add column if not exists tgl_tindak_lanjut date,
  add column if not exists usia_temuan text,            -- mis. "< 1 minggu"
  add column if not exists lokasi_temuan text,
  add column if not exists zonasi_kawasan text,         -- zona menurut tim di lapangan
  add column if not exists kapal jsonb;                 -- jenis, GT, kegiatan, hasil tangkapan, dll. (tanpa nama kapal/nakhoda)
grant select (perlu_tindak_lanjut, status_tindak_lanjut, tgl_tindak_lanjut, usia_temuan,
  lokasi_temuan, zonasi_kawasan, kapal) on public.temuan_patroli to anon;
