-- Smart Patrol Labengki — setup database Supabase (jalankan SEKALI di proyek baru yang kosong).
-- Cara: Supabase Dashboard → SQL Editor → New query → tempel seluruh file → Run.
-- Struktur sama dengan Smart Patrol YPI (2026-11-16), tanpa data.
--
-- WAJIB sebelum Run: ganti email di bagian "ADMIN" (cari GANTI_EMAIL_ADMIN) dengan email
-- akun yang akan login ke panel Kelola Data. Akun itu dibuat di
-- Authentication → Users → Add user (email + password, centang Auto Confirm).

create extension if not exists postgis with schema extensions;

-- ===================================================================== ADMIN
-- Hanya email di tabel ini yang boleh mengubah data.
create table public.admin (email text primary key, dibuat_pada timestamptz not null default now());
alter table public.admin enable row level security;
insert into public.admin (email) values ('GANTI_EMAIL_ADMIN');

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin a where a.email = (auth.jwt() ->> 'email'));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

grant select on public.admin to authenticated;
create policy "admin lihat admin" on public.admin for select to authenticated using (public.is_admin());

-- ================================================================= UNGGAHAN
create table public.unggahan (
  id bigint generated always as identity primary key,
  nama_file text not null,
  jumlah_baris int not null default 0,
  jumlah_baru int,
  dibuat_oleh text default (auth.jwt() ->> 'email'),
  dibuat_pada timestamptz not null default now()
);
alter table public.unggahan enable row level security;
grant select, insert, update on public.unggahan to authenticated;
create policy "admin unggahan" on public.unggahan for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ================================================================== PATROLI
-- Satu baris per patroli SMART (effort).
create table public.patroli (
  id text primary key,                        -- SMART_PatrolID
  kawasan text not null,
  tim text, mandat text, transportasi text,
  kode_tim text, kode_mandat text, kode_transportasi text,  -- kode mentah SMART
  tujuan text,                                -- SMART_Objective
  jumlah_anggota int,
  mulai timestamp, selesai timestamp,         -- waktu lokal lapangan
  durasi_aktif_menit numeric,                 -- tanpa jeda (pause)
  jarak_m numeric,                            -- jarak menurut SMART
  jarak_jalur_m numeric,                      -- jarak dari titik jalur GPS
  jalur extensions.geometry(LineString, 4326),
  mitra text,
  desa text,
  sumber text not null default 'json',        -- 'json' (SMART Mobile) atau 'sheet' (Effort Patrol)
  batch_id bigint references public.unggahan (id),
  dihapus_pada timestamptz,
  dibuat_pada timestamptz not null default now()
);
create index patroli_jalur_idx on public.patroli using gist (jalur);
create index patroli_mulai_idx on public.patroli (mulai);
alter table public.patroli enable row level security;
revoke all on public.patroli from anon, authenticated;
-- Publik: ringkasan effort + jalur patroli (sama seperti YPI; hapus "jalur" dari daftar ini
-- bila Labengki tidak ingin rute patroli terlihat publik).
grant select (id, kawasan, tim, mandat, transportasi, jumlah_anggota, mulai, selesai,
  durasi_aktif_menit, jarak_m, jarak_jalur_m, dihapus_pada, jalur, tujuan, mitra, desa, sumber)
  on public.patroli to anon;
grant select, insert, update, delete on public.patroli to authenticated;
create policy "publik baca patroli" on public.patroli for select to anon using (dihapus_pada is null);
create policy "admin kelola patroli" on public.patroli for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =========================================================== TEMUAN PATROLI
create table public.temuan_patroli (
  id bigint generated always as identity primary key,
  kawasan text not null,
  tim text,
  waktu timestamp,            -- waktu lokal lapangan
  lon double precision not null,
  lat double precision not null,
  geom extensions.geometry(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)) stored,
  kategori text,
  subkategori text,
  jenis_observasi text,
  spesies_satwa text,
  spesies_tumbuhan text,
  jenis_kelamin text,
  umur text,
  jumlah numeric,
  satuan text,
  total_orang numeric,
  pelanggaran boolean,
  tindakan text,
  kondisi_fitur text,
  nama text,       -- privat: nama pelaku
  info_lain text,  -- privat: catatan bebas
  urutan int not null default 1,   -- kemunculan ke-n dari baris identik dalam satu file
  kunci text not null,             -- anti-duplikat, diisi trigger
  smart_id text,                   -- ID observasi SMART
  status text not null default 'baru' check (status in ('baru', 'terverifikasi', 'disembunyikan')),
  batch_id bigint references public.unggahan (id),
  dihapus_pada timestamptz,        -- terisi = ada di Sampah
  diubah_oleh text,
  diubah_pada timestamptz,
  patroli_id text references public.patroli (id),
  atribut jsonb,                   -- atribut asli SMART
  foto text[],                     -- path di bucket foto-temuan
  waypoint_id text,                -- SMART_SightingGroupId
  mitra text,
  desa text,
  kelompok text,
  created_at timestamptz not null default now()
);
create index temuan_patroli_geom_idx on public.temuan_patroli using gist (geom);
create index temuan_patroli_waktu_idx on public.temuan_patroli (waktu);
create index temuan_patroli_kategori_idx on public.temuan_patroli (kategori, subkategori);
create unique index temuan_patroli_kunci_idx on public.temuan_patroli (kunci);
create unique index temuan_patroli_smart_id_idx on public.temuan_patroli (smart_id);
create index temuan_patroli_batch_idx on public.temuan_patroli (batch_id);
create index temuan_patroli_aktif_idx on public.temuan_patroli (status) where dihapus_pada is null;
create index temuan_patroli_patroli_idx on public.temuan_patroli (patroli_id);
create index temuan_patroli_waypoint_idx on public.temuan_patroli (waypoint_id);
create index temuan_patroli_mitra_idx on public.temuan_patroli (mitra);

alter table public.temuan_patroli enable row level security;
-- Publik hanya boleh baca kolom non-sensitif (nama, info_lain, atribut tertutup).
revoke all on public.temuan_patroli from anon, authenticated;
grant select (id, kawasan, tim, waktu, lon, lat, kategori, subkategori, jenis_observasi,
  spesies_satwa, spesies_tumbuhan, jenis_kelamin, umur, jumlah, satuan, total_orang,
  pelanggaran, tindakan, kondisi_fitur, status, patroli_id, foto, waypoint_id,
  mitra, desa, kelompok) on public.temuan_patroli to anon;
grant select, insert, update, delete on public.temuan_patroli to authenticated;
create policy "publik baca" on public.temuan_patroli for select to anon
  using (dihapus_pada is null and status <> 'disembunyikan');
create policy "admin kelola" on public.temuan_patroli for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Kunci anti-duplikat, dihitung hanya saat insert (hasil kurasi tidak tertimpa unggah ulang).
create or replace function public.hitung_kunci_temuan() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.kunci := md5(concat_ws('|',
    new.kawasan, new.tim, to_char(new.waktu, 'YYYY-MM-DD HH24:MI:SS'),
    round(new.lon::numeric, 6), round(new.lat::numeric, 6),
    new.kategori, new.subkategori, new.jenis_observasi, new.spesies_satwa, new.spesies_tumbuhan,
    new.jenis_kelamin, new.umur, trim_scale(new.jumlah), new.satuan, trim_scale(new.total_orang),
    new.pelanggaran, new.tindakan, new.kondisi_fitur, new.nama, new.info_lain, new.urutan,
    new.smart_id));
  return new;
end $$;
revoke execute on function public.hitung_kunci_temuan() from public, anon, authenticated;
create trigger temuan_patroli_kunci before insert on public.temuan_patroli
for each row execute function public.hitung_kunci_temuan();

create or replace function public.tandai_pengubah() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diubah_oleh := auth.jwt() ->> 'email';
  new.diubah_pada := now();
  return new;
end $$;
create trigger temuan_patroli_pengubah before update on public.temuan_patroli
for each row execute function public.tandai_pengubah();

-- ============================================================ LOG PERUBAHAN
create table public.log_perubahan (
  id bigint generated always as identity primary key,
  temuan_id bigint not null,
  aksi text not null,
  data_lama jsonb,
  data_baru jsonb,
  oleh text default (auth.jwt() ->> 'email'),
  pada timestamptz not null default now()
);
create index log_perubahan_pada_idx on public.log_perubahan (pada desc);
alter table public.log_perubahan enable row level security;
grant select on public.log_perubahan to authenticated;
create policy "admin baca log" on public.log_perubahan for select to authenticated using (public.is_admin());

create or replace function public.catat_perubahan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  abaikan text[] := array['geom', 'kunci', 'diubah_oleh', 'diubah_pada'];
  lama jsonb := to_jsonb(old) - abaikan;
  baru jsonb;
  aksi text;
begin
  if tg_op = 'DELETE' then
    insert into public.log_perubahan (temuan_id, aksi, data_lama) values (old.id, 'hapus permanen', lama);
    return old;
  end if;
  baru := to_jsonb(new) - abaikan;
  aksi := case
    when old.dihapus_pada is null and new.dihapus_pada is not null then 'ke sampah'
    when old.dihapus_pada is not null and new.dihapus_pada is null then 'pulihkan'
    else 'ubah' end;
  insert into public.log_perubahan (temuan_id, aksi, data_lama, data_baru)
  select new.id, aksi,
    jsonb_object_agg(l.key, l.value) filter (where baru -> l.key is distinct from l.value),
    jsonb_object_agg(l.key, baru -> l.key) filter (where baru -> l.key is distinct from l.value)
  from jsonb_each(lama) l;
  return new;
end $$;
revoke execute on function public.catat_perubahan() from public, anon, authenticated;
create trigger temuan_patroli_log after update or delete on public.temuan_patroli
for each row execute function public.catat_perubahan();

-- ==================================================================== KAMUS
-- Kode SMART (UUID) -> nama.
create table public.kamus (
  kode text primary key,
  jenis text not null,
  label text,
  kolom text,
  diubah_pada timestamptz not null default now()
);
alter table public.kamus enable row level security;
revoke all on public.kamus from anon;
grant select, insert, update, delete on public.kamus to authenticated;
create policy "admin kamus" on public.kamus for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================================================================== FOTO
-- Bucket publik: foto terlihat lewat URL-nya; hanya admin yang mengunggah/mengubah/menghapus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-temuan', 'foto-temuan', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "admin unggah foto" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-temuan' and public.is_admin());
create policy "admin ubah foto" on storage.objects for update to authenticated
  using (bucket_id = 'foto-temuan' and public.is_admin());
create policy "admin hapus foto" on storage.objects for delete to authenticated
  using (bucket_id = 'foto-temuan' and public.is_admin());
create policy "admin lihat daftar foto" on storage.objects for select to authenticated
  using (bucket_id = 'foto-temuan' and public.is_admin());
