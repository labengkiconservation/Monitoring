// Habitat bentik TLGC dari Allen Coral Atlas v2.0 (citra satelit 5 m) -> Shapefile di Google Drive.
// Cara pakai: tempel di https://code.earthengine.google.com, klik Run, lalu buka tab Tasks
// dan klik RUN pada ekspor "TLGC_habitat_ACA". Hasilnya masuk ke folder Google Drive "TLGC".
// Sumber data: Allen Coral Atlas (2020), CC-BY-4.0, doi:10.5281/zenodo.3833242.

// Area kerja: mencakup zonasi & grid patroli TLGC (Kepulauan Labengki, Konawe Utara) + sedikit tepi.
var aoi = ee.Geometry.Rectangle([122.24, -3.76, 122.58, -3.37]);
var habitat = ee.Image('ACA/reef_habitat/v2_0').select('benthic').clip(aoi);

// Kelas habitat bentik resmi ACA v2.0: nilai piksel -> [nama kelas ACA, warna resmi]. 0 = Unmapped dibuang.
var KELAS = {
  '11': ['Sand', '#ffffbe'],
  '12': ['Rubble', '#e0d05e'],
  '13': ['Rock', '#b19c3a'],
  '14': ['Seagrass', '#668438'],
  '15': ['Coral/Algae', '#ff6161'],
  '18': ['Microalgal Mats', '#9bcc4f']
};

// Raster -> poligon per kelas pada grid asli ACA (5 m). Atribut: kode, kelas, warna, luas_ha.
var k = ee.Dictionary(KELAS);
var poligon = habitat.selfMask().toInt().reduceToVectors({
  geometry: aoi, scale: 5, geometryType: 'polygon', eightConnected: false,
  labelProperty: 'kode', maxPixels: 1e13, tileScale: 4
}).map(function (f) {
  var info = ee.List(k.get(ee.Number(f.get('kode')).format('%d')));
  return f.set({ kelas: info.get(0), warna: info.get(1), luas_ha: f.geometry().area(1).divide(1e4) });
});

// Pratinjau di peta Code Editor.
var palet = [];
for (var v = 0; v <= 18; v++) palet.push(KELAS[String(v)] ? KELAS[String(v)][1].slice(1) : '000000');
Map.centerObject(aoi, 11);
Map.addLayer(habitat.selfMask(), { min: 0, max: 18, palette: palet }, 'Habitat bentik (ACA)');
Map.addLayer(aoi, { color: 'red' }, 'Area kerja TLGC', false);

// Ekspor ke Google Drive (folder "TLGC") sebagai Shapefile.
Export.table.toDrive({ collection: poligon, description: 'TLGC_habitat_ACA', folder: 'TLGC',
  fileNamePrefix: 'TLGC_habitat_ACA', fileFormat: 'SHP' });
