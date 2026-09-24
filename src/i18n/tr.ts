export default {
  common: {
    on: "açık",
    off: "kapalı",
    unknownError: "Bilinmeyen hata",
  },

  markdown: {
    image: "[görsel: {alt}]",
  },

  commands: {
    auto: "oto-onayı aç/kapat",
    compact: "bağlamı özetle (yer aç)",
    exit: "çık",
    help: "komutları göster",
    key: "API anahtarını güncelle",
    lang: "dili değiştir",
    me: "hesap ve kredi bilgisi",
    model: "modeli değiştir",
    new: "bağlamı temizle (yeni oturum)",
    sessions: "geçmiş oturumları listele",
    status: "oturum durumu",
  },

  help: {
    cliSubtitle: "— Gelişmiş Kodlama Ajanı",
    usage: "Kullanım:",
    usageLine: "wenox [seçenekler]",
    options: "Seçenekler:",
    optionLines: [
      "-m, --model <id|no>    Kullanılacak model (1: Grok 4.6, 2: GLM 5.3 Flash, 3: Big Pickle)",
      "-k, --key <anahtar>    WenOX API anahtarı (kalıcı olarak kaydedilir)",
      "-s, --session <id>     Kayıtlı bir oturuma devam et",
      "-d, --cwd <yol>        Başlangıç çalışma dizini / proje yolu",
      "-y, --auto-approve     Komutları onay sormadan otomatik çalıştır",
      "-p, --prompt <metin>   Tek seferlik komut çalıştır ve çık",
      "-v, --version          Sürümü göster",
      "-h, --help             Bu yardımı göster",
    ],
    examples: "Örnekler:",
    exampleLines: [
      "wenox",
      'wenox -p "bu projede kaç dosya var?"',
      "wenox -m 2 -y",
    ],
    tui: `Komutlar
  /help            Bu yardım
  /model           Modeli değiştir
  /key             API anahtarını güncelle
  /me              Hesap ve kredi bilgisi
  /lang            Dili değiştir
  /compact         Bağlamı özetle (yer aç)
  /new             Bağlamı temizle
  /sessions        Geçmiş oturumları listele ve yükle
  /auto            Oto-onayı aç/kapat
  /status          Oturum durumu
  /exit            Çık

Kısayollar
  /        komut menüsü     Tab     mod değiştir (Build/Plan)
  Ctrl+P   komut paleti     Esc     iptal
  PgUp/PgDn  kaydır         Ctrl+C  iptal / çıkış`,
    tableCommand: "Komut",
    tableDescription: "Açıklama",
    commandRows: [
      ["/model", "Aktif modeli değiştirir"],
      ["/key", "WenOX API anahtarını gösterir veya yenisini kaydeder"],
      ["/lang", "Arayüz dilini değiştirir"],
      ["/compact", "Bağlamı özetler ve yer açar"],
      ["/sessions", "Geçmiş oturumları başlıklarıyla listeler"],
      ["/clear", "Mevcut konuşma bağlamını ve geçmişini sıfırlar"],
      ["/history", "Mevcut konuşmadaki mesaj sayısını gösterir"],
      ["/help", "Yardım menüsünü görüntüler"],
      ["/exit, /quit", "Programı sonlandırır"],
    ],
  },

  status: {
    autoApprove: "oto-onay",
    premium: "premium",
    modeBuild: "Build",
    modePlan: "Plan",
    keysHint: "tab mod   ctrl+p ",
    commands: "komutlar",
    imageHint: "ctrl+v görsel   ",
    credits: "Credits: ",
    noCredits: "—",
  },

  images: {
    reading: "Görsel alınıyor…",
    noVision: "Seçili model görsel desteklemiyor ({model}). /model ile değiştirebilirsin.",
    none: "Panoda görsel yok.",
    added: "{count} görsel eklendi.",
    tooLarge: "Görsel çok büyük (en fazla {mb} MB).",
    readFailed: "Görsel okunamadı.",
  approval: {
    title: "Model bir komut çalıştırmak istiyor",
    hint: "←/→ veya Tab: seç    ·    Enter: onayla    ·    Esc: reddet",
  },

  permission: {
    title: "İzin gerekli",
    accessExternal: "← Proje dışındaki dizine erişim: {path}",
    patterns: "Kalıplar",
    allowOnce: "Bir kez izin ver",
    allowAlways: "Her zaman izin ver",
    reject: "Reddet",
    hint: "←/→ seç    ·    Enter onayla    ·    Esc reddet",
    prompt: "İzin verilsin mi? [b]ir kez / [h]er zaman / [r]eddet: ",
  },

  question: {
    own: "Kendi cevabını yaz",
    hintSelect: "↑↓ seç    enter gönder    esc kapat",
    hintType: "cevabını yaz  ·  enter gönder  ·  esc geri",
  },

  working: {
    cancel: "iptal et",
  },

  logo: {
    product: "WenOX AI CLI",
    tagline: "  ·  Gelişmiş Kodlama Ajanı",
  },

  input: {
    keyPrefix: "API anahtarı",
    answerPrefix: "Cevabınız",
  },

  paste: {
    label: "[~{lines} satır yapıştırıldı]",
  },

  lang: {
    selected: "Dil: {name}",
    title: "Dil seç",
  },

  menu: {
    hint: "↑/↓ gez    ·    Enter seç    ·    Esc kapat",
  },

  session: {
    loaded: "Oturum yüklendi: {name}",
    notFound: "Oturum bulunamadı: {id}",
    untitled: "(başlıksız)",
    none: "Kayıtlı oturum yok.",
    past: "Geçmiş oturumlar:",
    pastHint: "Devam etmek için: wenox -s <id>",
  },

  context: {
    warning: "⚠️  Bağlam dolmaya yaklaşıyor (~%{pct}). /compact ile özetleyip yer açabilirsiniz.",
    cleared: "Bağlam temizlendi. Yeni oturum hazır.",
    messages: "Şu anki bağlamda {count} mesaj bulunuyor.",
    chatCleared: "Sohbet geçmişi temizlendi.",
  },

  compact: {
    running: "Bağlam özetleniyor…",
    busy: "Şu an bir işlem sürüyor. Bitince /compact deneyin.",
    empty: "Özetlenecek konuşma yok.",
    summarized: "Bağlam özetlendi, yer açıldı.",
    auto: "⚠️  Bağlam dolmak üzere — otomatik özetleniyor…",
    done: "Bağlam özetlendi, yer açıldı.\n\n{summary}",
    failed: "Özetleme başarısız: {message}",
  },

  models: {
    fetchFailed: "Modeller çekilemedi, yerleşik liste kullanılıyor.",
    head: ["No", "Model Adı", "Model ID", "Açıklama", "Durum"],
    active: "✓ Aktif",
    unknown: "Bilinmeyen Model",
    custom: "Özel Model",
    contextWindow: "{k}K bağlam",
  },

  auto: {
    on: "Oto-onay açık.",
    off: "Oto-onay kapalı.",
  },

  statusLine:
    "Model: {model}  ·  Dizin: {cwd}  ·  Oto-onay: {auto}  ·  Mesaj: {count}",

  notices: {
    unknownCommand: "Bilinmeyen komut: /{cmd}",
    apiKeyUpdated: "API anahtarı güncellendi.",
    apiKeyAccount: "{name} olarak giriş yapıldı",
    queueCleared: "Kuyruk temizlendi.",
    commandRejected: "Komut reddedildi.",
    modelSelected: "Model: {name}",
    modeChanged: "Mod: {mode}",
    copied: "Panoya kopyalandı",
    unsafeDir:
      "⚠️  Şu an bir proje dizininde değilsin gibi görünüyor: {cwd}\nDikkatli ol — ajan buradaki dosyaları okuyabilir ve dokunduğu her yol için izin ister. Bir proje klasörüne geçmen önerilir.",
    errorPrefix: "Hata: {message}",
  },

  ask: {
    noInterface: "(soru sorulamadı)",
    notAnswered: "(yanıt verilmedi)",
    closed: "(kullanıcı soruyu kapattı)",
    prompt: "Numara seçin veya kendi cevabınızı yazın: ",
    retry: "İşlem iptal edildi. Çıkmak için /exit yazabilirsiniz.",
  },

  tool: {
    read: "okundu ({count} satır)",
    written: "yazıldı",
    updated: "güncellendi",
    items: "{count} öğe",
    matches: "{count} eşleşme",
    exitCode: "çıkış kodu {code}",
    noOutput: "(çıktı yok)",
    running: "çalışıyor…",
    expandHint: "… +{count} satır daha  ·  genişletmek için tıkla",
    collapseHint: "… daraltmak için tıkla",
    results: "{count} sonuç",
    done: "tamamlandı",
    error: "hata",
    readTotal: "↳ Başarıyla okundu ({count} toplam satır)",
    itemsListed: "↳ {count} öğe listelendi",
    matchesFound: "↳ {count} eşleşme bulundu",
    output: "Çıktı:",
    errorOutput: "Hata Çıktısı:",
    exitCodeLine: "Çıkış Kodu: {code}",
    resultTitle: "Komut Sonucu",
    applyingChange: "(Değişiklik yapılıyor)",
    searchingFor: "Aranan:",
    linesSuffix: "({count} satır)",
    rangeEnd: "son",
  },

  view: {
    thinking: "+ Düşünen: {ms}ms",
    thought: "Düşündü: {time}",
    thinkingLive: "Düşünüyor",
    build: "▣ Build · {model}{seconds}",
    questionAsked: "→ Soru soruldu",
    answer: "  ↳ Cevap: {answer}",
    queued: " KUYRUKTA ",
  },

  boot: {
    steps: [
      "Sistemler hazırlanıyor",
      "Çekirdek modüller yükleniyor",
      "API bağlantısı doğrulanıyor",
      "Yapay zeka modelleri senkronize ediliyor",
      "Terminal arayüzü hazırlanıyor",
    ],
    ready: "✓ Sistemler hazır!",
    opening: "   Yazma alanı açılıyor…",
  },

  banner: {
    tagline: "  —  Gelişmiş Kodlama Ajanı",
    apiEndpoint: "API Uç Noktası:",
    activeModel: "Aktif Model:   ",
    activeDir: "Aktif Dizin:   ",
    sessionLabel: "Oturum:        ",
    ready: "Hazır ve dinleniyor",
    commandsTitle: "Kullanabileceğiniz Komutlar:",
    hint: "✎  Bir şey yaz ve Enter'a bas — WenOX dinlemede!",
    windowTitle: "◆ WenOX Terminal",
    windowSubtitle: "● Sistemler Aktif — Yazma Alanı Hazır",
    commandRows: [
      ["/model", "Modeli değiştir"],
      ["/lang", "Dili değiştir"],
      ["/key", "API anahtarını güncelle"],
      ["/compact", "Bağlamı özetle (yer aç)"],
      ["/sessions", "Geçmiş oturumları listele"],
      ["/clear", "Sohbet geçmişini temizle"],
      ["/help", "Yardım ekranını göster"],
      ["/exit", "Çıkış yap"],
    ],
  },

  assistant: {
    name: "◆ WenOX Asistan",
    typing: "— yazıyor… (ESC iptal)",
  },

  sink: {
    thinking: "Model düşünüyor...",
    approvalTitle: "⚠️  Model şu komutu çalıştırmak istiyor:",
    approvalPrompt: "Bu komutun çalıştırılmasına izin veriyor musunuz? [e/H]: ",
  },

  repl: {
    modelPrompt: "\nGeçmek istediğiniz model numarası veya ID (İptal için Enter): ",
    modelChanged: "Aktif model değiştirildi: {name} ({id})",
    currentKey: "Mevcut API Anahtarı: {key}",
    newKey: "Yeni API anahtarınızı girin (Değiştirmemek için Enter): ",
    keyUpdated: "API anahtarı başarıyla güncellendi ve kaydedildi.",
    goodbye: "Görüşmek üzere! WenOX CLI sonlandırıldı.",
  },

  cli: {
    mcpFailed: "MCP sunucusuna bağlanılamadı — {message}",
    argError: "Argüman hatası: {message}",
    unexpectedError: "Beklenmeyen hata: {message}",
  },

  onboarding: {
    needKey: "WenOX AI'yı kullanmak için bir API anahtarı gerekir.",
    getKeyHere: "API anahtarını buradan al: {url}",
    openHint: "Boş kutuda Enter = sayfayı tarayıcıda aç",
    openFailed: "Tarayıcı açılamadı. Şu adresi elle aç: {url}",
    opening: "Sayfa tarayıcıda açılıyor…",
    verifying: "Anahtar doğrulanıyor…",
    invalid: "Geçersiz API anahtarı. Kontrol edip tekrar dene.",
    network: "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
    serverError: "Sunucu şu an yanıt vermiyor. Kısa süre sonra tekrar dene.",
    chooseLanguage: "Arayüz dili",
    langHint: "↑/↓ seç    ·    Enter onayla",
    verifyHint: "Enter ile anahtarı doğrula",
    continueHint: "Devam etmek için Enter'a bas",
    welcomeNamed: "Merhaba {name}, WenOX CLI'a hoş geldin!",
    welcomeAnon: "WenOX CLI'a hoş geldin!",
    premiumDays: "Görünüşe göre aktif bir aboneliğin var — {days} günün kalmış.",
    premium: "Görünüşe göre aktif bir aboneliğin var.",
    noPremium: "Görünüşe göre aktif bir aboneliğin yok.",
    credits: "Kalan kredi: {credits}",
    noTty: "API anahtarı bulunamadı. Etkileşimli çalıştırın veya --key ya da WENOX_API_KEY ile verin.",
  },

  account: {
    failed: "Hesap bilgisi alınamadı.",
    name: "Ad:       ",
    email: "E-posta:  ",
    credits: "Kredi:    ",
    premiumYes: "Premium:  evet",
    premiumNo: "Premium:  hayır",
    daysLeft: " ({days} gün kaldı)",
  },

  agent: {
    thinking: "{model} düşünüyor...",
    cancelled: "⚠️  ESC ile iptal edildi — işlem durduruldu.",
    cancelledTools: "⚠️  ESC ile iptal — kalan araçlar atlandı.",
    turnLimit:
      "⚠️ Bu adım için araç çağırma tur limitine ({max}) ulaşıldı. Kalan işleme devam etmek için 'devam et' yazabilirsiniz.",
    authError: "❌ Geçersiz veya yetkisiz WenOX API Anahtarı.",
    authHint: "Anahtarı '/key' komutu ile güncelleyebilirsiniz.",
    rateLimit: "❌ İstek limiti aşıldı (Rate Limit). Lütfen biraz bekleyip tekrar deneyin.",
    timeout: "❌ İstek zaman aşımına uğradı — sunucu {seconds} sn içinde yanıt vermedi. Tekrar deneyin.",
    connection: "❌ API sunucusuna bağlanılamadı ({url}). İnternet bağlantınızı kontrol edin.",
    apiError: "❌ API Hatası (Kod: {status}): {message}",
    unknownError: "❌ Beklenmeyen bir hata oluştu: {message}",
    fallback: "Selam! Ben WenOX AI. Sana nasıl yardımcı olabilirim?",
  },

  update: {
    title: "Güncelleme gerekli",
    installed: "Kurulu     ",
    available: "Güncel     ",
    body: "Bu sürüm artık desteklenmiyor.",
    hint: "Güncelledikten sonra yeniden başlat    ·    Q çık",
    forced: "Kurulu sürüm v{current}, güncel sürüm v{latest}. Bu sürüm artık desteklenmiyor.",
  },

  modelDescriptions: {
    "grok-4.6": "xAI tarafından geliştirilmiş güçlü mantık ve kodlama modeli",
    "z-ai/glm-5.3-flash": "Çok hızlı yanıt veren hafif ve optimize kodlama modeli",
    "big-pickle": "Gelişmiş problem çözme ve büyük bağlam modeli",
  },
};
