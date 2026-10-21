const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// Lite first: reading a PAN/Aadhaar needs no heavy reasoning, and it answers in
// ~1-2s where gemini-flash-latest was measured at minutes during demand spikes.
const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_MEDIA = ['image/jpeg', 'image/jpg', 'image/png'];
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;

const SCHEMAS = {
  pan: {
    type: SchemaType.OBJECT,
    properties: {
      panNumber: { type: SchemaType.STRING },
      name:      { type: SchemaType.STRING },
    },
    required: ['panNumber', 'name'],
  },
  aadhaar: {
    type: SchemaType.OBJECT,
    properties: {
      aadhaarNumber: { type: SchemaType.STRING },
      name:          { type: SchemaType.STRING },
    },
    required: ['aadhaarNumber', 'name'],
  },
};

const PROMPTS = {
  pan: 'This is an Indian PAN card. Read the PAN number (10 characters: 5 letters, 4 digits, 1 letter) and the cardholder name (the line under "Name", not the father\'s name). If a value is not clearly legible, return an empty string — never guess.',
  aadhaar: 'This is an Indian Aadhaar card. Read the 12-digit Aadhaar number (not the 16-digit VID) and the cardholder name. If a value is not clearly legible, return an empty string — never guess.',
};

// Reads a PAN / Aadhaar image with Gemini and returns only values that pass
// the same format checks the registration form enforces — an unreadable or
// malformed read comes back as an empty string so the user just types it.
async function extractIdDocument(type, documentUrl) {
  if (!process.env.GEMINI_API_KEY) return { error: 'Auto-fill is not configured on the server.' };

  let resp;
  try {
    resp = await fetch(documentUrl);
  } catch {
    return { error: "Couldn't download the uploaded document." };
  }
  if (!resp.ok) return { error: `Couldn't download the uploaded document (HTTP ${resp.status}).` };
  const mediaType = (resp.headers.get('content-type') || '').split(';')[0].trim();
  if (!ALLOWED_MEDIA.includes(mediaType)) return { error: 'Auto-fill works only with JPG or PNG images.' };
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_BYTES) return { error: 'Image is too large for auto-fill.' };

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const parts = [
    { inlineData: { data: buf.toString('base64'), mimeType: mediaType } },
    { text: PROMPTS[type] },
  ];

  // Gemini regularly answers 503 "high demand" / 429 in spikes, so retry once
  // on the same model and then fall through to the next one before giving up.
  let parsed = null;
  let lastErr = null;
  for (const modelName of MODELS) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMAS[type] },
    });
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const result = await model.generateContent(parts, { timeout: 12000 });
        parsed = JSON.parse(result.response.text());
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (parsed) break;
  }
  if (!parsed) {
    console.error('[ocrIdDocument] all Gemini attempts failed:', lastErr?.message);
    return { error: 'Auto-fill is busy right now — please enter the details manually.' };
  }

  const name = String(parsed.name || '').trim();
  if (type === 'pan') {
    const pan = String(parsed.panNumber || '').replace(/\s/g, '').toUpperCase();
    return { panNumber: PAN_RE.test(pan) ? pan : '', name };
  }
  const aadhaar = String(parsed.aadhaarNumber || '').replace(/\D/g, '');
  return { aadhaarNumber: AADHAAR_RE.test(aadhaar) ? aadhaar : '', name };
}

module.exports = { extractIdDocument };
