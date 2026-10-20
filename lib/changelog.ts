// riasly — changelog data source.
// This is real, versioned product history (not fake user/stat data).
// Newest entries first.

export type ChangelogEntry = {
  date: string; // ISO date, rendered with the active locale
  version: string;
  title: string;
  changes: string[];
  /** Optional Turkish copy; older entries fall back to English. */
  titleTr?: string;
  changesTr?: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-10-14",
    version: "1.8.1",
    title: "The Discord card finally tells the truth",
    changes: [
      "Your Discord clan now shows on the card — tag and emblem. The clan data was always there on the connected account; the card was reading it from a path Discord blocks for bots, so it stayed blank. It now paints the real clan identity (for example DIA).",
      "The server chip shows the server behind your Discord identity — the clan / primary server you pick in Discord — instead of some arbitrary server you happen to own.",
      "Only badges you actually earned are shown. The marks come straight from Discord's public flag set, so a Nitro gem or any other chip appears only when the account truly has it — never invented out of thin air.",
      "Animated username effects no longer stall. The shimmer used to freeze for most of every sweep; it now runs continuously and seamlessly over any background. A visitor who explicitly chooses the calm motion setting can still opt the name out, by design.",
    ],
    titleTr: "Discord kartı sonunda gerçeği söylüyor",
    changesTr: [
      "Discord klânın artık kartta görünüyor — etiketi ve amblemiyle. Klân verisi bağlı hesapta her zaman vardı; kart, onu Discord'un botlar için kapattığı bir yoldan okumaya çalıştığı için boş kalıyordu. Artık gerçek klân kimliğini (örneğin DIA) boyuyor.",
      "Sunucu rozeti, Discord kimliğinin arkasındaki sunucuyu — Discord'da seçtiğin klân / ana sunucuyu — gösteriyor; sahip olduğun rastgele bir sunucuyu değil.",
      "Yalnızca gerçekten kazandığın rozetler gösterilir. İşaretler doğrudan Discord'un herkese açık bayrak setinden gelir; yani bir Nitro taşı ya da başka bir rozet, hesap gerçekten sahipse görünür — asla uydurulmaz.",
      "Hareketli kullanıcı adı efektleri artık duraksamıyor. Parlama efekti her turun çoğunda donuyordu; şimdi kesintisiz ve kusursuz biçimde, arka plan ne olursa olsun devam ediyor. Sakin hareket ayarını bilinçli seçen bir ziyaretçi, isim için bunu yine kapatabilir — bu bilinçli bir tercih.",
    ],
  },
  {
    date: "2026-10-14",
    version: "1.8.0",
    title: "riasly — new name, a fresh mark, and honest view counts",
    changes: [
      "The product is now riasly. The wordmark, the browser tab, the logo (a new faceted gem mark) and every page title carry the new name; nothing about your handle or the URL changed.",
      "Discord badges are harder to lose. The authoritative bot read now retries the transient Discord edge errors (5xx, a dropped connection, a rate limit, and the code-40333 hiccup) instead of giving up on the first one, and a valid OAuth identity always fills the marks so a card no longer paints empty. Only badges a person has actually earned are shown — a chip never appears out of thin air.",
      "Opening a profile in its own tab animates the browser-tab title, guns.lol style — the name spreads out and sparkles cycle by. It pauses in a hidden tab, restores the normal title when you leave, and stays static when your device asks for reduced motion.",
      "Profile views are unique now. One signed-in account counts exactly once per profile, no matter how many times it returns; anonymous visitors are de-duplicated per IP, and previewing your own page never adds to your own count. The leaderboard and totals read the same honest number.",
    ],
    titleTr: "riasly — yeni ad, yeni logo ve dürüst görüntülenme sayımı",
    changesTr: [
      "Ürünün adı artık riasly. Kelime logosu, sekme başlığı, logo (yeni çok yüzlü bir taş simgesi) ve tüm sayfa başlıkları yeni adı taşıyor; kullanıcı adında ve bağlantıda hiçbir şey değişmedi.",
      "Discord rozetleri artık kolay kaybolmuyor. Yetkili bot okuması, geçici Discord kenar hatalarında (5xx, kopan bağlantı, hız sınırı ve 40333 kodlu aksaklık) ilk denemede vazgeçmek yerine yeniden deniyor; geçerli bir OAuth kimliği işaretleri her zaman dolduruyor, böylece kart boş boyanmıyor. Yalnızca gerçekten kazanılmış rozetler gösterilir — bir rozet hiçbir yerden çıkmaz.",
      "Bir profili kendi sekmesinde açınca sekme başlığı guns.lol tarzında hareket ediyor — isim aralıklı diziliyor ve semboller sırayla parlıyor. Sekme arka plandayken duruyor, sayfadan çıkınca normal başlığa dönüyor ve cihazınız azaltılmış hareket istediğinde sabit kalıyor.",
      "Profil görüntülenmeleri artık tekil. Bir giriş yapmış hesap, bir profili kaç kez ziyaret ederse etsin tam olarak bir kez sayılıyor; giriş yapmamış ziyaretçiler IP başına tekilliyor ve kendi profilini önizlemek sayını asla artırmasın. Sıralama ve toplamlar aynı dürüst sayısı okuyor.",
    ],
  },
  {
    date: "2026-10-09",
    version: "1.7.0",
    title: "Admins can add their own templates to the gallery",
    changes: [
      "A new intake on the Templates page lets an admin upload an edit — a loop (MP4, WebM, MOV, GIF) or a still (PNG, JPG, WebP) — and it joins the curated gallery beside the built-in themes.",
      "Every upload runs the same pipeline the stock templates were built with: the file is rendered to a 4K wall, a 720p hover proxy and a light poster, and the resolution, weight and \"upscaled\" label on its card are measured off the render, never typed in.",
      "A new card shows \"Rendering…\" while the encode runs and updates on its own when it finishes; a failed render shows why and offers Retry or Delete. Nothing about the existing 65 templates changed.",
      "Admin rows merge into the catalog at read time, so applying one behaves exactly like a stock template — its wall streams with byte-range delivery on the public profile, and its poster fills the avatar slot.",
      "Curation stays safe: hiding an admin template is reversible, and deleting one is refused while any profile still shows its artwork.",
    ],
    titleTr: "Adminler galeriye kendi şablonlarını ekleyebiliyor",
    changesTr: [
      "Şablonlar sayfasındaki yeni alan, bir adminin kendi düzenlemesini — bir döngü (MP4, WebM, MOV, GIF) veya statik görsel (PNG, JPG, WebP) — yükleyip hazır temaların yanına eklemesini sağlıyor.",
      "Her yükleme, stok şablonların kurulduğu boru hattından geçiyor: dosya 4K duvar, 720p hareketli önizleme ve hafif afiş olarak üretiliyor; karttaki çözünürlük, boyut ve \"HD'den büyütüldü\" etiketi elle yazılmıyor, üretilen dosyadan ölçülüyor.",
      "Kodlama sürerken yeni kart \"İşleniyor…\" gösteriyor ve bitince kendini güncelliyor; başarısız bir render nedenini yazıyor ve Yeniden dene / Sil sunuyor. Mevcut 65 şablonda hiçbir şey değişmedi.",
      "Admin satırları okuma anında kataloga birleşiyor, yani biri profiline uygulandığında stok bir şablonla birebir aynı davranıyor — duvar dosyası herkese açık profilde bayt aralığıyla akıyor, afişi avatar alanını dolduruyor.",
      "Düzenleme güvenli kaldı: bir admin şablonunu gizlemek geri alınabilir; herhangi bir profil o görseli hâlâ gösteriyken silme işlemi reddediliyor.",
    ],
  },
  {
    date: "2026-10-08",
    version: "1.6.0",
    title: "Every template is now a real 4K video",
    changes: [
      "All ready-made templates move inside the media itself. The drift each theme is named for — Ken Burns, vertical drift, sideways pan, push-in, orbit or breathe — is rendered into the pixels at 3840×2160 (2160×3840 for tall artwork) and loops seamlessly, so a CSS layer is no longer pretending a still image is moving.",
      "The 29 stock loops that only exist in 720p were upscaled to UHD with a lanczos pass and light sharpening. Their cards say \"upscaled from HD\": those pixels are 4K, the detail behind them is not, and we would rather print that than let a badge imply more.",
      "Nothing is hotlinked any more. Each template ships three files: the 4K wall a visitor streams, a 720p proxy that plays while you hover a card (a 65-card grid never pulls 65 wall-sized files), and a light poster that also fills the \"use as avatar\" slot.",
      "Effect layers deliberately stayed CSS. Grain, scanlines, aurora and the rest are still painted at run time, so your motion preference as a visitor keeps working and no effect gets doubled into a video where it can never be switched off.",
      "Badges are measurements now, not claims: the pixel size and MB printed on a card are read back off the rendered file with ffprobe by \"npm run templates:build\". A template whose render does not exist yet falls back to its source artwork instead of showing a dead link.",
    ],
    titleTr: "Her şablon artık gerçek bir 4K video",
    changesTr: [
      "Hazır şablonların hepsi artık medyanın içinde hareket ediyor. Her temanın adıyla anıldığı hareket — Ken Burns, dikey kayma, yatay kaydırma, içe yaklaşma, yörünge veya nefes — piksellerin içine 3840×2160 (dikey görseller için 2160×3840) çözünürlükte işleniyor ve kusursuz döngüyle tekrar ediyor; yani bir CSS katmanı hareketsiz bir fotoğrafı hareketliymiş gibi göstermiyor.",
      "Yalnızca 720p bulunabilen 29 hazır döngü lanczos ile UHD'ye büyütülüp hafifçe keskinleştirildi. Kartlarında \"HD'den büyütüldü\" yazar: o pikseller 4K ama arkalarındaki detay değil; bir rozetin fazlasını ima etmesindense bunu açıkça söylemeyi tercih ederiz.",
      "Artık hiçbir şablon dış bağlantıyla (hotlink) çalışmıyor. Her şablon üç dosya taşıyor: ziyaretçinin akıttığı 4K duvar dosyası, kartın üzerinde gezinirken oynayan 720p önizleme (65 kartlık bir galeri asla 65 duvar boyutunda dosya çekmez) ve avatar alanını da dolduran hafif afiş.",
      "Efekt katmanları bilinçli olarak CSS'te kaldı. Film greni, tarama çizgileri, aurora ve diğerleri çalışırken boyanmaya devam ediyor; böylece ziyaretçi olarak hareket tercihin işlemeye devam ediyor ve hiçbir efekt kapatılamayacağı bir videonun içine iki kat binmiyor.",
      "Rozetler artık iddia değil ölçüm: kartta gördüğün piksel ve MB değeri, üretilen dosyanın kendisinden ffprobe ile okunuyor (\"npm run templates:build\"). Henüz üretimi olmayan bir şablon ölü bağlantı göstermek yerine kaynak görseline düşüyor.",
    ],
  },
  {
    date: "2026-10-07",
    version: "1.5.0",
    title: "Everything moves, and you decide how much",
    changes: [
      "Admins can curate the gallery: every template card has a remove button and a Removed tab brings anything back. Hiding is reversible and never touches a profile that already uses the template.",
      "All 65 templates now move. Each theme carries its own recipe — Ken Burns, vertical drift, sideways pan, push-in, orbit or breathe — and video or GIF templates keep looping natively instead of getting a drift on top.",
      "New effect layers, up to three per theme: film grain, scanlines, light leak, aurora, particles, vignette, sheen, speed lines and RGB glitch. They are pure CSS, so they cost no extra downloads.",
      "A motion preference for visitors: System, Always or Calm. It is saved on your device and applied before the page paints, so \"Always\" also overrides a Windows/macOS setting that has animations turned off.",
      "Template cards now print the measured weight of every HD loop (e.g. HD · 8.4 MB) next to the badge, so HD Animated and 4K Animated are backed by a number.",
    ],
    titleTr: "Her şey hareket ediyor, ne kadarını sen seçiyorsun",
    changesTr: [
      "Adminler galeriyi düzenleyebiliyor: her şablon kartında kaldırma butonu ve kaldırılanı geri getiren \"Kaldırılanlar\" sekmesi var. Gizleme geri alınabilir bir işlemdir; o şablonu zaten kullanan bir profiline asla dokunmaz.",
      "65 hazır şablonun tamamı artık hareketli. Her temanın kendi reçetesi var — Ken Burns, dikey kayma, yatay kaydırma, içe yaklaşma, yörünge ve nefes; video ve GIF şablonları üstüne sürme binmeden kendi döngüleriyle dönüyor.",
      "Yeni efekt katmanları, tema başına en fazla üç: film greni, tarama çizgileri, ışık sızması, aurora, parçacıklar, vinyet, parlama, hız çizgileri ve RGB glitch. Tamamı CSS olduğu için ekstra indirme bedeli yok.",
      "Ziyaretçiler için hareket tercihi: Sistem, Her zaman veya Sakin. Tercih cihazında saklanır ve sayfa boyanmadan önce uygulanır; \"Her zaman\" Windows/macOS'ta animasyonlar kapalıyken de hareketi açar.",
      "Şablon kartları artık her HD döngünün ölçülmüş boyutunu (ör. HD · 8,4 MB) rozetin yanında yazıyor; \"4K Hareketli\" ve \"HD Animasyonlu\" ibareleri tahmin değil, ölçüm.",
    ],
  },
  {
    date: "2026-10-07",
    version: "1.4.0",
    title: "4K wallpapers: anime, cinema and sport",
    changes: [
      "35 new templates at true 4K, hosted by Wallhaven — anime (Rias Gremory, Akeno, Tokyo Ghoul, Berserk), cinema (Blade Runner, Al Pacino, Marilyn Monroe) and sport (Messi, Ronaldo, Jordan).",
      "Two new gallery categories: Cinema and Sport.",
      "Static templates now drift on your profile with a very slow zoom; when your device asks for reduced motion they hold completely still.",
      "Every template card has a second button: use it as your avatar. The small poster is applied, never the multi-megabyte original.",
      "Honesty fix: animated templates are labelled HD — which is what they actually are — and still templates print their measured pixel size and weight in MB.",
    ],
    titleTr: "4K duvar kağıtları: anime, sinema ve spor",
    changesTr: [
      "Wallhaven kaynaklı, gerçek 4K çözünürlükte 35 yeni hazır tema — anime (Rias Gremory, Akeno, Tokyo Ghoul, Berserk), sinema (Blade Runner, Al Pacino, Marilyn Monroe) ve spor (Messi, Ronaldo, Jordan).",
      "Galeride iki yeni kategori: Cinema ve Sport.",
      "Statik temalar profilinde artık çok yavaş bir zoom ile sürükleniyor; cihazın hareket azaltmayı istiyorsa tamamen sabit duruyorlar.",
      "Her şablon kartında ikinci bir buton var: avatar olarak kullan. Uygulanan şey dosyanın kendisi değil, birkaç kilobaytlık afişi.",
      "Dürüstlük düzeltmesi: animasyonlu temalar artık gerçek çözünürlükleri olan HD ile etiketleniyor; statik temalar ise ölçülmüş piksel ve MB değerini kartta yazıyor.",
    ],
  },
  {
    date: "2026-10-07",
    version: "1.3.0",
    title: "Your avatar can move",
    changes: [
      "New Avatar card on Customize: upload a picture, GIF or short clip — or reuse something you already uploaded. It plays silently in your circle, forever.",
      "Plain PNG/JPG avatars are supported too, and the background uploader stays right where it was — the two are separate choices now.",
      "Fixed: choosing a background from your own file and then saving the appearance form used to roll the background back to its previous value.",
      "Fixed: deleting an uploaded file from Files no longer leaves a broken background or avatar pointing at it.",
    ],
    titleTr: "Avatar'ın artık hareketli",
    changesTr: [
      "Özelleştir sayfasında yeni Avatar kartı: resim, GIF veya kısa klip yükle — ya da daha önce yüklediklerini yeniden kullan. Dairende sessizce, sonsuza kadar döner.",
      "Düz PNG/JPG avatarlar da destekleniyor; arka plan yükleyici ise eskisi gibi yerinde duruyor — ikisi artık ayrı tercihler.",
      "Düzeltme: Kendi dosyanla arka plan seçtikten sonra görünüm formunu kaydettiğinde arka plan eski değerine dönüyordu.",
      "Düzeltme: Dosyalar sayfasından bir dosyayı silmek artık arkasında bozuk bir arka plan ya da avatar bırakmıyor.",
    ],
  },
  {
    date: "2026-10-06",
    version: "1.2.0",
    title: "Links, badges and a dashboard that mirrors your profile",
    changes: [
      "New Links page: connect the accounts you own from an icon grid — one account per platform, plus any custom link you like.",
      "New badge system: 14 badges earned from real activity on riasly, shown on your public profile. Once earned, a badge is yours to keep; the team can also grant or revoke one.",
      "New Customize page holds every profile edit — bio, accent colour, avatar, background link and your own upload. Templates is now the built-in gallery, and Files got its own page.",
      "The dashboard sidebar is organised into Profile and Content sections, with a mobile nav that always lists the same pages.",
      "Overview is now pure numbers plus shortcuts: no more forms stacked on top of your stats.",
    ],
    titleTr: "Linkler, rozetler ve profilini yansıtan panel",
    changesTr: [
      "Yeni Linkler sayfası: sahip olduğun hesapları simge ızgarasından bağla — her platforma tek hesap, dilediğin özel link de ekleyebilirsin.",
      "Yeni rozet sistemi: riasly üzerindeki gerçek hareketlerden kazanılan 14 rozet, herkese açık profilinde gösterilir. Kazanılan rozet sende kalır; ekip ayrıca rozet verebilir veya geri alabilir.",
      "Yeni Özelleştir sayfası profille ilgili her düzenlemeyi toplar — biyografi, vurgu rengi, avatar, arka plan linki ve kendi yüklemelerin. Şablonlar artık yalnızca hazır galeri, Dosyalar ise kendi sayfasına kavuştu.",
      "Panel menüsü Profil ve İçerik bölümlerine ayrıldı; mobil navigasyon her zaman aynı sayfaları listeler.",
      "Genel Bakış artık yalnızca sayılar ve kısayollar: istatistiklerinin üstüne yığılmış formlar kaldırıldı.",
    ],
  },
  {
    date: "2026-10-06",
    version: "1.1.1",
    title: "Backgrounds loop forever + full-detail rendering",
    changes: [
      "Your background video or GIF now plays continuously on every device, including machines with reduced motion enabled — only the parallax and glow effects switch off.",
      "Playback resumes automatically when you return to the tab, so a hidden tab no longer leaves a frozen frame.",
      "Removed the render-time zoom and heavy dark veil: profiles show the real pixels of your file instead of a magnified, washed-out copy.",
      "Upload limit raised from 25 MB to 100 MB, so a genuine 10–30 second 4K loop fits.",
      "The templates page now shows the measured resolution of your file with 4K advice — and your file is streamed exactly as uploaded, never re-encoded.",
    ],
    titleTr: "Arka planlar sonsuz döngüde + tam detaylı görüntüleme",
    changesTr: [
      "Arka plan videon veya GIF'in artık her cihazda kesintisiz döner — hareket azaltma açık olan bilgisayarlarda bile; yalnızca paralaks ve ışıma efektleri devre dışı kalır.",
      "Sekmeye geri döndüğünde oynatma otomatik devam eder, böylece gizlenmiş sekmede donmuş kare kalmaz.",
      "Görüntüleme sırasındaki yakınlaştırma ve ağır karartma kaldırıldı: profiller dosyanın gerçek piksellerini gösterir.",
      "Yükleme sınırı 25 MB'tan 100 MB'a çıktı; gerçek bir 10–30 saniyelik 4K döngü sığar.",
      "Şablonlar sayfası dosyanın ölçülen çözünürlüğünü 4K önerisiyle gösterir — dosyan yeniden kodlanmadan, olduğu gibi sunulur.",
    ],
  },
  {
    date: "2026-10-06",
    version: "1.1.0",
    title: "Build your own template",
    changes: [
      "Upload your own video (MP4, WebM, MOV) or animated GIF and make it your profile background.",
      "Your uploads stay on your account, so any of them can be reapplied in one click.",
      "Background videos now stream smoothly with byte-range delivery and long-term caching.",
      "Custom uploads unlock once an account is 7 days old, keeping the feature abuse-resistant.",
    ],
  },
  {
    date: "2025-06-01",
    version: "1.0.0",
    title: "riasly goes live",
    changes: [
      "Real accounts: sign up with email + password or via Google, GitHub and Discord.",
      "Customizable link-in-bio profiles behind your riasly/ handle.",
      "File hosting with public and private downloads.",
      "Bilingual experience with instant EN / TR switching.",
      "Live stats, leaderboard, system status and Premium code redemption.",
    ],
  },
  {
    date: "2025-06-01",
    version: "0.9.0",
    title: "Internal preview",
    changes: [
      "Rebranded from the prototype to riasly.",
      "Moved all statistics to real database aggregates.",
      "Added account recovery via reset tokens.",
    ],
  },
];
