// Phonetic Hinglish transliteration for the Hindi PDF: writes English words the way
// they sound in Devanagari script (e.g. "Toughened Glass" → "टफ़ेंड ग्लास"), instead
// of translating their meaning (which would give something like "कड़ा हुआ ग्लास").
// Uses Google's public transliteration endpoint (same tech behind Google Input Tools).
// Only meant for short, user-typed strings (scope descriptions, milestone types, terms) —
// never for names, addresses, codes, or numbers, which must stay as entered.

const cache = new Map<string, string>();

// Short all-caps tokens are units/abbreviations/codes (MM, GST, PAN, RA, TDS…) —
// transliterating them phonetically would make them unreadable, so leave as-is.
const KEEP_AS_IS = /^[A-Z]{1,4}$/;

async function transliterateWord(word: string): Promise<string> {
  if (KEEP_AS_IS.test(word)) return word;
  if (cache.has(word)) return cache.get(word)!;

  try {
    const res = await fetch(
      `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`
    );
    const data = await res.json();
    const candidate: string | undefined = data?.[1]?.[0]?.[1]?.[0];
    const result = data?.[0] === "SUCCESS" && candidate ? candidate : word;
    cache.set(word, result);
    return result;
  } catch {
    return word;
  }
}

// Splits on alphabetic word runs, transliterating only those and leaving numbers,
// punctuation, and whitespace exactly as they were.
async function transliterateOne(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const parts = text.split(/([A-Za-z]+)/);
  const rebuilt = await Promise.all(
    parts.map((part, i) => (i % 2 === 1 ? transliterateWord(part) : Promise.resolve(part)))
  );
  return rebuilt.join("");
}

export async function translateToHindi(text?: string): Promise<string> {
  if (!text) return "";
  return transliterateOne(text);
}

export async function translateManyToHindi(texts: (string | undefined)[]): Promise<string[]> {
  return Promise.all(texts.map(t => translateToHindi(t)));
}
