const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');

const MAX_DOC_BYTES = 8 * 1024 * 1024; // matches DocumentsUpload's own combined-attachment ceiling

const EXTRACT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    scopeOfWork: {
      type: SchemaType.STRING,
      description: 'A concise 2-4 sentence plain-English summary of the overall scope of work described in the document.',
    },
    totalTenure: {
      type: SchemaType.STRING,
      description: "Overall time allotted to complete the work, exactly as it would be written on a form, e.g. '45 Days', '3 Months'. Empty string if not mentioned.",
    },
    issueDate: {
      type: SchemaType.STRING,
      description: 'The work order / contract issue date in YYYY-MM-DD format, if mentioned. Empty string if not found.',
    },
    retentionPercent: {
      type: SchemaType.NUMBER,
      description: 'Retention / security hold percentage withheld from each bill until completion, as a plain number (e.g. 5 for 5%). 0 if not mentioned.',
    },
    gstPercent: {
      type: SchemaType.NUMBER,
      description: 'GST percentage applicable, as a plain number (e.g. 18). Default to 18 if the document does not specify one.',
    },
    warrantyTerms: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Warranty, guarantee, and defect-liability-period clauses — one clear sentence per array entry.',
    },
    specialConditions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Penalty, insurance, safety, mobilization, and other special or risk clauses — one clear sentence per array entry.',
    },
    scopeItems: {
      type: SchemaType.ARRAY,
      description: 'The BOQ / bill of quantities line items found in the document.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          unit: { type: SchemaType.STRING, description: "Unit of measure exactly as written, e.g. 'sq.ft', 'Nos', 'R.Mt', 'Kg'." },
          plannedQty: { type: SchemaType.NUMBER },
          rate: { type: SchemaType.NUMBER, description: 'Rate per unit in INR, if mentioned.' },
        },
        required: ['description'],
      },
    },
    paymentMilestones: {
      type: SchemaType.ARRAY,
      description: 'The payment schedule / milestones found in the document (e.g. mobilization advance, stage-wise payments, retention release).',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          stage: { type: SchemaType.STRING, description: "Short label, e.g. 'Mobilization Advance', 'On Completion of Plinth'." },
          type: { type: SchemaType.STRING, description: 'A slightly longer description of exactly when this payment is due.' },
          amountPercent: { type: SchemaType.NUMBER, description: 'Percentage of contract value, if the milestone is expressed as a percent.' },
          amount: { type: SchemaType.NUMBER, description: 'Fixed rupee amount, if the milestone is expressed as a flat figure rather than a percent.' },
        },
        required: ['stage'],
      },
    },
    extractionNotes: {
      type: SchemaType.STRING,
      description: 'Any caveats, ambiguous figures, or clauses you were not confident about — surfaced to the reviewer to double-check. Empty string if none.',
    },
  },
  required: ['scopeOfWork', 'scopeItems'],
};

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

// POST /api/ai/extract-work-order — { documentBase64, fileName }
exports.extractWorkOrderDocument = asyncHandler(async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return badRequest(res, 'AI extraction is not configured — GEMINI_API_KEY is missing on the server.');
  }

  const { documentBase64, fileName } = req.body;
  if (!documentBase64) return badRequest(res, 'documentBase64 is required');

  const parsed = parseDataUrl(documentBase64);
  if (!parsed) return badRequest(res, 'documentBase64 must be a data URL (data:<type>;base64,<payload>)');

  const isPdf   = parsed.mediaType === 'application/pdf';
  const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(parsed.mediaType);
  if (!isPdf && !isImage) {
    return badRequest(res, `AI extraction only supports PDF or image (JPG/PNG) files right now — "${fileName || 'this file'}" is ${parsed.mediaType}.`);
  }

  const approxBytes = (parsed.base64.length * 3) / 4;
  if (approxBytes > MAX_DOC_BYTES) {
    return badRequest(res, 'Document is too large for AI extraction.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: EXTRACT_SCHEMA,
    },
  });

  let result;
  try {
    result = await model.generateContent([
      { inlineData: { data: parsed.base64, mimeType: parsed.mediaType } },
      {
        text: `This is a construction work order / contract / tender / BOQ document${fileName ? ` named "${fileName}"` : ''}. Extract its details as JSON matching the given schema. If a field genuinely isn't present in the document, use an empty string, empty array, or 0 as appropriate — never invent figures that aren't actually written in the document.`,
      },
    ]);
  } catch (err) {
    const msg = err?.message || 'AI extraction request failed';
    return badRequest(res, `AI extraction failed: ${msg}`);
  }

  let extracted;
  try {
    extracted = JSON.parse(result.response.text());
  } catch {
    return badRequest(res, 'AI did not return valid structured data — try again.');
  }

  success(res, { extracted }, 'Document analyzed');
});
