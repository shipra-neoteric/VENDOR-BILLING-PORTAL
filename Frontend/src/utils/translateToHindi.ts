// Lightweight free-text → Hindi translator using the free MyMemory API (no key required).
// Only meant for short, user-typed strings (scope descriptions, milestone types, terms) —
// never for names, addresses, codes, or numbers, which must stay as entered.

const cache = new Map<string, string>();

async function translateOne(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (cache.has(trimmed)) return cache.get(trimmed)!;

  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=en|hi`
    );
    const data = await res.json();
    const translated: string | undefined = data?.responseData?.translatedText;
    const result = translated && data?.responseStatus === 200 ? translated : text;
    cache.set(trimmed, result);
    return result;
  } catch {
    return text;
  }
}

// MyMemory's translation quality drops on very long inputs, so split long text into
// sentences and translate each separately, then rejoin.
export async function translateToHindi(text?: string): Promise<string> {
  if (!text) return "";
  if (text.length <= 400) return translateOne(text);

  const sentences = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const parts = await Promise.all(sentences.map(s => translateOne(s)));
  return parts.join(" ");
}

export async function translateManyToHindi(texts: (string | undefined)[]): Promise<string[]> {
  return Promise.all(texts.map(t => translateToHindi(t)));
}
