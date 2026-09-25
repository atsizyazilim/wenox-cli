<div align="center">
  <img src="banner.png" alt="WenOX CLI" width="100%">
</div>

<h1 align="center">WenOX CLI</h1>

<p align="center">
  <strong>Terminalinizde yaşayan, görev yapan bir kodlama asistanı.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/v/@wenox/cli?color=0ea5e9&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/dt/@wenox/cli?color=0ea5e9&label=downloads" alt="indirme"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="lisans"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="node">
</p>

<p align="center">
  Dosya okur, arar, düzenler ve oluşturur; komut çalıştırır; dil sunucusuna<br>
  sorar — hepsi WenOX AI ile, tam ekran bir terminal arayüzünde.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README_tr.md">Türkçe</a>
</p>

<div align="center">
  <img src="preview.png" alt="WenOX CLI" width="100%">
</div>

---

## ✨ Neden WenOX CLI

- **Gerçekten ajan.** Bir istem, tek bir cevap değil. Asistan iş bitene kadar araç
  çağırır — oku, ara, düzenle, çalıştır — sonra durumu bildirir.
- **Terminal için tasarlandı.** Tam ekran arayüz: çerçeveli giriş, kaydırılabilir
  sohbet, durum çubuğu ve komut paleti. Tarayıcı sekmesi yok.
- **Kontrol sizde.** Komut çalıştırmak onay ister. Proje dışına çıkmak onay ister.
  Plan modu hiçbir şeye dokunmaz.
- **Gerçek bir dil sunucusu.** Tanıma git, kullanımları bul ve hover bilgisi
  grep'ten değil, LSP sunucusundan gelir.
- **Kaldığınız yeri hatırlar.** Her konuşma kaydedilir ve başlık alır; sonra
  bıraktığınız yerden devam edersiniz.
- **Sizin dilinizi konuşur.** Arayüz Türkçe ve İngilizce; model, sizin yazdığınız
  dilde yanıtlar.
- **Genişletilebilir.** MCP sunucuları (stdio veya HTTP) araç olarak bağlanır;
  panodaki görseli yapıştırıp modele gösterebilirsiniz.
- **Uzun oturumlarda ucuz kalır.** İstekler sağlayıcının önek önbelleğine
  oturacak şekilde kurulur; sabit kalan kısım yeniden hesaplanmaz.

<img src="slimbanner.png" width="100%">

## 📦 Kurulum

```bash
npm install -g @wenox/cli
```

Node.js **20 veya üzeri**. Gerekli her şey paketle gelir — ek adım yok, derleme
yok.

<img src="slimbanner.png" width="100%">

## 🚀 İlk çalıştırma

`wenox` yazın, kurulum sizi adım adım karşılar:

1. **Dil** — Türkçe veya İngilizce (Enter, sistem dilini korur)
2. **API anahtarı** — anahtarı doğrudan yapıştırın; `Ctrl+O` anahtar sayfasını
   tarayıcıda açar
3. **Doğrulama** — anahtar, kaydedilmeden önce sınanır
4. **Karşılama** — adınız, aboneliğiniz ve kalan krediniz

Anahtarınızı **[me.wenox.co/api-key](https://me.wenox.co/api-key)** adresinden
alabilirsiniz.

<img src="slimbanner.png" width="100%">

## 🖥️ Kullanım

```bash
wenox                                   # interaktif oturum
wenox -p "bu projede kaç dosya var?"    # tek seferlik cevap, sonra çıkar
wenox -m <id> -y                        # model seç, komutları otomatik onayla
wenox -s ses_f78edf902ffe               # kayıtlı oturuma devam et
wenox -c                                # en son oturuma devam et
wenox stats                             # token kullanım özeti
```

| Seçenek | Açıklama |
| --- | --- |
| `-m, --model <id\|no>` | Kullanılacak model — liste için `/model` |
| `-k, --key <anahtar>` | WenOX API anahtarı (kalıcı olarak kaydedilir) |
| `-s, --session <id>` | Kayıtlı oturuma devam et |
| `-d, --cwd <yol>` | Başlangıç çalışma dizini |
| `-y, --auto-approve` | Komutları onay sormadan çalıştır |
| `-p, --prompt <metin>` | Tek seferlik komut çalıştır ve çık |
| `-c, --continue` | En son oturuma devam et |
| `--fork` | Son oturumu kopyalayıp yeni bir oturum aç |
| `--format json` | `-p` ile sonucu JSON olarak yaz |
| `--debug` | Tanı kaydı tut (`~/.wenox/debug.log`) |
| `-v, --version` | Sürümü göster |
| `-h, --help` | Yardımı göster |

TUI'yi hiç açmayan terminal komutları da var:

| Komut | Açıklama |
| --- | --- |
| `wenox models [--format json]` | Modelleri listeler (bağlam penceresi, görsel desteği) |
| `wenox sessions` | Geçmiş oturumları listeler |
| `wenox session delete <id>` | Bir oturumu siler |
| `wenox stats [--format json]` | Token kullanım özeti |
| `wenox mcp list \| add \| remove` | MCP sunucularını yönetir |

<img src="slimbanner.png" width="100%">

## ⌨️ Arayüz

Her komut bir kart olarak çizilir — `$` satırı ve altında çıktısı. Uzun çıktı
altı satıra kısaltılır; **karta tıklayın** tamamını görürsünüz, tekrar tıklayın
daralır.

Giriş hiç kilitlenmez. Asistan yanıtlarken yazmaya devam edebilirsiniz; mesajınız
kuyruğa alınır ve tur biter bitmez gönderilir.

| Tuş | İşlev |
| --- | --- |
| `Enter` | Gönder |
| `/` | Komut menüsü — yazdıkça filtreler, `↑/↓` seçer |
| `@` | Dosya bahsetme menüsü — dosyayı mesaja çip olarak ekler |
| `!komut` | Komutu doğrudan çalıştırır, modele hiç gitmez |
| `Tab` | Mod değiştir: **Build** / **Plan** |
| `Ctrl+P` | Komut paleti |
| `Ctrl+V` / `Alt+V` | Panodaki görseli mesaja ekle |
| `Esc` | Menüyü kapat · yanıtı **veya çalışan komutu** iptal et |
| `Ctrl+C` | Her yerde çalışır: panel kapatır, iptal eder ya da çıkar |
| `↑` / `↓` | Girdi geçmişi (yazdığınız taslak korunur) |
| `PgUp` / `PgDn` | Konuşmayı kaydır |
| Fare tekeri | Konuşmayı kaydır |

Metin seçmek için fareyle sürükleyin, `Ctrl+C` ile kopyalayın. Tekerleği ve
seçimi terminalinize bırakmak isterseniz `WENOX_NO_MOUSE=1` ile başlatın.

Geniş terminallerde sağda bir panel açılır: bağlam doluluğu, açık görevler, plan
limitleri ve bu oturumda değişen dosyalar. Dar terminallerde çizilmez; eşiği
config'ten (`sidebar`, `sidebarMinColumns`) ayarlarsınız.

<img src="slimbanner.png" width="100%">

## 🧰 Yetenekler

Asistan projenizde şu araçlarla çalışır:

`read_file` · `write_file` · `edit_file` · `list_dir` · `search_code` · `glob` ·
`run_command` · `code_intel` · `webfetch` · `ask_user` · `todo_write`

**`code_intel`** gerçek bir dil sunucusu kullanır:

| Dil | Sunucu | Kurulum |
| --- | --- | --- |
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server` |
| Python | `pyright-langserver` | `npm i -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |

Sunucu kurulu değilse araç bunu söyler ve nasıl kurulacağını gösterir — sessizce
başarısız olmaz.

**`ask_user`** sayesinde asistan gerçekten bir karar gerektiğinde kısa, çoktan
seçmeli bir soru sorar. Kendi cevaplayabileceği şeyler için sizi darlamaz.

**Görselleri yapıştırın.** Panodaki bir görseli `Ctrl+V` (Windows Terminal'de
`Alt+V`) ile mesaja eklersiniz: ekran görüntüleri, tasarım kareleri ve hata
resimleri doğrudan okunur. `/model` listesinde hangi modelin görsel desteği
olduğu görünür; olmayan modelde CLI uyarır.

**Büyük dosyalar parça parça yazılır.** Asistan koca bir dosyayı tek dev çıktıda
yazmaya çalışmaz: `write_file` ile başlar, `edit_file` ile bölüm bölüm ekler.
Çıktı sınırına takılıp yarıda kesilirse kaldığı yerden devam eder, yarım kalan
araç çağrısını da çalıştırmaz.

**Proje kurallarını okur.** Proje kökündeki (ve üst dizinlerdeki) `AGENTS.md`
veya `CLAUDE.md` sistem prompt'una eklenir. Elinizde yoksa `/init` projeyi
inceleyip `AGENTS.md` oluşturur.

**MCP sunucuları.** `wenox mcp add <ad> <komut> [argümanlar]` ile stdio, ya da
config'te `url` vererek HTTP üzerinden MCP sunucusu bağlarsınız; sunucunun
araçları asistanın araç listesine eklenir.

<img src="slimbanner.png" width="100%">

## 🔒 Güvenlik

- **Komutlar önce sorar.** Çalıştırma öncesi onay alınır; `-y` bunu kapatır.
- **Proje dışı önce sorar.** *Bir kez izin ver*, *Her zaman izin ver* (proje
  bazında hatırlanır) veya *Reddet* seçersiniz.
- **Güvensiz klasörler işaretlenir.** Ev dizini, sürücü kökü veya bir sistem
  klasöründe başlarsanız CLI uyarır, asistana dikkatli olmasını söyler ve
  **her** yol için izin ister — `list_dir` dahil.
- **Kendini öldüren komutlar engellenir.** Tüm Node süreçlerini öldürecek
  komutlar (`taskkill /IM node.exe`, `pkill node`, …) reddedilir; çünkü CLI'ın
  kendisi de onlardan biri.
- **`Esc` işi durdurur.** Çalışan komut, alt süreçleriyle birlikte öldürülür —
  unutulmuş bir dev server dahil.
- **İzin kurallarını siz yazarsınız.** Config'teki `permissions` listesine
  `{ "tool": "run_command", "pattern": "git *", "action": "ask" }` gibi kurallar
  koyarsınız: `deny` hiç çalıştırmaz, `allow` hiç sormaz, `ask` her seferinde
  sorar.
- **Sır dosyaları ayrı sorulur.** `.env` gibi dosyalar proje içinde olsa bile
  okuma/yazma izni ister.

<img src="slimbanner.png" width="100%">

## 🗺️ Modlar

Aktif mod durum çubuğunda görünür; `Tab` ile değiştirilir.

| Mod | Davranış |
| --- | --- |
| **Plan** — varsayılan | Salt-okunur. Yazma ve komut araçları araç listesine **hiç konmaz**; asistan denemez, engellenmez. İnceler ve plan önerir. |
| **Build** | İşi bitirmek için dosya okur, düzenler ve komut çalıştırır. |

Plan'da başlayın, asistanın ne yapmayı düşündüğünü görün, sonra `Tab` ile
Build'e geçip uygulatın. Mod her istekte ayrıca hatırlatılır, bu yüzden
geçmişteki eski konuşmalar asistanı yanıltmaz.

<img src="slimbanner.png" width="100%">

## 🌍 Diller

Arayüz Türkçe ve İngilizce; sistem dilinizden algılanır, `/lang` veya `WENOX_LANG`
ile değiştirilir.

Yalnızca arayüz çevrilir. Prompt'lar ve araç şemaları İngilizce kalır; asistan
sizin yazdığınız dilde yanıtlar.

<img src="slimbanner.png" width="100%">

## 💾 Oturumlar

Konuşmalar otomatik kaydedilir ve birkaç mesaj sonra başlık alır. Çıkışta terminal
nasıl dönüleceğini yazar:

```text
  Session   Selamlaşma
  Continue  wenox -s ses_f78edf902ffe
```

Devam ettiğinizde mesajlar, token sayacı, model, görev listesi ve çalışma dizini
geri yüklenir. `/sessions` tüm oturumları listeler ve seçtiğinizi açar;
`wenox -c` en son oturuma devam eder, `--fork` onu kopyalayıp yeni bir oturum
açar. `wenox sessions` ile terminalden listeleyip `wenox session delete <id>` ile
silebilirsiniz.

<img src="slimbanner.png" width="100%">

## ⚙️ Komutlar

Her şey oturumun içinden yönetilir — modeli, dili ya da anahtarı değiştirin,
hesabı görün, bağlamı düzenleyin. Ayarlar ortam değişkenleriyle de verilebilir:
`WENOX_API_KEY`, `WENOX_DEFAULT_MODEL`, `WENOX_LANG`, `WENOX_API_BASE_URL`,
`WENOX_REQUEST_TIMEOUT_MS`, `WENOX_DEBUG`.

| Komut | Açıklama |
| --- | --- |
| `/help` | Komutlar ve kısayollar |
| `/model` | Modeli değiştir (bağlam penceresi ve görsel desteğiyle listelenir) |
| `/lang` | Arayüz dilini değiştir |
| `/key` | API anahtarını güncelle (kaydetmeden önce doğrulanır) |
| `/me` | Hesap, plan ve limitler (5 saat / haftalık / aylık) |
| `/theme` | Tema seç |
| `/keys` | Kısayolları göster |
| `/editor` | Mesajı `$EDITOR` ile yaz |
| `/init` | Projeyi inceleyip `AGENTS.md` oluştur |
| `/compact` | Bağlamı özetle, yer aç |
| `/new` | Bağlamı temizle |
| `/sessions` | Geçmiş oturumları listele ve yükle |
| `/auto` | Oto-onayı aç/kapat |
| `/status` | Oturum durumu |
| `/exit` | Çıkış |

Plan limitleri (5 saat / haftalık / aylık) durum çubuğunda ve sağ panelde yüzde
ve yenilenme zamanıyla görünür.

<img src="slimbanner.png" width="100%">

## 🛠️ Geliştirme

TypeScript ile yazıldı ve `tsc` ile derleniyor. Yayınlanan paket derlenmiş
çıktıyı taşıdığı için kurulumda ek bir adım gerekmiyor.

```bash
npm install
npm run build   # derle
npm start       # derle, sonra CLI'ı çalıştır
```

<img src="slimbanner.png" width="100%">

## 📄 Lisans

MIT
