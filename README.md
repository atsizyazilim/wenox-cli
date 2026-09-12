# WenOX CLI

WenOX AI kodlama asistanının resmi komut satırı arayüzü. Terminalinizde çalışan,
yerel projenizi okuyabilen, düzenleyebilen, arayabilen ve komut çalıştırabilen bir
AI ajanıdır.

## Kurulum

Tek komut — gerekli tüm bağımlılıklar otomatik olarak kurulur, ek adım gerekmez:

```bash
npm install -g @wenox/cli
```

Gereksinim: Node.js 20 veya üzeri.

## Kullanım

```bash
wenox                       # İnteraktif oturum başlat
wenox -p "bu proje ne yapıyor?"   # Tek seferlik komut
wenox -m 2 -y               # GLM 5.3 Flash ile başlat, komutları otomatik onayla
```

### Seçenekler

| Seçenek | Açıklama |
|---|---|
| `-m, --model <id\|no>` | Kullanılacak model (`1`: Grok 4.6, `2`: GLM 5.3 Flash, `3`: Big Pickle) |
| `-k, --key <anahtar>` | WenOX API anahtarı (kalıcı olarak kaydedilir) |
| `-s, --session <id>` | Kayıtlı bir oturuma devam et |
| `-d, --cwd <yol>` | Başlangıç çalışma dizini / proje yolu |
| `-y, --auto-approve` | Komutları onay sormadan otomatik çalıştır |
| `-p, --prompt <metin>` | Tek seferlik komut çalıştır ve çık |
| `-v, --version` | Sürümü göster |
| `-h, --help` | Yardımı göster |

### Arayüz

İnteraktif terminalde WenOX **tam ekran** bir TUI olarak açılır ve terminali tamamen
ele geçirir (alternatif ekran tamponu) — üstteki kabuk geçmişi görünmez. Ekranın
ortasında logo ve blok giriş çubuğu, altta model/durum satırı, en altta dizin ve
token sayacı bulunur. Konuşma kendi kaydırılabilir görünümünde akar; her yanıtın
altında `▣ Build · <model> · <süre>` meta satırı yer alır.

Model yanıt üretirken giriş kilitlenmez: yazıp gönderdiğiniz mesajlar **kuyruğa**
alınır (`QUEUED`) ve sırayla otomatik işlenir. Ajan bir görevi tamamlamak için
**tek istemde onlarca araç çağrısını kendi kendine** yapar (dosya oku/yaz, komut
çalıştır…) ve yeni bir mesaj bekleyip durmaz.

Alt barda bağlam kullanımı ve maliyet gösterilir. Bağlam penceresi ve fiyatlar
`GET /v1/models`'ten okunur (API sağlıyorsa); bağlam %85'e ulaşınca oturum
**otomatik olarak özetlenir** (`/compact` elle de çalışır).

### Oturum içi komutlar

| Komut | Açıklama |
|---|---|
| `/help` | Komutları gösterir |
| `/model` | Modeli değiştirir — liste her seferinde `GET /v1/models`'ten çekilir |
| `/lang` | Arayüz dilini değiştirir (Türkçe / English) |
| `/key` | API anahtarını günceller |
| `/me` | Hesap bilgisi ve kalan kredi (`GET /v1/me`) |
| `/compact` | Bağlamı özetler, yer açar (bağlam dolmaya yaklaşınca önerilir) |
| `/new` | Bağlamı temizler (yeni oturum) |
| `/sessions` | Geçmiş oturumları listeler ve seçileni yükler |
| `/auto` | Oto-onayı açar/kapatır |
| `/status` | Oturum durumunu gösterir |
| `/exit` | Çıkış |

### Klavye kısayolları

| Tuş | İşlev |
|---|---|
| `Enter` | Gönder |
| `/` | Komut menüsü (yazdıkça filtreler, `↑/↓` + `Enter`) |
| `Tab` | Mod değiştir — **Build** / **Plan** (slash menüsü açıkken komutu tamamlar) |
| `Ctrl+P` | Komut paleti |
| `Esc` | Açık menüyü kapat / akan yanıtı iptal et |
| `Ctrl+C` | Akan işi iptal et, boştaysa çık |
| `↑` / `↓` | Girdi geçmişi (slash menüsü açıkken menüde gezinir) |
| `PgUp` / `PgDn` | Konuşmayı kaydır |
| `Ctrl+U` / `Ctrl+D` | Yarım sayfa kaydır |
| Fare tekeri | Konuşmayı kaydır |

**Metin seçme ve kopyalama:** Konuşma alanında fareyle **tıkla-sürükle** ile seçim
yapabilirsiniz (seçim açık gri zeminle işaretlenir ve kalıcıdır). Kopyalamak için
**Ctrl+C** tuşlayın — seçim panoya alınır, sağ üstte "Panoya kopyalandı" bildirimi
çıkar. `Esc` seçimi iptal eder.

> Not: Uygulama fare takibini açtığı için terminalin kendi seçimi yerine bu seçim
> kullanılır. Gerekirse **Shift + sürükle** ile terminal seçimine de geçebilirsiniz.

`run_command` çalıştırılmadan önce onay istenir. Onay kutusunda `←/→` (veya `Tab`) ile
**Allow / Disallow** seçin, `Enter` ile onaylayın; `Esc` reddeder. Kısayollar:
`a` / `e` / `y` izin verir, `d` / `h` / `n` reddeder. `-y` ile oto-onay açılır.

**Proje dışı dizin erişimi:** Ajan, çalışma dizini dışındaki bir yola erişmeye
çalıştığında **izin istenir** — `Allow once` (bir kez), `Allow always` (kalıcı:
proje bazında kaydedilir) veya `Reject`. `←/→` ile seçin, `Enter` ile onaylayın,
`Esc` reddeder (`o` / `a` / `r` kısayolları). Yalnızca `read_file`, `write_file`,
`edit_file`, `list_dir`, `search_code` araçlarının yolları denetlenir; proje
içindeki yollar sorulmadan geçer. `Allow always` izinleri projeye göre
`~/.wenox/permissions.json` dosyasında saklanır — bir projede verdiğiniz izin
başka projeye taşınmaz.

## Modlar

Durum çubuğunda aktif mod görünür; **`Tab`** ile değiştirilir:

| Mod | Davranış |
|---|---|
| **Plan** (açılışta varsayılan) | Salt-okunur. Ajan yalnızca inceler ve adım adım plan önerir. `write_file`, `edit_file`, `run_command` **engellenir**; değişiklik istiyorsan Tab'a basmanı söyler. |
| **Build** | Ajan dosyaları okuyup düzenler, komut çalıştırır — normal çalışma. |

İnteraktif uygulama **Plan** modda açılır: önce ne yapılacağını görürsün,
onaylayınca `Tab` ile Build'e geçersin. (Tab bulunmayan `-p` ve pipe modunda
doğrudan Build kullanılır.)

## Diller

Arayüz **Türkçe** ve **İngilizce** destekler. Dil, sistem dilinize göre otomatik
seçilir (Türkçe sistem → Türkçe, diğerleri → İngilizce).

- Oturum içinde `/lang` yazıp listeden seçerek değiştirebilirsiniz; seçim
  `~/.wenox/config.json`'a kaydedilir ve sonraki açılışlarda korunur.
- `WENOX_LANG=tr|en` ortam değişkeni ile geçici olarak geçersiz kılabilirsiniz.

> Not: Yalnızca **arayüz** yerelleştirilir. Modele gönderilen sistem prompt'u ve araç
> şemaları her zaman İngilizce kalır; model, sizin yazdığınız dile göre yanıt verir.

## Oturumlar

Her konuşma otomatik olarak `~/.wenox/sessions/` altına kaydedilir. Konuşma ilerledikçe
(4 kullanıcı mesajından sonra) konuşmaya **kısa bir başlık** üretilir.

- Çıkışta terminale devam komutu yazılır:

  ```
  Session   Selamlaşma
  Continue  wenox -s ses_f78edf902ffe
  ```

- `wenox -s <id>` ile o oturuma **kaldığı yerden** devam edersiniz: mesaj geçmişi,
  token sayacı, model ve **çalışma dizini** geri yüklenir.
- Oturum içinde `/sessions` yazıp listeden seçerek de geçmiş bir oturumu açabilirsiniz
  (oturumun kendi klasörü ve geçmişiyle birlikte).

## Yapılandırma

API anahtarı ve aktif model `~/.wenox/config.json` dosyasında saklanır (yalnızca
kullanıcı tarafından okunabilir). Öncelik sırası:

1. Ortam değişkenleri: `WENOX_API_KEY`, `WENOX_DEFAULT_MODEL`, `WENOX_API_BASE_URL`
2. `~/.wenox/config.json`
3. Varsayılanlar

### İlk çalıştırma (onboarding)

Anahtar yokken CLI sizi **tam ekran bir onboarding ekranıyla** karşılar (uygulamanın
kendi TUI'ı içinde — logo ve çerçeveli giriş kutusuyla):

1. **Dil seçimi** — `↑/↓` ile Türkçe/İngilizce, `Enter` ile onay (varsayılan: sistem dili).
2. **API anahtarı** — `https://me.wenox.co/api-key` bağlantısı gösterilir.
   **Boş kutuda `Enter`** → sayfa tarayıcıda açılır; ya da anahtarı kutuya yapıştırıp
   `Enter` ile doğrularsınız.
3. **Doğrulama** — anahtar `GET /v1/me` ile doğrulanır; geçersizse tekrar denenir,
   ağ hatasıysa ayrı mesaj verilir.
4. **Karşılama** — hesabınıza özel, daktilo efektli karşılama:

   ```
   Merhaba Mert İlhan, WenOX CLI'a hoş geldin!
   Görünüşe göre aktif bir aboneliğin var — 12 günün kalmış.
   Kalan kredi: 12.500
   ```

`Esc` (veya `Ctrl+C`) ile çıkabilirsiniz. Anahtar zaten kayıtlıysa (veya `--key` /
`WENOX_API_KEY` verildiyse) onboarding atlanır. Etkileşimli olmayan (pipe)
çalıştırmalarda anahtar yoksa CLI anlaşılır bir hata verip çıkar; anahtarı `--key`
ile geçin.

## Yetenekler

WenOX AI aşağıdaki araçlarla yerel projenizde çalışır:

`read_file`, `write_file`, `edit_file`, `list_dir`, `search_code`, `run_command`,
`code_intel`, `ask_user`.

`code_intel`: kod zekâsı aracı — **tanıma git** (`definition`), **kullanımları bul**
(`references`), **hover** (tip/imza bilgisi) ve **dosya sembolleri** (`symbols`).
Metin aramasından farklı olarak bir **dil sunucusu** kullanır. Sunucular:

| Dil | Sunucu | Kurulum |
|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server` |
| Python | `pyright-langserver` | `npm i -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |

TypeScript/JavaScript için projede `typescript` paketi de gereklidir (sunucu
`tsserver`'ı oradan bulur). Sunucu kurulu değilse araç çökmez; ajan kurulum
komutunu size söyler.

`ask_user`: ajan gerçekten bir tercih gerektiğinde size **çoktan seçmeli soru** sorar
(`↑/↓` veya `1-9` ile seçin, `Enter` gönderir, `Esc` kapatır; isterseniz "Kendi
cevabını yaz" ile serbest metin girebilirsiniz). Gereksiz soru sormaz; emin olmadığı
yerde makul varsayımla ilerler.

`run_command` varsayılan olarak onay ister; `-y` ile otomatik onaylanır.

## Geliştirme

```bash
npm install
npm start          # veya: node bin/wenox.js
```

## Lisans

MIT
