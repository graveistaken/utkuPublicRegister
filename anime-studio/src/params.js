// Character parameter schema. `r` = what needs refreshing when it changes:
//  'mesh' -> geometry rebuild (worker), 'face' -> face texture redraw, 'mat' -> material only, 'pose', 'view'

export const TABS = [
  { id: 'body', label: 'Vücut', icon: '🧍' },
  { id: 'face', label: 'Yüz', icon: '🙂' },
  { id: 'eyes', label: 'Gözler', icon: '👁️' },
  { id: 'hair', label: 'Saç', icon: '💇' },
  { id: 'outfit', label: 'Kıyafet', icon: '👕' },
  { id: 'acc', label: 'Aksesuar', icon: '🎀' },
  { id: 'render', label: 'Görünüm', icon: '🎨' },
  { id: 'export', label: 'Dışa Aktar', icon: '📦' },
];

const R = (tab, section, key, label, min, max, step, def, r = 'mesh', extra = {}) => ({ type: 'range', tab, section, key, label, min, max, step, def, r, ...extra });
const C = (tab, section, key, label, def, r = 'mat', extra = {}) => ({ type: 'color', tab, section, key, label, def, r, ...extra });
const S = (tab, section, key, label, options, def, r = 'mesh', extra = {}) => ({ type: 'select', tab, section, key, label, options, def, r, ...extra });
const T = (tab, section, key, label, def, r = 'mesh', extra = {}) => ({ type: 'toggle', tab, section, key, label, def, r, ...extra });

export const SCHEMA = [
  // ---------------- BODY ----------------
  R('body', 'Genel', 'height', 'Boy (cm)', 120, 200, 1, 160),
  R('body', 'Genel', 'headsTall', 'Vücut / kafa oranı', 4.5, 8.5, 0.05, 6.4),
  R('body', 'Genel', 'gender', 'Kadınsı ⟷ Erkeksi', 0, 1, 0.01, 0.0),
  R('body', 'Genel', 'muscle', 'Kaslılık', 0, 1, 0.01, 0.15),
  R('body', 'Genel', 'weight', 'Kilo / dolgunluk', 0, 1, 0.01, 0.35),
  C('body', 'Genel', 'skin', 'Ten rengi', '#ffe4d6', 'mat'),
  C('body', 'Genel', 'skinShade', 'Ten gölge rengi', '#f2a7a0', 'mat'),

  R('body', 'Gövde', 'shoulders', 'Omuz genişliği', 0.7, 1.4, 0.01, 1.0),
  R('body', 'Gövde', 'chest', 'Göğüs kafesi', 0.7, 1.4, 0.01, 1.0),
  R('body', 'Gövde', 'bust', 'Göğüs', 0, 1.6, 0.01, 0.75),
  R('body', 'Gövde', 'waist', 'Bel', 0.6, 1.4, 0.01, 0.95),
  R('body', 'Gövde', 'hips', 'Kalça', 0.7, 1.5, 0.01, 1.05),
  R('body', 'Gövde', 'torsoLen', 'Gövde uzunluğu', 0.85, 1.15, 0.01, 1.0),
  R('body', 'Gövde', 'neckLen', 'Boyun uzunluğu', 0.6, 1.6, 0.01, 1.0),
  R('body', 'Gövde', 'neckThick', 'Boyun kalınlığı', 0.7, 1.5, 0.01, 1.0),

  R('body', 'Kollar & Bacaklar', 'armLen', 'Kol uzunluğu', 0.8, 1.2, 0.01, 1.0),
  R('body', 'Kollar & Bacaklar', 'armThick', 'Kol kalınlığı', 0.7, 1.5, 0.01, 1.0),
  R('body', 'Kollar & Bacaklar', 'handSize', 'El boyutu', 0.75, 1.3, 0.01, 1.0),
  R('body', 'Kollar & Bacaklar', 'legLen', 'Bacak uzunluğu', 0.85, 1.2, 0.01, 1.04),
  R('body', 'Kollar & Bacaklar', 'thigh', 'Uyluk', 0.7, 1.5, 0.01, 1.05),
  R('body', 'Kollar & Bacaklar', 'calf', 'Baldır', 0.7, 1.5, 0.01, 1.0),
  R('body', 'Kollar & Bacaklar', 'footSize', 'Ayak boyutu', 0.75, 1.3, 0.01, 1.0),

  // ---------------- FACE ----------------
  R('face', 'Kafa şekli', 'headSize', 'Kafa büyüklüğü', 0.85, 1.2, 0.01, 1.0),
  R('face', 'Kafa şekli', 'faceWidth', 'Yüz genişliği', 0.8, 1.2, 0.01, 1.0),
  R('face', 'Kafa şekli', 'jaw', 'Çene genişliği', 0.6, 1.4, 0.01, 0.95),
  R('face', 'Kafa şekli', 'chinLen', 'Çene uzunluğu', 0.7, 1.4, 0.01, 1.0),
  R('face', 'Kafa şekli', 'chinPoint', 'Çene sivriliği', 0, 1, 0.01, 0.55),
  R('face', 'Kafa şekli', 'cheeks', 'Yanak dolgunluğu', 0, 1, 0.01, 0.45),
  R('face', 'Kafa şekli', 'faceFlat', 'Yüz düzlüğü (anime)', 0, 1, 0.01, 0.6),
  R('face', 'Burun & Kulak', 'noseSize', 'Burun boyutu', 0, 2, 0.01, 0.8),
  R('face', 'Burun & Kulak', 'noseHeight', 'Burun yüksekliği', -1, 1, 0.01, 0),
  S('face', 'Burun & Kulak', 'earType', 'Kulak tipi', [['human', 'İnsan'], ['elf', 'Elf (sivri)'], ['none', 'Gizli']], 'human'),
  R('face', 'Burun & Kulak', 'earSize', 'Kulak boyutu', 0.6, 1.6, 0.01, 1.0),
  S('face', 'Ağız', 'mouth', 'Ağız ifadesi', [
    ['smile', 'Gülümseme'], ['open', 'Açık gülüş'], ['neutral', 'Nötr'], ['cat', 'Kedi ağzı :3'],
    ['o', 'Şaşkın (o)'], ['smug', 'Kendinden emin'], ['pout', 'Somurtma'], ['fang', 'Diş (fang)'],
  ], 'smile', 'face'),
  R('face', 'Ağız', 'mouthWidth', 'Ağız genişliği', 0.5, 1.8, 0.01, 1.0, 'face'),
  R('face', 'Ağız', 'mouthY', 'Ağız yüksekliği', -1, 1, 0.01, 0, 'face'),
  C('face', 'Ağız', 'lipColor', 'Ağız iç rengi', '#c4505a', 'face'),
  R('face', 'Detaylar', 'blush', 'Allık', 0, 1, 0.01, 0.45, 'face'),
  C('face', 'Detaylar', 'blushColor', 'Allık rengi', '#ff8a9a', 'face'),
  T('face', 'Detaylar', 'blushLines', 'Utangaç çizgiler', true, 'face'),
  T('face', 'Detaylar', 'mole', 'Güzellik beni', false, 'face'),
  R('face', 'Detaylar', 'freckles', 'Çiller', 0, 1, 0.01, 0, 'face'),
  T('face', 'Detaylar', 'noseLine', 'Burun çizgisi', true, 'face'),

  // ---------------- EYES ----------------
  S('eyes', 'Göz şekli', 'eyeStyle', 'Göz stili', [
    ['round', 'Yuvarlak / sevimli'], ['sharp', 'Keskin (tsurime)'], ['droopy', 'Masum (tareme)'],
    ['sleepy', 'Uykulu'], ['cat', 'Kedi gözü'], ['shonen', 'Shōnen (erkek)'],
  ], 'round', 'face'),
  R('eyes', 'Göz şekli', 'eyeSize', 'Göz boyutu', 0.6, 1.5, 0.01, 1.0, 'face'),
  R('eyes', 'Göz şekli', 'eyeWidth', 'Göz genişliği', 0.7, 1.4, 0.01, 1.0, 'face'),
  R('eyes', 'Göz şekli', 'eyeHeight', 'Göz yüksekliği (açıklık)', 0.5, 1.4, 0.01, 1.0, 'face'),
  R('eyes', 'Göz şekli', 'eyeSpacing', 'Göz aralığı', 0.75, 1.3, 0.01, 1.0, 'face'),
  R('eyes', 'Göz şekli', 'eyeY', 'Göz konumu (dikey)', -1, 1, 0.01, 0, 'face'),
  R('eyes', 'Göz şekli', 'eyeTilt', 'Göz eğimi', -1, 1, 0.01, 0, 'face'),
  R('eyes', 'İris', 'irisSize', 'İris boyutu', 0.6, 1.3, 0.01, 1.0, 'face'),
  R('eyes', 'İris', 'pupilSize', 'Göz bebeği', 0, 1.5, 0.01, 0.8, 'face'),
  S('eyes', 'İris', 'pupilShape', 'Göz bebeği şekli', [['round', 'Yuvarlak'], ['slit', 'Kedi (dikey)'], ['star', 'Yıldız'], ['heart', 'Kalp'], ['none', 'Yok']], 'round', 'face'),
  C('eyes', 'İris', 'irisTop', 'İris üst rengi', '#2a3f8f', 'face'),
  C('eyes', 'İris', 'irisBottom', 'İris alt rengi', '#5fb6ff', 'face'),
  T('eyes', 'İris', 'hetero', 'Heterokromi (farklı renk)', false, 'face'),
  C('eyes', 'İris', 'irisTop2', 'Sol göz üst rengi', '#7a1f3d', 'face'),
  C('eyes', 'İris', 'irisBottom2', 'Sol göz alt rengi', '#ff7aa8', 'face'),
  R('eyes', 'İris', 'highlight', 'Parlama yoğunluğu', 0, 1, 0.01, 0.9, 'face'),
  S('eyes', 'İris', 'highlightStyle', 'Parlama stili', [['classic', 'Klasik'], ['sparkle', 'Pırıltılı'], ['soft', 'Yumuşak'], ['none', 'Mat']], 'classic', 'face'),
  C('eyes', 'Kirpik & Göz beyazı', 'sclera', 'Göz beyazı', '#ffffff', 'face'),
  R('eyes', 'Kirpik & Göz beyazı', 'lashThick', 'Kirpik kalınlığı', 0.3, 2, 0.01, 1.0, 'face'),
  R('eyes', 'Kirpik & Göz beyazı', 'lashWing', 'Dış kirpik uzantısı', 0, 1.5, 0.01, 0.7, 'face'),
  T('eyes', 'Kirpik & Göz beyazı', 'lowerLash', 'Alt kirpik', true, 'face'),
  C('eyes', 'Kirpik & Göz beyazı', 'lashColor', 'Kirpik rengi', '#2a1a22', 'face'),
  S('eyes', 'Kaşlar', 'browStyle', 'Kaş stili', [['soft', 'İnce'], ['straight', 'Düz'], ['angry', 'Kararlı'], ['worried', 'Endişeli'], ['thick', 'Kalın']], 'soft', 'face'),
  R('eyes', 'Kaşlar', 'browThick', 'Kaş kalınlığı', 0.4, 2, 0.01, 1.0, 'face'),
  R('eyes', 'Kaşlar', 'browY', 'Kaş yüksekliği', -1, 1, 0.01, 0, 'face'),
  R('eyes', 'Kaşlar', 'browAngle', 'Kaş açısı', -1, 1, 0.01, 0, 'face'),
  T('eyes', 'Kaşlar', 'browFromHair', 'Kaş rengi = saç rengi', true, 'face'),
  C('eyes', 'Kaşlar', 'browColor', 'Kaş rengi', '#5a3a30', 'face'),

  // ---------------- HAIR ----------------
  S('hair', 'Saç modeli', 'hairStyle', 'Hazır saç modeli', [
    ['custom', '— Özel —'], ['bob', 'Bob kesim'], ['long', 'Uzun düz'], ['twintails', 'İkiz kuyruk'], ['ponytail', 'At kuyruğu'],
    ['short', 'Kısa (erkek)'], ['spiky', 'Dikenli (shōnen)'], ['hime', 'Hime kesim'], ['bun', 'Topuz'], ['wolf', 'Kurt kesim'],
  ], 'bob', 'mesh', { preset: true }),
  S('hair', 'Perçem', 'bangs', 'Perçem stili', [['straight', 'Düz kesik'], ['swept', 'Yana taranmış'], ['split', 'Ortadan ayrık'], ['spiky', 'Dağınık'], ['none', 'Perçemsiz (alın açık)']], 'straight'),
  R('hair', 'Perçem', 'bangsLen', 'Perçem uzunluğu', 0.3, 1.4, 0.01, 0.9),
  R('hair', 'Perçem', 'bangsCount', 'Perçem tel sayısı', 4, 14, 1, 9),
  R('hair', 'Uzunluk', 'sideLen', 'Yan saç uzunluğu', 0, 1.6, 0.01, 0.55),
  R('hair', 'Uzunluk', 'backLen', 'Arka saç uzunluğu', 0, 2.2, 0.01, 0.28),
  R('hair', 'Uzunluk', 'volume', 'Hacim', 0.4, 1.8, 0.01, 1.0),
  R('hair', 'Uzunluk', 'strandWidth', 'Tutam kalınlığı', 0.6, 1.6, 0.01, 1.0),
  R('hair', 'Şekil', 'spikiness', 'Sivrilik / dağınıklık', 0, 1, 0.01, 0.15),
  R('hair', 'Şekil', 'wave', 'Dalgalılık', 0, 1, 0.01, 0.0),
  R('hair', 'Şekil', 'tipFlip', 'Uç kıvrımı (dışa)', -1, 1, 0.01, -0.15),
  R('hair', 'Şekil', 'partX', 'Ayrım konumu', -1, 1, 0.01, 0.0),
  T('hair', 'Şekil', 'ahoge', 'Ahoge (anten tel)', true),
  S('hair', 'Ekler', 'tails', 'Kuyruk', [['none', 'Yok'], ['ponytail', 'At kuyruğu'], ['twin', 'İkiz kuyruk'], ['bun', 'Topuz'], ['twinbun', 'Çift topuz'], ['side', 'Yan kuyruk']], 'none'),
  R('hair', 'Ekler', 'tailLen', 'Kuyruk uzunluğu', 0.3, 2.0, 0.01, 1.0),
  R('hair', 'Ekler', 'tailHeight', 'Kuyruk yüksekliği', 0, 1, 0.01, 0.6),
  R('hair', 'Ekler', 'tailVolume', 'Kuyruk hacmi', 0.5, 1.6, 0.01, 1.0),
  C('hair', 'Ekler', 'tieColor', 'Toka rengi', '#e8344e'),
  C('hair', 'Renk', 'hairColor', 'Saç rengi', '#4a2f2a', 'mat'),
  C('hair', 'Renk', 'hairTip', 'Uç rengi (geçiş)', '#7a4a3a', 'mat'),
  C('hair', 'Renk', 'hairShade', 'Saç gölge rengi', '#2a1620', 'mat'),
  C('hair', 'Renk', 'hairSpec', 'Parlama (melek halkası)', '#ffe9dc', 'mat'),
  R('hair', 'Renk', 'hairSpecStr', 'Parlama gücü', 0, 1, 0.01, 0.55, 'mat'),
  R('hair', 'Renk', 'hairGrad', 'Renk geçişi miktarı', 0, 1, 0.01, 0.5, 'mat'),
  R('hair', 'Rastgelelik', 'seed', 'Tohum (varyasyon)', 1, 999, 1, 7),

  // ---------------- OUTFIT ----------------
  S('outfit', 'Üst', 'top', 'Üst giysi', [
    ['sailor', 'Denizci üniforması'], ['shirt', 'Gömlek + kravat'], ['tshirt', 'Tişört'], ['longsleeve', 'Uzun kollu'],
    ['hoodie', 'Kapüşonlu (bol)'], ['tank', 'Atlet'], ['crop', 'Crop top'], ['sportbra', 'Spor üstü'],
  ], 'sailor'),
  R('outfit', 'Üst', 'sleeveLen', 'Kol boyu', 0, 1, 0.01, 0.25),
  R('outfit', 'Üst', 'topLen', 'Üst boyu', 0, 1, 0.01, 0.75),
  R('outfit', 'Üst', 'topLoose', 'Bolluk', 0, 1, 0.01, 0.35),
  C('outfit', 'Üst', 'topColor', 'Ana renk', '#f4f6fb'),
  C('outfit', 'Üst', 'topColor2', 'Yaka / ikincil renk', '#25336b'),
  C('outfit', 'Üst', 'ribbonColor', 'Fiyonk / kravat', '#d8283e'),
  S('outfit', 'Alt', 'bottom', 'Alt giysi', [['skirt', 'Pileli etek'], ['aline', 'A-kesim etek'], ['shorts', 'Şort'], ['pants', 'Pantolon'], ['briefs', 'Mayo altı']], 'skirt'),
  R('outfit', 'Alt', 'bottomLen', 'Boy', 0, 1, 0.01, 0.45),
  R('outfit', 'Alt', 'skirtFlare', 'Etek genişliği', 0, 1, 0.01, 0.5),
  R('outfit', 'Alt', 'pleats', 'Pile sayısı', 0, 32, 1, 18),
  C('outfit', 'Alt', 'bottomColor', 'Renk', '#25336b'),
  S('outfit', 'Ayak', 'legwear', 'Çorap', [['none', 'Yok'], ['socks', 'Kısa çorap'], ['knee', 'Diz çorabı'], ['thigh', 'Diz üstü çorap'], ['tights', 'Külotlu çorap']], 'knee'),
  C('outfit', 'Ayak', 'legwearColor', 'Çorap rengi', '#1d1d2b'),
  S('outfit', 'Ayak', 'shoes', 'Ayakkabı', [['loafer', 'Okul ayakkabısı'], ['sneaker', 'Spor ayakkabı'], ['boots', 'Bot'], ['none', 'Yalın ayak']], 'loafer'),
  C('outfit', 'Ayak', 'shoeColor', 'Ayakkabı rengi', '#3b2622'),
  C('outfit', 'Ayak', 'shoeColor2', 'Taban rengi', '#f2efe9'),

  // ---------------- ACCESSORIES ----------------
  S('acc', 'Kafa', 'animalEars', 'Hayvan kulağı', [['none', 'Yok'], ['cat', 'Kedi'], ['fox', 'Tilki'], ['bunny', 'Tavşan']], 'none'),
  C('acc', 'Kafa', 'earColor', 'Kulak rengi', '#4a2f2a'),
  C('acc', 'Kafa', 'earInner', 'Kulak içi', '#ffc7cf'),
  S('acc', 'Kafa', 'headAcc', 'Saç aksesuarı', [['none', 'Yok'], ['bow', 'Büyük fiyonk'], ['clip', 'Toka'], ['headband', 'Saç bandı'], ['horns', 'Boynuz'], ['halo', 'Hale']], 'none'),
  C('acc', 'Kafa', 'accColor', 'Aksesuar rengi', '#e8344e'),
  S('acc', 'Yüz', 'glasses', 'Gözlük', [['none', 'Yok'], ['round', 'Yuvarlak'], ['square', 'Köşeli'], ['half', 'Yarım çerçeve']], 'none'),
  C('acc', 'Yüz', 'glassesColor', 'Gözlük rengi', '#2b2b35'),
  T('acc', 'Diğer', 'tail', 'Hayvan kuyruğu', false),
  T('acc', 'Diğer', 'choker', 'Boyun bandı (choker)', false),
  C('acc', 'Diğer', 'chokerColor', 'Choker rengi', '#1c1c24'),

  // ---------------- RENDER ----------------
  S('render', 'Poz', 'pose', 'Poz', [['idle', 'Rahat duruş'], ['apose', 'A-Poz'], ['tpose', 'T-Poz'], ['wave', 'El sallama'], ['peace', 'Zafer işareti'], ['hips', 'Eller belde']], 'idle', 'pose'),
  T('render', 'Poz', 'animate', 'Nefes & göz kırpma', true, 'view'),
  T('render', 'Poz', 'turntable', 'Otomatik döndür', false, 'view'),
  R('render', 'Çizgi & Gölge', 'outline', 'Kontur kalınlığı', 0, 3, 0.01, 1.0, 'mat'),
  C('render', 'Çizgi & Gölge', 'outlineColor', 'Kontur rengi', '#2a1c24', 'mat'),
  R('render', 'Çizgi & Gölge', 'shadeSoft', 'Gölge yumuşaklığı', 0, 1, 0.01, 0.12, 'mat'),
  R('render', 'Çizgi & Gölge', 'shadeThreshold', 'Gölge miktarı', 0, 1, 0.01, 0.45, 'mat'),
  R('render', 'Çizgi & Gölge', 'rim', 'Kenar ışığı', 0, 1, 0.01, 0.35, 'mat'),
  R('render', 'Işık', 'lightAngle', 'Işık yönü', -180, 180, 1, 30, 'mat'),
  R('render', 'Işık', 'lightHeight', 'Işık yüksekliği', -30, 85, 1, 40, 'mat'),
  C('render', 'Işık', 'lightColor', 'Işık rengi', '#ffffff', 'mat'),
  S('render', 'Sahne', 'bg', 'Arka plan', [['studio', 'Stüdyo'], ['sky', 'Gökyüzü'], ['sunset', 'Gün batımı'], ['night', 'Gece'], ['plain', 'Düz (gri)'], ['green', 'Yeşil ekran']], 'studio', 'view'),
  S('render', 'Kalite', 'quality', 'Mesh kalitesi', [['low', 'Oyun / mobil (~12k üçgen)'], ['mid', 'Standart (~30k)'], ['high', 'Yüksek (~70k)'], ['ultra', 'Ultra (~150k)']], 'mid'),
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map((s) => [s.key, s.def]));

// Hair style presets (applied over params)
export const HAIR_PRESETS = {
  bob: { bangs: 'straight', bangsLen: 0.9, sideLen: 0.55, backLen: 0.28, volume: 1.0, spikiness: 0.15, wave: 0.0, tipFlip: -0.15, tails: 'none', strandWidth: 1.0, bangsCount: 9 },
  long: { bangs: 'swept', bangsLen: 0.95, sideLen: 1.3, backLen: 1.8, volume: 1.05, spikiness: 0.2, wave: 0.12, tipFlip: 0.05, tails: 'none', strandWidth: 1.0, bangsCount: 9 },
  twintails: { bangs: 'straight', bangsLen: 0.95, sideLen: 0.7, backLen: 0.35, volume: 1.0, spikiness: 0.25, wave: 0.15, tipFlip: 0.1, tails: 'twin', tailLen: 1.2, tailHeight: 0.75, tailVolume: 1.0, strandWidth: 1.0, bangsCount: 9 },
  ponytail: { bangs: 'swept', bangsLen: 0.85, sideLen: 0.7, backLen: 0.15, volume: 0.95, spikiness: 0.2, wave: 0.1, tipFlip: 0.1, tails: 'ponytail', tailLen: 1.1, tailHeight: 0.8, tailVolume: 1.0, strandWidth: 1.0, bangsCount: 8 },
  short: { bangs: 'spiky', bangsLen: 0.75, sideLen: 0.25, backLen: 0.2, volume: 0.95, spikiness: 0.45, wave: 0.0, tipFlip: 0.0, tails: 'none', strandWidth: 1.05, bangsCount: 8, ahoge: false },
  spiky: { bangs: 'spiky', bangsLen: 0.8, sideLen: 0.35, backLen: 0.45, volume: 1.35, spikiness: 1.0, wave: 0.0, tipFlip: 0.3, tails: 'none', strandWidth: 1.2, bangsCount: 8 },
  hime: { bangs: 'straight', bangsLen: 1.0, sideLen: 0.95, backLen: 1.9, volume: 1.0, spikiness: 0.0, wave: 0.0, tipFlip: 0.0, tails: 'none', strandWidth: 1.0, bangsCount: 11, ahoge: false },
  bun: { bangs: 'split', bangsLen: 0.85, sideLen: 0.8, backLen: 0.1, volume: 0.95, spikiness: 0.15, wave: 0.15, tipFlip: 0.0, tails: 'bun', tailHeight: 0.85, tailVolume: 1.0, strandWidth: 1.0, bangsCount: 8 },
  wolf: { bangs: 'spiky', bangsLen: 1.0, sideLen: 0.9, backLen: 0.85, volume: 1.15, spikiness: 0.7, wave: 0.1, tipFlip: 0.45, tails: 'none', strandWidth: 0.95, bangsCount: 10 },
};

// Full character presets
export const CHARACTER_PRESETS = [
  {
    id: 'sakura', name: 'Sakura', desc: 'Pembe saçlı lise öğrencisi',
    p: { hairStyle: 'bob', ...HAIR_PRESETS.bob, hairColor: '#f39bb6', hairTip: '#ffd1de', hairShade: '#b8506f', hairSpec: '#fff4f8', irisTop: '#2c6e3a', irisBottom: '#9fe08a', top: 'sailor', topColor2: '#25336b', bottomColor: '#25336b', ribbonColor: '#e8344e', headAcc: 'clip', accColor: '#ffd23f', mouth: 'smile' },
  },
  {
    id: 'rin', name: 'Rin', desc: 'İkiz kuyruklu idol',
    p: { hairStyle: 'twintails', ...HAIR_PRESETS.twintails, hairColor: '#45c6d6', hairTip: '#b9f3ff', hairShade: '#1f6f8f', irisTop: '#155a7a', irisBottom: '#6ff0ff', top: 'tshirt', topColor: '#2a2a35', topColor2: '#45c6d6', bottom: 'skirt', bottomColor: '#3a3a48', legwear: 'thigh', legwearColor: '#202028', shoes: 'boots', shoeColor: '#202028', tieColor: '#2a2a35', mouth: 'open', eyeStyle: 'round', headAcc: 'none', sleeveLen: 0.15 },
  },
  {
    id: 'yuki', name: 'Yuki', desc: 'Beyaz saçlı sakin büyücü',
    p: { hairStyle: 'long', ...HAIR_PRESETS.long, hairColor: '#eef1fb', hairTip: '#b9c6ff', hairShade: '#8f9bd0', hairSpec: '#ffffff', irisTop: '#5b2a8f', irisBottom: '#d6a0ff', eyeStyle: 'sleepy', top: 'longsleeve', topColor: '#2b2d52', topColor2: '#e6c36a', bottom: 'aline', bottomLen: 0.75, bottomColor: '#2b2d52', legwear: 'tights', legwearColor: '#1a1a26', shoes: 'boots', shoeColor: '#2b2d52', mouth: 'neutral', headAcc: 'none', blush: 0.25, skin: '#fff0ea' },
  },
  {
    id: 'kaito', name: 'Kaito', desc: 'Enerjik shōnen kahraman',
    p: {
      gender: 1, height: 174, headsTall: 6.9, bust: 0, shoulders: 1.22, chest: 1.12, waist: 1.08, hips: 0.92, thigh: 0.95, muscle: 0.55, weight: 0.3,
      hairStyle: 'spiky', ...HAIR_PRESETS.spiky, hairColor: '#ff7a2f', hairTip: '#ffd36b', hairShade: '#b0361a', irisTop: '#7a2a10', irisBottom: '#ffb347',
      eyeStyle: 'shonen', lashThick: 0.6, lashWing: 0.2, lowerLash: false, browStyle: 'angry', browThick: 1.4, jaw: 1.15, chinPoint: 0.35, faceWidth: 1.0, cheeks: 0.2, blush: 0, mouth: 'fang', ahoge: false,
      top: 'hoodie', topColor: '#2b3a55', topColor2: '#ff7a2f', sleeveLen: 1, topLen: 0.85, bottom: 'pants', bottomLen: 1, bottomColor: '#30343f', legwear: 'none', shoes: 'sneaker', shoeColor: '#f4f4f4', shoeColor2: '#ff5a3c', skin: '#ffdcc7',
    },
  },
  {
    id: 'ren', name: 'Ren', desc: 'Sakin ve zeki öğrenci',
    p: {
      gender: 0.9, height: 172, headsTall: 6.8, bust: 0, shoulders: 1.15, chest: 1.08, waist: 1.04, hips: 0.92, thigh: 0.92, muscle: 0.3, weight: 0.3,
      hairStyle: 'short', ...HAIR_PRESETS.short, hairColor: '#2a2d3a', hairTip: '#4a5070', hairShade: '#11121a', hairSpec: '#c8d4ff', irisTop: '#1f2a44', irisBottom: '#7f9cc9',
      eyeStyle: 'sharp', lashThick: 0.7, lashWing: 0.3, lowerLash: false, browStyle: 'straight', jaw: 1.1, chinPoint: 0.4, cheeks: 0.15, blush: 0.0, mouth: 'neutral', glasses: 'square',
      top: 'shirt', topColor: '#f6f7fb', topColor2: '#f6f7fb', ribbonColor: '#2c3e7a', sleeveLen: 1, topLen: 0.9, bottom: 'pants', bottomLen: 1, bottomColor: '#3a3f52', legwear: 'none', shoes: 'loafer',
    },
  },
  {
    id: 'mei', name: 'Mei', desc: 'Kedi kulaklı neşeli kız',
    p: {
      hairStyle: 'short', ...HAIR_PRESETS.bob, bangs: 'spiky', sideLen: 0.55, backLen: 0.45, hairColor: '#2b2230', hairTip: '#6a4e7a', hairShade: '#120c16', hairSpec: '#e9d8ff',
      irisTop: '#8a5a00', irisBottom: '#ffd34a', pupilShape: 'slit', eyeStyle: 'cat', animalEars: 'cat', earColor: '#2b2230', tail: true, mouth: 'cat', choker: true, chokerColor: '#ffd34a', top: 'crop', topColor: '#ffffff', topColor2: '#2b2230', bottom: 'shorts', bottomColor: '#3d4a7a', legwear: 'thigh', legwearColor: '#2b2230', shoes: 'sneaker', shoeColor: '#ffffff', shoeColor2: '#2b2230',
    },
  },
];

export function applyHairPreset(params, style) {
  const p = HAIR_PRESETS[style];
  if (!p) return params;
  return { ...params, ...p, ahoge: p.ahoge ?? params.ahoge, hairStyle: style };
}
