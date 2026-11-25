// Laporan Word (.docx) dari data yang sedang difilter, dibuat di browser dengan pustaka docx (dimuat saat dipakai).
// Narasi disusun dari kalimat pola + angka (tanpa AI). Versi internal (admin login) menambah kolom privat.
// Memakai global index.html: semua, patroli, filter, bulanCocok, NAMA_BULAN, TLGC, WARNA_KAT, WARNA_ZONA, WARNA_HABITAT, lapisZona, unik, fmt.
const Laporan = (() => {
  let docxSiap;
  const muatDocx = () => docxSiap ??= new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    s.onload = ok; s.onerror = () => { docxSiap = null; gagal(new Error('Gagal memuat pustaka Word. Periksa koneksi internet.')); };
    document.head.append(s);
  });

  // ---------- angka & teks ----------
  const d1 = v => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  const d2 = v => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const daftar = a => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} dan ${a[1]}` : `${a.slice(0, -1).join(', ')}, dan ${a.at(-1)}`;
  const hitung = (arr, f) => { const m = new Map(); for (const r of arr) { const k = f(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const tgl = s => s ? `${+s.slice(8, 10)} ${NAMA_BULAN[+s.slice(5, 7) - 1].slice(0, 3)} ${s.slice(0, 4)}` : '';
  const labelBulan = k => `${NAMA_BULAN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
  // huruf kecil kecuali singkatan (HHBK, GT)
  const kecil = s => s && s.split(' ').map(w => /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()).join(' ');
  const titikJalur = p => !p.jalur ? [] : p.jalur.type === 'MultiLineString' ? p.jalur.coordinates.flat() : p.jalur.coordinates;

  // Data dengan aturan yang sama seperti peta & panel Statistik.
  function pilih(f) {
    const temuan = semua.filter(r => r.tahun >= f.dari && r.tahun <= f.sampai && bulanCocok(f, r.waktu) &&
      (!f.kawasan || r.kawasan === f.kawasan) && (!f.tim || r.tim === f.tim) && (!f.kat || r.kategori === f.kat) &&
      (!f.sub || r.subkategori === f.sub) && (!f.langgar || r.pelanggaran === true));
    const pat = patroli.filter(x => x.tahun >= f.dari && x.tahun <= f.sampai && bulanCocok(f, x.mulai) &&
      (!f.kawasan || x.kawasan === f.kawasan) && (!f.tim || x.tim === f.tim));
    const km = pat.reduce((s, x) => s + x.km, 0);
    // Temuan unik per hari patroli (sama dengan encounter rate di panel).
    const perId = new Map(pat.map(x => [x.id, x])), unikPer = new Map();
    for (const r of temuan) {
      const x = r.patroli_id && perId.get(r.patroli_id); if (!x) continue;
      const t = x.mulai.slice(0, 10);
      (unikPer.get(t) ?? unikPer.set(t, new Set()).get(t))
        .add([r.waypoint_id || `${r.waktu}|${r.lon}|${r.lat}`, r.kategori, r.subkategori, r.spesies_satwa || r.jenis_observasi].join('|'));
    }
    const nUnik = [...unikPer.values()].reduce((s, x) => s + x.size, 0);
    return { temuan, pat, km, nUnik, unikPer, er: km > 0 ? nUnik / km : null, cak: cakupanGrid(pat, temuan) };
  }

  function labelPeriode(f) {
    if (f.bulan) return `${NAMA_BULAN[f.bulan - 1]} ${f.dari === f.sampai ? f.dari : `${f.dari}–${f.sampai}`}`;
    return f.dari === f.sampai ? `tahun ${f.dari}` : `${f.dari}–${f.sampai}`;
  }
  // Periode pembanding dengan panjang yang sama tepat sebelum periode laporan.
  function periodeSebelum(f) {
    if (f.bulan && f.dari === f.sampai) {
      const t = f.bulan === 1 ? f.dari - 1 : f.dari, b = f.bulan === 1 ? 12 : f.bulan - 1;
      return { ...f, dari: t, sampai: t, bulan: b };
    }
    if (f.bulan) return null; // bulan yang sama di beberapa tahun: tidak ada pembanding yang jelas
    const n = f.sampai - f.dari + 1;
    return { ...f, dari: f.dari - n, sampai: f.sampai - n };
  }
  const arah = (baru, lama) => {
    const p = Math.round((baru - lama) / lama * 100);
    return Math.abs(p) < 10 ? 'relatif sama dengan' : p > 0 ? `naik ${p}% dibanding` : `turun ${-p}% dibanding`;
  };

  // ---------- narasi (kalimat pola; **tebal**) ----------
  function narasi(f, a, b, fb) {
    const per = labelPeriode(f), out = [];
    const timTeks = f.tim ? `tim ${f.tim}` : 'tim patroli';
    if (a.pat.length) {
      const laut = a.pat.filter(p => p.tipe_patroli === 'MARINE').length, darat = a.pat.filter(p => p.tipe_patroli === 'GROUND').length;
      const tipe = laut && !darat && laut === a.pat.length ? ' laut' : darat && !laut && darat === a.pat.length ? ' darat'
        : laut || darat ? ` (${[laut && `${laut} laut`, darat && `${darat} darat`].filter(Boolean).join(', ')})` : '';
      let s = `Selama ${per}, ${timTeks} melakukan **${fmt(a.pat.length)} patroli${tipe.startsWith(' (') ? '' : tipe}**${tipe.startsWith(' (') ? tipe : ''} sepanjang **${d1(a.km)} km**.`;
      if (b && b.km > 0) s += ` Jarak patroli ${arah(a.km, b.km)} ${labelPeriode(fb)} (${d1(b.km)} km).`;
      else if (b && fb.sampai >= Math.min(...patroli.map(p => p.tahun))) s += ` Tidak ada data patroli pada ${labelPeriode(fb)} sebagai pembanding.`;
      out.push(s);
      const c = a.cak;
      if (c?.kunj.length) {
        const utama = [...c.kunj].sort((x, y) => y.km - x.km), n4 = utama.slice(0, 4), kmTot = c.kunj.reduce((t, s) => t + s.km, 0);
        let t = `Patroli menjangkau **${c.kunj.length} dari ${c.sel.length} sel grid** 5×5 km (**${d1(c.persen)}%** luas grid, ${d1(c.km2Kunj)} km²)`;
        t += n4.length < c.kunj.length ? `, dengan ${pct(n4.reduce((x, s) => x + s.km, 0), kmTot)}% jarak patroli terpusat di sel ${daftar(n4.map(s => s.kode))}.` : '.';
        if (b?.cak?.kunj.length) t += ` Cakupan ini ${arah(c.persen, b.cak.persen)} ${labelPeriode(fb)} (${d1(b.cak.persen)}%).`;
        out.push(t);
      }
    } else out.push(`Tidak ada data upaya (effort) patroli untuk ${per}${f.kawasan ? ` di ${f.kawasan}` : ''}.`);

    const N = a.temuan.length;
    if (!N) { out.push('Tidak ada temuan yang tercatat pada periode dan filter ini.'); return out; }
    const kat = hitung(a.temuan, r => r.kategori).map(([k, n]) => `${fmt(n)} ${kecil(k)}`);
    out.push(`Tercatat **${fmt(N)} temuan**, ${kat.length === 1 ? `seluruhnya ${kecil(a.temuan[0].kategori)}` : `terdiri dari ${daftar(kat)}`}.` +
      (b && b.temuan.length ? ` Jumlah temuan ${arah(N, b.temuan.length)} ${labelPeriode(fb)} (${fmt(b.temuan.length)}).` : ''));

    const akt = hitung(a.temuan.filter(r => r.kategori === 'Aktivitas Manusia'), r => r.jenis_observasi || r.subkategori);
    if (akt.length) out.push(`Aktivitas manusia yang paling sering dijumpai adalah **${kecil(akt[0][0])} (${akt[0][1]})**` +
      (akt.length > 1 ? `, disusul ${daftar(akt.slice(1, 3).map(([k, n]) => `${kecil(k)} (${n})`))}.` : '.'));

    const nL = a.temuan.filter(r => r.pelanggaran === true).length;
    if (nL) out.push(`Sebanyak **${fmt(nL)} temuan** dicatat sebagai pelanggaran (${pct(nL, N)}% dari seluruh temuan).`);
    else if (a.temuan.some(r => r.pelanggaran === false)) out.push('Tidak ada temuan yang dicatat sebagai pelanggaran.');

    if (a.er != null && a.nUnik) {
      let s = `Encounter rate tercatat **${d2(a.er)} temuan unik per km** (satu temuan setiap ${d1(a.km / a.nUnik)} km).`;
      if (b?.er) s += ` Angka ini ${arah(a.er, b.er)} ${labelPeriode(fb)} (${d2(b.er)} per km).`;
      if (a.km < 5) s += ' Upaya patroli masih rendah (< 5 km), jadi angka ini belum stabil.';
      out.push(s);
    }

    const zon = hitung(a.temuan, r => r.zonasi_kawasan), nZon = zon.reduce((s, z) => s + z[1], 0);
    if (zon.length) out.push(`Berdasarkan catatan tim, temuan paling banyak berada di **Zona ${zon[0][0]}** (${pct(zon[0][1], nZon)}% dari ${fmt(nZon)} temuan yang mencatat zonasi).`);

    const perlu = a.temuan.filter(r => r.perlu_tindak_lanjut === true);
    if (perlu.length) {
      const st = s => perlu.filter(r => r.status_tindak_lanjut === s).length, belum = perlu.filter(r => !r.status_tindak_lanjut).length;
      const bagian = [[st('Terselesaikan'), 'sudah terselesaikan'], [st('Masih proses'), 'masih proses'],
        [st('Lainnya'), 'dengan tindak lanjut lain'], [belum, 'belum memiliki status']].filter(([n]) => n);
      const isi = bagian.length === 1 ? `semuanya ${bagian[0][1]}` : daftar(bagian.map(([n, t]) => `${n} ${t}`));
      out.push(`Dari **${fmt(perlu.length)} temuan yang perlu tindak lanjut**, ${isi}.`);
    }

    const kapal = a.temuan.filter(r => r.kapal?.gt || r.kapal?.jenis);
    if (kapal.length) {
      const gt = hitung(kapal, r => r.kapal.gt)[0], keg = hitung(kapal, r => r.kapal.kegiatan)[0];
      out.push(`Tim mencatat **${fmt(kapal.length)} kapal**` + (gt ? `; sebagian besar berukuran ${gt[0]} (${gt[1]})` : '') +
        (keg ? ` dengan kegiatan utama ${kecil(keg[0])} (${keg[1]})` : '') + '.');
    }

    const satwa = hitung(a.temuan, r => r.spesies_satwa && r.spesies_satwa.split(' - ')[0]);
    if (satwa.length) out.push(`Satwa yang dijumpai: ${daftar(satwa.slice(0, 5).map(([k, n]) => `${k} (${n})`))}.`);
    return out;
  }

  // ---------- gambar ----------
  const kePng = c => new Promise((ok, gagal) => c.toBlob(b => b ? b.arrayBuffer().then(x => ok(new Uint8Array(x))) : gagal(new Error('Gagal membuat gambar')), 'image/png'));
  const latarPutih = { id: 'latarPutih', beforeDraw: c => { const g = c.ctx; g.save(); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.restore(); } };
  async function grafik(type, labels, datasets, opsi = {}, w = 1000, h = 460) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ukuranLama = Chart.defaults.font.size; Chart.defaults.font.size = 18;
    try {
      const ch = new Chart(c, { type, data: { labels, datasets }, plugins: [latarPutih],
        options: { responsive: false, animation: false, devicePixelRatio: 1, locale: 'id-ID', layout: { padding: { left: 24, right: 24, top: 10 } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#dcece5' } } }, ...opsi } });
      const data = await kePng(c); ch.destroy();
      return { data, w, h };
    } finally { Chart.defaults.font.size = ukuranLama; }
  }
  const hz = { indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: '#dcece5' } }, y: { grid: { display: false } } } };
  const legendaBawah = { legend: { display: true, position: 'bottom', labels: { boxWidth: 14 } } };

  // Peta: citra Esri (CORS diizinkan) + zonasi + jalur + titik temuan, proyeksi Web Mercator.
  // mode 'temuan': zonasi + jalur + titik; mode 'grid': sel grid diwarnai menurut km patroli (cakupan).
  async function peta(a, mode = 'temuan', W = 1600, H = 1150) {
    const pts = mode === 'grid' ? (a.cak ? a.cak.sel.flatMap(s => [[s.bb[0], s.bb[1]], [s.bb[2], s.bb[3]]]) : [])
      : [...a.temuan.map(r => [r.lon, r.lat]), ...a.pat.flatMap(titikJalur)];
    if (!pts.length) return null;
    const wx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
    const wy = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
    const lon = pts.map(p => p[0]), lat = pts.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...lon), Math.max(...lon), Math.max(...lat), Math.min(...lat)];
    let z = 17;
    const isi = mode === 'grid' ? 0.96 : 0.85; // grid: isi bingkai semaksimal mungkin
    while (z > 3 && ((wx(x1, z) - wx(x0, z)) > W * isi || (wy(y1, z) - wy(y0, z)) > H * isi)) z--;
    // Di atas citra gelap, sel dipatroli memakai tosca terang supaya kelas intensitas terbaca.
    const WARNA_SEL = '#4CC4BE', opSel = op => Math.round(Math.min(1, op + .2) * 255).toString(16).padStart(2, '0');
    const cx = (wx(x0, z) + wx(x1, z)) / 2, cy = (wy(y0, z) + wy(y1, z)) / 2;
    const ox = Math.round(cx - W / 2), oy = Math.round(cy - H / 2); // bulat: ubin tanpa garis sambungan
    const P = (lo, la) => [wx(lo, z) - ox, wy(la, z) - oy];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#DCEBE7'; g.fillRect(0, 0, W, H);

    // Ubin citra; yang gagal dimuat dibiarkan polos.
    const tugas = [];
    for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++)
      for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++)
        tugas.push(new Promise(ok => {
          const im = new Image(); im.crossOrigin = 'anonymous';
          const t = setTimeout(() => ok(false), 15000);
          im.onload = () => { clearTimeout(t); g.drawImage(im, tx * 256 - ox, ty * 256 - oy); ok(true); };
          im.onerror = () => { clearTimeout(t); ok(false); };
          im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
        }));
    const nUbin = (await Promise.all(tugas)).filter(Boolean).length;

    const garis = (cs, tutup) => { cs.forEach(([lo, la], i) => { const [x, y] = P(lo, la); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (tutup) g.closePath(); };
    if (mode === 'grid') {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const s of a.cak.sel) {
        const k = s.km > 0 && kelasGrid(s.km);
        g.beginPath(); poligon(s.geo).forEach(p => p.forEach(r => garis(r, true)));
        if (k) { g.fillStyle = WARNA_SEL + opSel(k[1]); g.fill('evenodd'); g.setLineDash([]); g.strokeStyle = '#fff'; g.lineWidth = 2; }
        else { g.setLineDash([8, 6]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; }
        g.stroke(); g.setLineDash([]);
        const [px, py] = P(s.pusat.lng, s.pusat.lat);
        g.font = 'bold 22px Nunito, Arial, sans-serif'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.55)';
        g.strokeText(s.kode, px, py - (k ? 11 : 0)); g.fillStyle = '#fff'; g.fillText(s.kode, px, py - (k ? 11 : 0));
        if (k) { g.font = '16px Nunito, Arial, sans-serif'; const t = `${Math.round(s.km)} km`; g.strokeText(t, px, py + 13); g.fillText(t, px, py + 13); }
      }
      g.textAlign = 'left';
    }
    // Zonasi
    if (mode === 'temuan') for (const f of lapisZona.toGeoJSON().features) {
      const w = WARNA_ZONA[f.properties.Zona] || TLGC.abu, geo = f.geometry;
      const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
      g.beginPath(); polys.forEach(p => p.forEach(r => garis(r, true)));
      g.fillStyle = w + '55'; g.fill('evenodd'); g.strokeStyle = w; g.lineWidth = 2; g.stroke();
    }
    // Jalur
    const segmen = p => !p.jalur ? [] : p.jalur.type === 'MultiLineString' ? p.jalur.coordinates : [p.jalur.coordinates];
    if (mode === 'temuan') for (const [warna, lebar] of [['rgba(255,255,255,.75)', 5], ['#1E6FB8', 2.5]]) {
      g.strokeStyle = warna; g.lineWidth = lebar; g.lineJoin = 'round';
      for (const p of a.pat) for (const s of segmen(p)) { g.beginPath(); garis(s); g.stroke(); }
    }
    // Temuan
    if (mode === 'temuan') for (const r of a.temuan) {
      const [x, y] = P(r.lon, r.lat);
      g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI);
      g.fillStyle = WARNA_KAT[r.kategori] || TLGC.abu; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
      if (r.pelanggaran) { g.beginPath(); g.arc(x, y, 13, 0, 2 * Math.PI); g.lineWidth = 3.5; g.strokeStyle = TLGC.kuning; g.stroke(); }
    }
    // Legenda
    const kats = unik(a.temuan.map(r => r.kategori)), zonas = Object.keys(WARNA_ZONA);
    const baris = mode === 'grid'
      ? [...KELAS_GRID.map(([, op, t]) => ['kotak', WARNA_SEL, `Dipatroli ${t}`, Math.min(1, op + .2)]), ['putus', '#557069', 'Belum dikunjungi']]
      : [...kats.map(k => ['titik', WARNA_KAT[k] || TLGC.abu, k]), ['ring', TLGC.kuning, 'Pelanggaran'],
        ['garis', '#1E6FB8', 'Jalur patroli'], ...zonas.map(k => ['kotak', WARNA_ZONA[k], `Zona ${k}`])];
    const lh = 30, bw = 300, bh = baris.length * lh + 20;
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(16, H - bh - 16, bw, bh);
    g.font = '19px Nunito, Arial, sans-serif'; g.textBaseline = 'middle';
    baris.forEach(([jenis, w, teks, op], i) => {
      const y = H - bh - 6 + lh * i + lh / 2, x = 34;
      g.beginPath();
      if (jenis === 'titik') { g.arc(x, y, 8, 0, 2 * Math.PI); g.fillStyle = w; g.fill(); }
      else if (jenis === 'putus') { g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeStyle = w; g.strokeRect(x - 10, y - 8, 20, 16); g.setLineDash([]); }
      else if (op) { g.fillStyle = w + Math.round(op * 255).toString(16).padStart(2, '0'); g.fillRect(x - 10, y - 8, 20, 16); g.lineWidth = 1.5; g.strokeStyle = w; g.strokeRect(x - 10, y - 8, 20, 16); }
      else if (jenis === 'ring') { g.arc(x, y, 8, 0, 2 * Math.PI); g.lineWidth = 3; g.strokeStyle = w; g.stroke(); }
      else if (jenis === 'garis') { g.moveTo(x - 11, y); g.lineTo(x + 11, y); g.lineWidth = 4; g.strokeStyle = w; g.stroke(); }
      else { g.fillStyle = w + '66'; g.fillRect(x - 10, y - 8, 20, 16); g.lineWidth = 2; g.strokeStyle = w; g.strokeRect(x - 10, y - 8, 20, 16); }
      g.fillStyle = '#12302B'; g.fillText(teks, x + 22, y);
    });
    // Skala
    const latT = (y0 + y1) / 2, mPerPx = 156543.03392 * Math.cos(latT * Math.PI / 180) / 2 ** z;
    const target = mPerPx * 260, langkah = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const m = langkah.reduce((b, v) => v <= target ? v : b, langkah[0]), px = m / mPerPx;
    const sx = W - px - 40, sy = H - 50;
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(sx - 14, sy - 34, px + 28, 54);
    g.fillStyle = '#12302B'; g.fillRect(sx, sy, px, 6);
    g.textAlign = 'center'; g.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, sx + px / 2, sy - 16);
    // Utara
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(W - 50, 56, 34, 0, 2 * Math.PI); g.fill();
    g.fillStyle = '#12302B'; g.beginPath(); g.moveTo(W - 50, 30); g.lineTo(W - 62, 66); g.lineTo(W - 50, 58); g.lineTo(W - 38, 66); g.closePath(); g.fill();
    g.font = 'bold 18px Nunito, Arial, sans-serif'; g.fillText('U', W - 50, 80);
    g.textAlign = 'right'; g.font = '15px Nunito, Arial, sans-serif'; g.fillStyle = '#fff';
    g.fillText(nUbin ? 'Citra: Esri World Imagery' : 'Peta dasar tidak tersedia', W - 12, H - 10);
    return { data: await kePng(c), w: W, h: H };
  }

  // ---------- dokumen ----------
  async function buat({ internal = false } = {}) {
    await muatDocx();
    const D = window.docx;
    const f = filter(), a = pilih(f), fb = periodeSebelum(f), b = fb && pilih(fb);
    const per = labelPeriode(f);

    // Data privat hanya untuk admin; diambil langsung dari database dengan sesi login.
    let privT = {}, privP = {};
    if (internal) ({ temuan: privT, patroli: privP } = await Kelola.dataPrivat(a.temuan.map(r => r.id), a.pat.map(p => p.id)));

    const WARNA = { judul: '0B6B60', kepala: '0F8577', garis: 'D5EAE2', samar: '557069', merah: 'D9432E' };
    const FONT = 'Calibri';
    const runs = (teks, o = {}) => String(teks).split('**').map((s, i) => new D.TextRun({ text: s, bold: i % 2 === 1 || o.bold, size: o.size, color: o.color, italics: o.italics, font: FONT }));
    const para = (teks, o = {}) => new D.Paragraph({ children: runs(teks, o), spacing: { after: o.after ?? 120, line: 300 }, alignment: o.align });
    const judul = (teks, lv = 1) => new D.Paragraph({ heading: lv === 1 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2,
      children: [new D.TextRun({ text: teks, bold: true, color: WARNA.judul, size: lv === 1 ? 30 : 24, font: FONT })], spacing: { before: 280, after: 120 } });
    const gambar = (img, lebar = 620) => img && new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 120 },
      children: [new D.ImageRun({ data: img.data, transformation: { width: lebar, height: Math.round(lebar * img.h / img.w) } })] });
    const ket = teks => para(teks, { size: 18, color: WARNA.samar, italics: true, align: D.AlignmentType.CENTER });
    const sel = (teks, o = {}) => new D.TableCell({
      children: [new D.Paragraph({ children: runs(teks ?? '–', { size: o.size ?? 18, bold: o.bold, color: o.color }), alignment: o.align })],
      shading: o.isi ? { type: D.ShadingType.CLEAR, color: 'auto', fill: o.isi } : undefined,
      margins: { top: 50, bottom: 50, left: 80, right: 80 }, verticalAlign: D.VerticalAlign.CENTER });
    const batas = { style: D.BorderStyle.SINGLE, size: 4, color: WARNA.garis };
    const tabel = (kepala, baris, kanan = []) => new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      borders: { top: batas, bottom: batas, left: batas, right: batas, insideHorizontal: batas, insideVertical: batas },
      rows: [new D.TableRow({ tableHeader: true, children: kepala.map(k => sel(k, { bold: true, color: 'FFFFFF', isi: WARNA.kepala })) }),
        ...baris.map((r, i) => new D.TableRow({ children: r.map((v, j) => sel(v == null || v === '' ? '–' : String(v),
          { isi: i % 2 ? 'F2FAF6' : undefined, align: kanan.includes(j) ? D.AlignmentType.RIGHT : undefined })) }))]
    });
    const kotakAngka = isi => new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      borders: { top: batas, bottom: batas, left: batas, right: batas, insideHorizontal: batas, insideVertical: batas },
      rows: [new D.TableRow({ children: isi.map(([n, l]) => new D.TableCell({
        shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F2FAF6' }, margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: n, bold: true, size: 30, color: WARNA.judul, font: FONT })] }),
          new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: l, size: 16, color: WARNA.samar, font: FONT })] })] })) })]
    });
    let noGb = 0;
    const gb = teks => ket(`Gambar ${++noGb}. ${teks}`);
    const jarak = () => new D.Paragraph({ text: '', spacing: { after: 80 } });

    const isi = [];
    const N = a.temuan.length, nL = a.temuan.filter(r => r.pelanggaran === true).length;

    // Sampul
    const logo = await fetch('assets/logo-tlgc.png').then(r => r.arrayBuffer()).then(x => new Uint8Array(x)).catch(() => null);
    const filterTeks = [f.kawasan && `Kawasan: ${f.kawasan}`, f.tim && `Tim: ${f.tim}`, f.kat && `Kategori: ${f.kat}`, f.sub && `Jenis: ${f.sub}`, f.langgar && 'Hanya pelanggaran'].filter(Boolean);
    isi.push(new D.Paragraph({ text: '', spacing: { before: 1600 } }));
    if (logo) isi.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.ImageRun({ data: logo, transformation: { width: 150, height: 165 } })] }));
    isi.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 300, after: 120 }, children: [new D.TextRun({ text: 'LAPORAN PATROLI SMART', bold: true, size: 44, color: WARNA.judul, font: FONT })] }),
      para('Toli Toli Labengki Giant Clam Conservation (TLGC)', { align: D.AlignmentType.CENTER, size: 26, color: WARNA.samar }),
      para(`Periode: **${per}**`, { align: D.AlignmentType.CENTER, size: 26, after: 60 }),
      para(filterTeks.length ? filterTeks.join(' · ') : 'Semua kawasan, tim, dan kategori', { align: D.AlignmentType.CENTER, size: 20, color: WARNA.samar }),
      para(`Dibuat ${tgl(new Date().toISOString().slice(0, 10))} dari Smart Patrol TLGC`, { align: D.AlignmentType.CENTER, size: 20, color: WARNA.samar }));
    if (internal) isi.push(para('**DOKUMEN INTERNAL** – memuat nama pelaku dan data kapal. Tidak untuk disebarkan.', { align: D.AlignmentType.CENTER, color: WARNA.merah, size: 22 }));
    isi.push(new D.Paragraph({ children: [new D.PageBreak()] }));

    // 1. Ringkasan
    isi.push(judul('1. Ringkasan'));
    narasi(f, a, b, fb).forEach(s => isi.push(para(s)));
    isi.push(jarak(), kotakAngka([[fmt(N), 'temuan'], [fmt(nL), 'pelanggaran'], [fmt(a.pat.length), 'patroli'],
      [d1(a.km), 'km patroli'], [a.er == null ? '–' : d2(a.er), 'temuan unik / km']]));

    // 2. Upaya patroli
    if (a.pat.length) {
      isi.push(judul('2. Upaya patroli'));
      const perBln = new Map();
      for (const p of a.pat) {
        const k = p.mulai.slice(0, 7), e = perBln.get(k) ?? perBln.set(k, { n: 0, laut: 0, darat: 0, km: 0, unik: 0 }).get(k);
        e.n++; e.km += p.km;
        if (p.tipe_patroli === 'MARINE') e.laut++; else if (p.tipe_patroli === 'GROUND') e.darat++;
      }
      for (const [t, s] of a.unikPer) { const e = perBln.get(t.slice(0, 7)); if (e) e.unik += s.size; }
      const bln = [...perBln.keys()].sort();
      isi.push(tabel(['Bulan', 'Patroli', 'Laut', 'Darat', 'Km', 'Temuan unik', 'Per km'],
        bln.map(k => { const e = perBln.get(k); return [labelBulan(k), e.n, e.laut, e.darat, d1(e.km), e.unik, e.km > 0 ? d2(e.unik / e.km) : '–']; }),
        [1, 2, 3, 4, 5, 6]));
      if (bln.length >= 2) {
        isi.push(jarak(), gambar(await grafik('line', bln.map(labelBulan), [{ data: bln.map(k => { const e = perBln.get(k); return e.km > 0 ? +(e.unik / e.km).toFixed(3) : null; }),
          borderColor: TLGC.koral, backgroundColor: TLGC.koral, borderWidth: 3, pointRadius: 5, tension: .25 }],
          { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'temuan unik / km' } } } })),
        gb('Tren encounter rate per bulan (temuan unik ÷ km patroli).'));
      }
      // Cakupan grid: tiap sel dihitung sekali; km, patroli, dan bulan = intensitas.
      const c = a.cak;
      if (c) {
        const imgGrid = await peta(a, 'grid');
        const urut = [...c.kunj].sort((x, y) => y.km - x.km), belum = c.sel.filter(s => !(s.km > 0)).map(s => s.kode);
        isi.push(judul('Cakupan grid patroli', 2),
          para(`Patroli menjangkau **${c.kunj.length} dari ${c.sel.length} sel** grid 5×5 km, atau **${d1(c.persen)}%** luas grid (${d1(c.km2Kunj)} dari ${d1(c.km2)} km²). ` +
            'Sel dihitung terjangkau bila dilewati jalur patroli, dan hanya dihitung sekali walau dipatroli berulang.'),
          gambar(imgGrid, 600), gb(`Cakupan grid patroli menurut km jalur per sel, ${per}.`));
        if (urut.length) isi.push(tabel(['Sel', 'Km jalur', 'Patroli', 'Bulan dikunjungi', 'Temuan'],
          urut.map(s => [s.kode, d1(s.km), s.patroli.size, s.bulan.size, s.temuan]), [1, 2, 3, 4]));
        if (belum.length) isi.push(jarak(), para(`Sel yang belum dikunjungi (${belum.length}): ${belum.join(', ')}.`));
      }
    }

    // 3. Peta
    const imgPeta = await peta(a);
    if (imgPeta) isi.push(judul('3. Peta patroli dan temuan'), gambar(imgPeta, 640),
      gb(`Jalur patroli (${fmt(a.pat.length)}) dan titik temuan (${fmt(N)}) di atas zonasi TLGC, ${per}.`));

    // 4. Temuan
    if (N) {
      isi.push(judul('4. Temuan'));
      const kat = hitung(a.temuan, r => r.kategori);
      isi.push(gambar(await grafik('bar', kat.map(k => k[0]), [{ data: kat.map(k => k[1]), backgroundColor: kat.map(k => WARNA_KAT[k[0]] || TLGC.abu), borderRadius: 4 }], hz, 1000, 120 + kat.length * 50)),
        gb('Jumlah temuan per kategori.'));
      const akt = a.temuan.filter(r => r.kategori === 'Aktivitas Manusia');
      if (akt.length) {
        const grup = hitung(akt, r => `${r.waktu.slice(0, 7)}|${r.subkategori || '-'}|${r.jenis_observasi || '-'}`)
          .sort((x, y) => y[0].localeCompare(x[0]));
        isi.push(judul('Aktivitas manusia per bulan', 2), tabel(['Bulan', 'Jenis', 'Detail', 'Jumlah'],
          grup.map(([k, n]) => { const [bl, s, j] = k.split('|'); return [labelBulan(bl), s, j, n]; }), [3]));
        const alat = hitung(akt.filter(r => r.subkategori === 'Penangkapan Ikan'), r => r.jenis_observasi).slice(0, 12);
        if (alat.length) isi.push(jarak(), gambar(await grafik('bar', alat.map(x => x[0]), [{ data: alat.map(x => x[1]), backgroundColor: TLGC.jingga, borderRadius: 4 }], hz, 1000, 120 + alat.length * 45)),
          gb('Alat tangkap yang dijumpai.'));
      }
    }

    // 5. Pelanggaran & tindak lanjut
    const langgar = a.temuan.filter(r => r.pelanggaran === true), perlu = a.temuan.filter(r => r.perlu_tindak_lanjut === true);
    if (langgar.length || perlu.length) {
      isi.push(judul('5. Pelanggaran dan tindak lanjut'));
      if (perlu.length) {
        const st = s => perlu.filter(r => r.status_tindak_lanjut === s).length;
        isi.push(kotakAngka([[fmt(perlu.length), 'perlu tindak lanjut'], [fmt(st('Terselesaikan')), 'terselesaikan'],
          [fmt(st('Masih proses')), 'masih proses'], [fmt(perlu.filter(r => !r.status_tindak_lanjut).length), 'belum ada status']]), jarak());
      }
      const daftarTL = [...new Map([...langgar, ...perlu].map(r => [r.id, r])).values()].sort((x, y) => x.waktu.localeCompare(y.waktu));
      const kepala = ['Tanggal', 'Jenis', 'Zonasi', 'Pelanggaran', 'Tindakan', 'Tindak lanjut', ...(internal ? ['Pelaku', 'Keterangan'] : [])];
      isi.push(tabel(kepala, daftarTL.map(r => [tgl(r.waktu), [r.subkategori, r.jenis_observasi].filter(Boolean).join(' – '), r.zonasi_kawasan,
        r.pelanggaran == null ? '' : r.pelanggaran ? 'Ya' : 'Bukan', r.tindakan,
        r.perlu_tindak_lanjut ? [r.status_tindak_lanjut || 'Belum ada status', r.tgl_tindak_lanjut && tgl(r.tgl_tindak_lanjut)].filter(Boolean).join(', ') : 'Tidak perlu',
        ...(internal ? [privT[r.id]?.nama, privT[r.id]?.info_lain] : [])])));
    }

    // 6. Kapal
    const kapal = a.temuan.filter(r => r.kapal?.gt || r.kapal?.jenis);
    if (kapal.length) {
      isi.push(judul('6. Kapal yang dijumpai'));
      const URUT_GT = ['< 5 GT', '5–10 GT', '10–30 GT'];
      const gt = unik(kapal.map(r => r.kapal.gt || '(tidak dicatat)')).sort((x, y) => (URUT_GT.indexOf(x) + 1 || 99) - (URUT_GT.indexOf(y) + 1 || 99));
      const keg = unik(kapal.map(r => r.kapal.kegiatan || '(tidak dicatat)'));
      isi.push(gambar(await grafik('bar', gt, keg.map((k, i) => ({ label: k, backgroundColor: [TLGC.laut, TLGC.jingga, TLGC.koral, TLGC.tosca, TLGC.abu][i % 5], borderRadius: 4,
        data: gt.map(x => kapal.filter(r => (r.kapal.gt || '(tidak dicatat)') === x && (r.kapal.kegiatan || '(tidak dicatat)') === k).length) })),
        { plugins: legendaBawah, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } })),
        gb('Kapal menurut ukuran (GT) dan kegiatan.'),
        tabel(['Tanggal', 'Jenis kapal', 'GT', 'Kegiatan', 'Hasil tangkapan', 'Awak', 'Asal', ...(internal ? ['Nama kapal', 'Nakhoda'] : [])],
          kapal.sort((x, y) => x.waktu.localeCompare(y.waktu)).map(r => [tgl(r.waktu), r.kapal.jenis, r.kapal.gt, r.kapal.kegiatan,
            [r.kapal.hasil_tangkapan, r.kapal.berat_tangkapan].filter(Boolean).join(', '), r.kapal.awak, r.kapal.asal,
            ...(internal ? [privT[r.id]?.nama_kapal, privT[r.id]?.nakhoda] : [])])));
    }

    // 7. Satwa & habitat
    const satwa = hitung(a.temuan, r => r.spesies_satwa && r.spesies_satwa.split(' - ')[0]).slice(0, 12);
    const hab = await fetch('data/habitat-per-zona.json').then(r => r.json()).catch(() => null);
    if (satwa.length || hab) {
      isi.push(judul('7. Satwa dan habitat'));
      if (satwa.length) isi.push(gambar(await grafik('bar', satwa.map(s => s[0]), [{ data: satwa.map(s => s[1]), backgroundColor: TLGC.laut, borderRadius: 4 }], hz, 1000, 120 + satwa.length * 45)),
        gb('Satwa yang dijumpai.'));
      if (hab) {
        const zona = Object.keys(hab.zona).filter(z => z !== 'Di luar zona');
        isi.push(para('Sebagai konteks, luas habitat bentik di tiap zona TLGC menurut Allen Coral Atlas (citra satelit 2020):'),
          gambar(await grafik('bar', zona, Object.keys(WARNA_HABITAT).map(k => ({ label: k, data: zona.map(z => hab.zona[z][k] || 0), backgroundColor: WARNA_HABITAT[k] })),
            { indexAxis: 'y', plugins: legendaBawah, scales: { x: { stacked: true, beginAtZero: true, title: { display: true, text: 'hektar' } }, y: { stacked: true, grid: { display: false } } } }, 1000, 520)),
          gb('Habitat bentik per zona (ha). Sumber: Allen Coral Atlas v2.0, CC-BY-4.0.'));
      }
    }

    // 8. Metode
    isi.push(judul('8. Catatan metode'),
      para('Data berasal dari patroli SMART tim TLGC yang diunggah ke Smart Patrol TLGC. Laporan ini mengikuti filter yang dipilih saat laporan dibuat; temuan yang disembunyikan atau ada di Sampah tidak ikut.'),
      para('**Encounter rate** = jumlah temuan unik ÷ km patroli. Temuan unik dihitung sekali per titik (waypoint), kategori, dan jenis dalam satu hari patroli. Hanya temuan yang terhubung ke data patroli yang ikut dihitung. Upaya di bawah 5 km membuat angka ini belum stabil.'),
      para('**Cakupan grid** = luas sel grid 5×5 km yang dilewati jalur patroli ÷ luas seluruh grid. Jalur dipecah tiap ±25 m dan tiap potongan masuk ke sel tempat titik tengahnya berada. Sel yang dipatroli berulang tetap dihitung sekali; km jalur, jumlah patroli, dan jumlah bulan per sel menunjukkan intensitas.'),
      para(fb ? `Pembanding pada ringkasan adalah ${labelPeriode(fb)}, periode dengan panjang yang sama tepat sebelum periode laporan.` : 'Ringkasan tidak memakai pembanding karena periode mencakup bulan yang sama di beberapa tahun.'),
      para('Zonasi pada tabel adalah catatan tim di lapangan, bukan hasil tumpang susun peta. Habitat bentik dari Allen Coral Atlas (2020) menunjukkan sebaran habitat, bukan tutupan karang hidup.'));

    // Lampiran
    if (N) {
      const MAKS = 500, urut = [...a.temuan].sort((x, y) => x.waktu.localeCompare(y.waktu));
      isi.push(new D.Paragraph({ children: [new D.PageBreak()] }), judul('Lampiran. Daftar temuan'),
        tabel(['No', 'Tanggal', 'Kategori', 'Jenis', 'Zonasi', 'Koordinat', ...(internal ? ['Keterangan'] : [])],
          urut.slice(0, MAKS).map((r, i) => [i + 1, tgl(r.waktu), r.kategori, [r.subkategori, r.spesies_satwa || r.jenis_observasi].filter(Boolean).join(' – '),
            r.zonasi_kawasan, `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`, ...(internal ? [privT[r.id]?.info_lain] : [])]), [0]));
      if (N > MAKS) isi.push(para(`… dan ${fmt(N - MAKS)} temuan lain. Persempit filter untuk daftar lengkap.`, { italics: true, color: WARNA.samar }));
    }

    const kop = new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [
      new D.TextRun({ text: `Laporan Patroli SMART TLGC · ${per}`, size: 16, color: WARNA.samar, font: FONT }),
      ...(internal ? [new D.TextRun({ text: '   INTERNAL – tidak untuk disebarkan', size: 16, bold: true, color: WARNA.merah, font: FONT })] : [])] })] });
    const kaki = new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER,
      children: [new D.TextRun({ children: ['Halaman ', D.PageNumber.CURRENT, ' dari ', D.PageNumber.TOTAL_PAGES], size: 16, color: WARNA.samar, font: FONT })] })] });
    const doc = new D.Document({
      creator: 'Smart Patrol TLGC', title: `Laporan Patroli SMART TLGC ${per}`,
      styles: { default: { document: { run: { font: FONT, size: 21 } } } },
      sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, titlePage: true },
        headers: { default: kop, first: new D.Header({ children: [] }) }, footers: { default: kaki, first: new D.Footer({ children: [] }) }, children: isi.filter(Boolean) }]
    });
    const blob = await D.Packer.toBlob(doc);
    const nama = `Laporan-Patroli-TLGC_${per.replace(/[^\w–-]+/g, '-')}${internal ? '_INTERNAL' : ''}.docx`;
    const url = URL.createObjectURL(blob), el = Object.assign(document.createElement('a'), { href: url, download: nama });
    document.body.append(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return nama;
  }

  return { buat, narasi, pilih, periodeSebelum, labelPeriode, peta };
})();
