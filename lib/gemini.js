const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    document_type: {
      type: "STRING",
      description: "receipt | invoice | quotation | bill | unknown",
    },
    store_name: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true, description: "As printed / written, or ISO format if clearly readable" },
    time: { type: "STRING", nullable: true },
    currency: { type: "STRING", nullable: true, description: "e.g. LAK, THB, USD, CNY" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          raw_text: { type: "STRING", description: "Exact text as it appears on the bill for this line item" },
          name: { type: "STRING", nullable: true, description: "Best-guess cleaned product name" },
          quantity: { type: "NUMBER", nullable: true },
          unit_price: { type: "NUMBER", nullable: true },
          total_price: { type: "NUMBER", nullable: true },
          confidence: { type: "STRING", description: "high | medium | low" },
          note: { type: "STRING", nullable: true, description: "Why this line is uncertain, if applicable" },
        },
        required: ["raw_text", "confidence"],
      },
    },
    grand_total: { type: "NUMBER", nullable: true },
    uncertain_fields: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Plain-language list of anything unclear that a human should confirm instead of the system guessing",
    },
  },
  required: ["document_type", "items", "uncertain_fields"],
};

const SYSTEM_PROMPT = `You are a meticulous OCR and data-extraction assistant specialized in reading receipts,
POS bills, handwritten bills, invoices, and quotations from shops in Laos and the wider region.
Documents may be printed (POS/thermal printer) or handwritten, and may mix Lao, Thai, English, and Chinese text,
sometimes in the same document.

Extract, for the document as a whole:
- document_type
- store_name (shop / vendor name)
- date
- time
- currency (infer from symbols/text if possible, e.g. ₭ / LAK, ฿ / THB, $ / USD, ¥ / CNY)
- grand_total

For EACH line item, extract:
- raw_text: copy the line exactly as it appears (do not translate or "clean up" this field)
- name: your best-guess cleaned/normalized product name (keep original language, don't translate)
- quantity
- unit_price
- total_price
- confidence: "high" if you are confident, "medium" if partly legible, "low" if you are guessing
- note: briefly explain why, ONLY if confidence is medium or low

CRITICAL RULES:
1. Never fabricate or guess a number or name just to fill a field. If something is illegible, cut off,
   smudged, or ambiguous (common with handwriting), set that field to null and add a short, specific,
   human-readable description of what is unclear to "uncertain_fields" (e.g. "ຕົວເລກລາຄາແຖວທີ 3 ອ່ານບໍ່ອອກ,
   ອາດແມ່ນ 15,000 ຫຼື 45,000 ກີບ").
2. If handwriting is ambiguous between two plausible readings, do not silently pick one — flag it in
   uncertain_fields and set confidence to "low" for that item.
3. Keep item names in the language/script they were written in on the bill. Do not translate.
4. quantity, unit_price and total_price must be plain numbers (no currency symbols, no thousands separators).
5. If unit_price is missing but quantity and total_price are present (or vice versa), you may compute the
   missing one ONLY if the arithmetic is unambiguous; otherwise leave it null and flag it.
6. Respond ONLY with JSON matching the provided schema. No extra commentary.`;

async function analyzeReceiptImage({ base64Data, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ບໍ່ໄດ້ຖືກຕັ້ງຄ່າໃນ .env");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: "ອ່ານ ແລະ ວິເຄາະໃບບິນນີ້ຕາມ schema ທີ່ກຳນົດ." },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini ບໍ່ໄດ້ສົ່ງຂໍ້ມູນກັບມາ (ອາດຖືກບລັອກໂດຍ safety filter ຫຼື ຮູບບໍ່ຊັດເຈນ)");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("ບໍ່ສາມາດແປງຄຳຕອບຈາກ Gemini ເປັນ JSON ໄດ້: " + e.message);
  }
  return parsed;
}

module.exports = { analyzeReceiptImage };
