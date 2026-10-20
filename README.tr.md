# riasly (Türkçe özet)

> Aradığın her şey, burada.

Bu belge, ingilizce [README.md](README.md) için kısa bir Türkçe özettedir; kurulum ve
mimari ayrıntıları için ana belgeyi okuyun. **riasly**, içerik üreticileri ve oyuncular için
açık kaynak, kendi sunucunda çalıştırılabilen bir **link-in-bio + dosya barındırma** platformudur.
Her hesap `riasly.lol/<kullanici-adi>` adresinde özel bir profil ve kimlik doğrulamalı URL'lerle
sunulan kota yönetimli bir dosya alanı alır.

## Ne yapar

- **Herk açık profiller** (`/[kullanici-adi]`) — stillendirilebilir bağlantı sayfası, arka plan
  medya döngüsü ve widget merkezi.
- **Widget'lar** — YouTube, Spotify, SoundCloud, Twitch gömlekleri (Discord/GitHub/Telegram vb.
  kartlar). Kullanıcı bir kaynak bağlantısı yapıştırır; sunucu bunu sabit bir sağlayıcı listesine
  karşı ayrıştırıp **kanonik** bir gömlek URL'si saklar — asla ham HTML değil.
- **Dosya barındırma** — avatar/arka plan/imleç/ses/dosya yükleme. Ücretsiz plan sınırlı
  (varsayılan 5 GB). Baytlar web kökü **dışında** saklanır ve yalnız `api/files` / `api/media`
  doğrulamalı yollarıyla okunur.
- **Discord entegrasyonu**, **e-posta doğrulama**, **2FA (TOTP)**, IP bazlı kayıt sınırı ve
  kullanıcı adı anti-squat bekleme süresi.
- **İki dilde arayüz** — her metin İngilizce + Türkçe; CI pariteyi zorunlu kılar.

## Yığın

Next.js 15 (App Router) · Auth.js v5 (beta) · Prisma 6 + MySQL 8 · next-intl 4 · Tailwind 3 ·
Nodemailer · Vitest.

## Hızlı başlangıç

```bash
nvm use
cp .env.example .env    # gerçek değerleri doldurun
npm ci
npm run db:push
npm run templates:build # galeri görsellerini üretir (neden zorunlu: README'ye bakın)
npm run dev             # web sunucusu + Discord presence worker birlikte
```

**Node ≥ 22.9** gerekir (`.nvmrc` = 24). `discord:worker` ve `templates:*` betikleri
`--env-file-if-exists` ve `--experimental-strip-types` bayraklarına bağlıdır.

## Katkı

Kapı listesi (CI bunları sırayla çalıştırır): `check:i18n`, `lint`, `test`, `typecheck`,
`templates:verify`, `build`. Ayrıntılar: [CONTRIBUTING.md](CONTRIBUTING.md).

## Güvenlik

Bulguları **herk açık issue olarak değil**, [SECURITY.md](SECURITY.md) üzerinden özel bildirin.

## Lisans

[MIT](LICENSE) — yalnızca kod için. Ad/logo ve üçüncü taraf varlıklar (Discord rozetleri,
Mixkit/Wallhaven görselleri, Satoshi yazı tipi, ffmpeg-static) kapsam dışıdır; ayrıntılar
ingilizce README'de.
