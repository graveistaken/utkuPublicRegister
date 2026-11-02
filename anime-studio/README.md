# ✦ AnimeForge Stüdyo

Tarayıcıda çalışan **3D anime karakter oluşturucu**. Kaydırıcılarla saçtan göze, boydan kıyafete kadar her şeyi ayarla. Sonra karakteri **iskeleti ve ağırlıklarıyla birlikte** GLB veya **VRM 1.0** olarak indirip Unity, Unreal, Godot, Blender ya da VRChat/VTuber araçlarında kullan.

## Özellikler

| Bölüm | Neler ayarlanabilir |
|---|---|
| **Vücut** | Boy (120–200 cm), vücut/kafa oranı (chibi'den gerçekçiye), kadınsı ⟷ erkeksi, kas, kilo, omuz, göğüs, bel, kalça, gövde, boyun, kol/bacak uzunluk ve kalınlığı, el/ayak boyutu, ten ve gölge rengi |
| **Yüz** | Yüz genişliği, çene genişliği/uzunluğu/sivriliği, yanaklar, anime yüz düzlüğü, burun, kulak tipi (insan / elf), 8 ağız ifadesi, allık, utangaç çizgiler, ben, çil |
| **Gözler** | 6 göz stili (yuvarlak, tsurime, tareme, uykulu, kedi, shōnen), boyut/genişlik/açıklık/aralık/eğim, iris ve göz bebeği (yuvarlak, kedi, yıldız, kalp), iki tonlu iris rengi, heterokromi, parlama stilleri, kirpikler, kaşlar |
| **Saç** | 9 hazır model (bob, uzun, ikiz kuyruk, at kuyruğu, kısa, dikenli, hime, topuz, kurt kesim), perçem stili/uzunluğu/tel sayısı, yan ve arka uzunluk, hacim, sivrilik, dalga, uç kıvrımı, ayrım, ahoge, kuyruk/topuz, renk geçişi ve “melek halkası” parlaması |
| **Kıyafet** | Denizci üniforması (yaka şeridi + fiyonk), gömlek + kravat, tişört, uzun kollu, kapüşonlu, atlet, crop top, spor üstü; pileli / A-kesim etek, şort, pantolon; çoraplar; okul ayakkabısı, spor ayakkabı, bot |
| **Aksesuar** | Kedi / tilki / tavşan kulakları, hayvan kuyruğu, fiyonk, toka, saç bandı, boynuz, hale, gözlük (3 tip), choker |
| **Görünüm** | 6 poz, nefes + göz kırpma animasyonu, kontur kalınlığı/rengi, gölge yumuşaklığı/miktarı, kenar ışığı, ışık yönü, 6 arka plan, 4 mesh kalitesi |

Ayrıca: 6 hazır karakter, rastgele karakter üretici, geri al / yinele (Ctrl+Z / Ctrl+Y), JSON kaydet/yükle, şeffaf arka planlı PNG, mobil uyumlu arayüz.

## Çalıştırma

```bash
cd anime-studio
npm install
npm run dev        # http://localhost:5173
npm run build      # statik dosyalar dist/ klasörüne (GitHub Pages, Netlify vb. ile yayınlanabilir)
```

## Dışa aktarma

- **GLB** – glTF 2.0 ikili dosya. İskelet (52 humanoid kemik, T-poz), deri ağırlıkları, materyaller ve yüz dokusu içerir. Blender'da *Dosya → İçe Aktar → glTF 2.0*.
- **VRM 1.0** – Aynı model + `VRMC_vrm` humanoid eşlemesi, **MToon** toon materyalleri (gölge rengi, kontur, kenar ışığı) ve `blink` (göz kırpma) ifadesi. Unity'de **UniVRM**, Godot'ta **godot-vrm**, Unreal'da **VRM4U** ile açılır; VTuber yazılımlarında doğrudan kullanılabilir.
- Kemik isimleri standarttır (`Hips`, `Spine`, `Chest`, `UpperChest`, `Neck`, `Head`, `LeftUpperArm`, `LeftIndexProximal`…). Unity Humanoid ve Mixamo animasyonları yeniden hedeflenebilir.
- Mesh kalitesi (Görünüm sekmesi): *Oyun/mobil* ≈ 25 bin, *Standart* ≈ 55 bin, *Yüksek* ≈ 130 bin, *Ultra* ≈ 300 bin üçgen (render/sinematik için).

## Nasıl çalışıyor?

Modeller hazır parçalardan değil, parametrelerden **her seferinde sıfırdan üretilir**:

1. **İskelet** (`src/core/rig.js`): Boy, kafa oranı ve uzuvlardan humanoid eklem konumları hesaplanır.
2. **Vücut, kafa, eller** (`body.js`, `head.js`): Anatomi, işaretli mesafe alanlarının (SDF) yumuşak birleşimiyle tanımlanır (Blender'daki metaball / remesh mantığı). Anime yüzü için V çene, düz yüz düzlemi ve küçük burun kullanılır.
3. **Mesh** (`mesher.js`, `partkit.js`): Seyrek blok tabanlı *Surface Nets* yüzeyi çıkarır, köşeleri yüzeye projekte eder, normalleri SDF gradyanından alır, `meshoptimizer` ile üçgen sayısını düşürür ve kemik ağırlıklarını hesaplar.
4. **Saç** (`hair.js`): Kafayı saran bir saç kabuğu + kafa ve omuzlarla çarpışarak dökülen, sivri uçlu hacimli tutamlar.
5. **Kıyafet** (`outfit.js`): Vücut SDF'inden şişirilip kırpılan kumaş kabukları; pileli etek ise vücuda göre ışın atılarak oturtulan parametrik bir yüzey. Kıyafetin altında kalan vücut üçgenleri silinir (daha az poligon, kumaştan taşma yok).
6. **Yüz** (`render/face.js`): Gözler, kaşlar, ağız ve allık 2048 px'lik bir dokuya çizilip yüze yansıtılır (anime oyun modellerindeki doku-tabanlı yüz tekniği).
7. **Görüntü** (`render/materials.js`): Blender/Eevee anime kurulumlarındaki teknikler:
   - Renkli, yumuşak geçişli cel shading ve gerçek gölge haritası (saçın yüze, kolların gövdeye, karakterin zemine düşen gölgesi)
   - SDF'ten köşe başına önceden hesaplanmış ortam gölgesi (AO)
   - Eklemlerde (diz, dirsek, parmak, kulak) pembe ten tonu ve ışık-gölge sınırında sıcak "deri altı" bandı
   - Küreye yumuşatılmış yüz normalleri (temiz anime yüz gölgesi)
   - Paralaks ile içe gömük 3D iris
   - Saçta tel yönünde Kajiya-Kay parlaması ve ince tel çizgileri
   - Kumaşta mikro doku, ılık/soğuk kenar ışıkları, yerel renkte ince konturlar, MSAA ve hafif bloom

Üretim üç Web Worker'da paralel yapılır (vücut / kıyafet / kafa + saç), değişmeyen parçalar önbellekten gelir.

## Geliştirici notları

- `src/dev/vrmcheck.js`: Dışa aktarılan VRM'i `@pixiv/three-vrm` ile yükleyip doğrulayan yardımcı (yalnızca geliştirme).
- Parametre şeması `src/params.js` içinde; yeni bir kaydırıcı eklemek için şemaya bir satır eklemek yeterli, arayüz otomatik oluşur.

## Bilinen sınırlar

- Saç ve etek için fizik kemikleri (spring bone) henüz yok; saç kafa kemiğine bağlıdır.
- Yüz ifadeleri doku tabanlıdır (VRM'de göz kırpma var; ağız şekilleri için blendshape yok).
- Prosedürel bir araçtır: Ürettiği modeller oyunda doğrudan kullanılabilir, istersen Blender'da ek detay vererek daha da ileri taşıyabilirsin.
