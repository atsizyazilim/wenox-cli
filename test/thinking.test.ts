import { test } from "node:test";
import assert from "node:assert/strict";

const { createThinkingFilter, stripThinking } = await import("../src/thinking.js");

const feed = (chunks: string[]): string => {
  const filter = createThinkingFilter();
  let out = "";
  for (const chunk of chunks) out += filter.push(chunk);
  out += filter.flush();
  return out;
};

test("düşünme bloğu olmayan metin aynen geçer", () => {
  assert.equal(stripThinking("Selam! Nasılsın?"), "Selam! Nasılsın?");
  assert.equal(feed(["Selam", "! Nasıl", "sın?"]), "Selam! Nasılsın?");
});

test("tek parça gelen blok silinir, cevap kalır", () => {
  const text = '<think>kullanıcı selam dedi, Türkçe cevap vereyim</think>\n\nSelam! 😊';
  assert.equal(stripThinking(text), "Selam! 😊");
});

test("blok akış ortasında bölünse de silinir", () => {
  const chunks = [
    "<thi",
    "nk>kullanıcı se",
    "lam dedi</thi",
    "nk>\n\nSel",
    "am! 😊",
  ];
  assert.equal(feed(chunks), "Selam! 😊");
});

test("etiket tek karakterlik parçalara bölünse de silinir", () => {
  const text = "<think>gizli</think>Görünür";
  assert.equal(feed(text.split("")), "Görünür");
});

test("kapanmayan blok atılır", () => {
  assert.equal(feed(["Selam", "<think>hâlâ düşünüyorum"]), "Selam");
  assert.equal(stripThinking("<think>yarım kaldı"), "");
});

// MiniMax, uzun sistem promptuyla bloğu açıp kapatmayı unutuyor ve cevabı
// bloğun içine yazıyor. O durumda cevabı tamamen atmak yerine kurtarıyoruz.
test("kapanmayan blokta cevap kurtarılır", () => {
  const raw = "<think>Kullanıcı selam dedi.\n\n\nSelam! 👋\n\nNasıl yardımcı olabilirim?";
  assert.equal(stripThinking(raw), "Selam! 👋\n\nNasıl yardımcı olabilirim?");
  assert.equal(feed(raw.split("")), "Selam! 👋\n\nNasıl yardımcı olabilirim?");
});

test("kapanmayan blokta paragraf kırılımı yoksa hepsi düşünmedir", () => {
  assert.equal(stripThinking("<think>tek paragraflık düşünme"), "");
});

// Asıl mesele bu: cevap flush'ı beklemeden, kırılım görülür görülmez akmalı.
test("kapanmayan blokta cevap akış sırasında akmaya başlar", () => {
  const filter = createThinkingFilter();
  let out = filter.push("<think>düşünüyorum");
  assert.equal(out, "", "düşünme sürerken hiçbir şey gösterilmez");

  out += filter.push("\n\nSelam");
  assert.equal(out, "Selam", "kırılım görülür görülmez cevap akar");

  out += filter.push(" dünya");
  assert.equal(out, "Selam dünya", "sonrası normal akar");
  assert.equal(filter.flush(), "", "flush'ta eklenecek bir şey kalmamalı");
});

test("paragraf kırılımıyla biten blokta sonradan gelen kapanış etiketi yutulur", () => {
  assert.equal(stripThinking("<think>düşünme\n\nCevap</think>"), "Cevap");
  assert.equal(feed(["<think>düşünme\n\nCevap</thi", "nk>"]), "Cevap");
});

test("<thinking> biçimi de desteklenir", () => {
  assert.equal(stripThinking("<thinking>gizli</thinking>Görünür"), "Görünür");
  assert.equal(feed(["<thinking>giz", "li</thinking>", "Görünür"]), "Görünür");
});

test("bloktan önceki ve sonraki metin korunur", () => {
  assert.equal(stripThinking("Önce <think>gizli</think> Sonra"), "Önce  Sonra");
});

test("arkasında düşünme olmayan < işareti yutulmaz", () => {
  assert.equal(feed(["a <", "b> c"]), "a <b> c");
  assert.equal(feed(["<th"]), "<th");
});

test("blok sonrası baştaki boşluk kırpılır", () => {
  assert.equal(stripThinking("<think>x</think>\n\n\nCevap"), "Cevap");
});

test("iki blok üst üste gelirse ikisi de silinir", () => {
  assert.equal(stripThinking("<think>bir</think>Orta<think>iki</think>Son"), "OrtaSon");
});
