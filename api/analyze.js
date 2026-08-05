const nodeFs = require("node:fs");
const formidableModule = require("formidable");
const { analyzeReceiptImage } = require("../lib/gemini");
const db = require("../lib/db");

// 🛡️ Safe helper ຈັດການ Formidable ທຸກ Version ອັດຕະໂນມັດ (ປ້ອງກັນ "formidable is not a function")
function createForm(options) {
  if (typeof formidableModule.formidable === "function") {
    return formidableModule.formidable(options);
  }
  if (typeof formidableModule === "function") {
    return formidableModule(options);
  }
  if (typeof formidableModule.IncomingForm === "function") {
    return new formidableModule.IncomingForm(options);
  }
  if (typeof formidableModule.default === "function") {
    return formidableModule.default(options);
  }
  throw new Error("ບໍ່ສາມາດຕັ້ງຄ່າ Formidable ໄດ້");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ເອີ້ນໃຊ້ຜ່ານ createForm ຢ່າງປອດໄພ
    const form = createForm({ maxFileSize: 4 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    
    const fileField = files.image;
    const file = Array.isArray(fileField) ? fileField[0] : fileField;
    if (!file) return res.status(400).json({ error: "ບໍ່ພົບຮູບພາບ (image) ໃນຄຳຮ້ອງຂໍ" });

    const buffer = nodeFs.readFileSync(file.filepath);
    const base64Data = buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    const extracted = await analyzeReceiptImage({ base64Data, mimeType });

    const threshold = Number(process.env.MATCH_THRESHOLD || 0.45);
    const items = Array.isArray(extracted.items) ? extracted.items : [];
    const itemsWithSuggestions = [];
    
    for (const item of items) {
      const raw = await db.suggestProducts(item.name || item.raw_text, 5);
      const suggestions = raw
        .filter((s) => s.score >= threshold)
        .map((s) => ({
          product_id: s.product.id,
          canonical_name: s.product.canonical_name,
          score: Math.round(s.score * 100) / 100,
        }));
      itemsWithSuggestions.push({ ...item, suggestions });
    }

    res.status(200).json({
      ...extracted,
      items: itemsWithSuggestions,
      image_name: file.originalFilename || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "ເກີດຂໍ້ຜິດພາດໃນການວິເຄາະຮູບ" });
  }
};
