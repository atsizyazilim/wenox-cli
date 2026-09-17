// Modeller düşünme bloğunu cevabın İÇİNE gömüyor (`<think>…</think>`), ayrı bir
// alanda değil. Bu metin kullanıcıya gösterilmemeli ve sonraki turlara da
// taşınmamalı: hem gürültü hem boşa token.
//
// Akışlı okunduğu için düz bir `replace` yetmez — etiket iki chunk arasında
// bölünebilir, o yüzden sınırda bekleyen bir tampon tutuluyor.
//
// MiniMax (uzun sistem promptuyla) bloğu açıp KAPATMAYI unutuyor ve cevabı
// bloğun içine yazıyor:
//
//     <think>Kullanıcı selam dedi.\n\n\nSelam! 👋 …
//
// Kapanış hiç gelmediği için cevabı beklemek akışı öldürürdü. Bu yüzden blok
// içindeyken ilk paragraf kırılımı "düşünme bitti" işareti sayılıyor ve cevap
// oradan itibaren akmaya başlıyor — flush beklenmiyor.

const MARKER_NAMES = ["think", "thinking"] as const;
const OPEN_TAGS: readonly string[] = MARKER_NAMES.map((name) => `<${name}>`);
const CLOSE_TAGS: readonly string[] = MARKER_NAMES.map((name) => `</${name}>`);
const BLANK_LINE = /\n[ \t]*\n/;

// Tamponun sonundaki, etiketlerden birinin öneki olan en uzun parça. Bir sonraki
// chunk'ı beklemek için tutulur; gerisi güvenle işlenebilir.
function partialTagSuffix(buffer: string, tags: readonly string[]): string {
  const longest = Math.max(...tags.map((tag) => tag.length)) - 1;
  const max = Math.min(buffer.length, longest);
  for (let length = max; length > 0; length -= 1) {
    const suffix = buffer.slice(buffer.length - length);
    if (tags.some((tag) => tag.startsWith(suffix))) return suffix;
  }
  return "";
}

function earliestTag(
  buffer: string,
  tags: readonly string[],
): { index: number; tag: string } | null {
  let best: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const index = buffer.indexOf(tag);
    if (index !== -1 && (best === null || index < best.index)) best = { index, tag };
  }
  return best;
}

export interface ThinkingFilter {
  push(chunk: string): string;
  flush(): string;
}

export function createThinkingFilter(): ThinkingFilter {
  let buffer = "";
  let hidden = "";
  let inside = false;
  let atStart = true;
  // Paragraf kırılımıyla kapatıldıysa, sonradan gelen kapanış etiketi artıktır.
  let implicitClose = false;

  // Cevabın başındaki boşluk kırpılır: blok silinince geriye `\n\n` kalıyor.
  const emit = (text: string): string => {
    if (!text) return "";
    if (!atStart) return text;
    const trimmed = text.replace(/^\s+/, "");
    if (trimmed) atStart = false;
    return trimmed;
  };

  return {
    push(chunk: string): string {
      buffer += chunk;
      let out = "";
      for (;;) {
        if (!inside) {
          const found = earliestTag(buffer, OPEN_TAGS);
          if (found) {
            out += emit(buffer.slice(0, found.index));
            buffer = buffer.slice(found.index + found.tag.length);
            hidden = "";
            inside = true;
            continue;
          }

          // Yalnızca blok içindeyken tutulan etiketlerin önekleri.
          const waitFor = implicitClose ? [...OPEN_TAGS, ...CLOSE_TAGS] : OPEN_TAGS;
          const keep = partialTagSuffix(buffer, waitFor);

          if (implicitClose) {
            const stray = earliestTag(buffer.slice(0, buffer.length - keep.length), CLOSE_TAGS);
            if (stray && stray.index === 0) {
              buffer = buffer.slice(stray.tag.length);
              continue;
            }
          }

          out += emit(buffer.slice(0, buffer.length - keep.length));
          buffer = keep;
          return out;
        }

        const close = earliestTag(buffer, CLOSE_TAGS);
        // Kapanış etiketi varsa düşünme orada biter; yoksa olası yarım etiket
        // bir sonraki chunk'a bırakılır.
        const keep = close ? "" : partialTagSuffix(buffer, CLOSE_TAGS);
        const take = close ? close.index : buffer.length - keep.length;
        hidden += buffer.slice(0, take);
        buffer = buffer.slice(take);

        const breakAt = hidden.search(BLANK_LINE);
        if (breakAt !== -1) {
          // Kapanış etiketi yok ama düşünme bitti: cevap buradan akmaya başlar.
          const answer = hidden.slice(breakAt);
          hidden = "";
          inside = false;
          if (close) buffer = buffer.slice(close.tag.length);
          else implicitClose = true;
          out += emit(answer);
          continue;
        }

        if (close) {
          buffer = buffer.slice(close.tag.length);
          hidden = "";
          inside = false;
          continue;
        }
        return out;
      }
    },

    flush(): string {
      if (inside) {
        // Hiç paragraf kırılımı görülmedi: tamamı düşünme metni.
        inside = false;
        hidden = "";
        buffer = "";
        return "";
      }

      let rest = buffer;
      buffer = "";
      hidden = "";

      // Blok paragraf kırılımıyla bittiyse, sonradan gelen kapanış etiketi
      // (yarım kalmışsa öneki) cevaba karışmamalı.
      if (implicitClose) {
        const stray = earliestTag(rest, CLOSE_TAGS);
        if (stray) rest = rest.slice(0, stray.index) + rest.slice(stray.index + stray.tag.length);
        const tail = partialTagSuffix(rest, CLOSE_TAGS);
        rest = rest.slice(0, rest.length - tail.length);
      }

      return emit(rest);
    },
  };
}

// Akışsız tek seferlik yanıtlar için (başlık, özet).
export function stripThinking(text: string): string {
  let out = "";
  const filter = createThinkingFilter();
  out += filter.push(text);
  out += filter.flush();
  return out;
}
