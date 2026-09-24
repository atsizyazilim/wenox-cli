import { countTokens } from "gpt-tokenizer";

// Token sayımı: API `usage` döndürdüğü sürece onu kullanıyoruz (tek doğru kaynak).
// Yalnızca usage gelmediğinde (bazı sağlayıcılar `stream_options` desteklemiyor)
// buradaki gerçek tokenizer devreye giriyor — `karakter/4` gibi kaba bir tahmin
// Türkçe metinde iki kata kadar yanılıyordu.

export function tokenCount(text: string | null | undefined): number {
  const value = String(text ?? "");
  if (!value) return 0;
  try {
    return countTokens(value);
  } catch {
    return Math.ceil(value.length / 4);
  }
}

// Sohbet mesajları: metin tokenları + OpenAI biçimindeki mesaj başına sabit yük.
const PER_MESSAGE_OVERHEAD = 4;

export function messagesTokenCount(
  messages: { content?: unknown }[] | null | undefined,
  perMessageOverhead = PER_MESSAGE_OVERHEAD,
): number {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((total, message) => {
    const text = typeof message?.content === "string" ? message.content : "";
    return total + tokenCount(text) + perMessageOverhead;
  }, 0);
}
