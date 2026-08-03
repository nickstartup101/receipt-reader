const fs = require("fs");
const fs = require("fs"); // ເພີ່ມ fs ທີ່ຂາດໄປ
const { formidable } = require("formidable"); // ແກ້ໄຂ Destructuring ເພື່ອ Fix Error "formidable is not a function"
const { analyzeReceiptImage } = require("../lib/gemini");
const db = require("../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ເອີ້ນໃຊ້ formidable() ໄດ້ຢ່າງຖືກຕ້ອງ
    const form = formidable({ maxFileSize: 4 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    
    const fileField = files.image;
    const file = Array.isArray(fileField) ? fileField[0] : fileField;
    
    if (!file) {
      return res.status(400).json({ error: "ບໍ່ພົບຮູບພາບ (image) ໃນຄຳຮ້ອງຂໍ" });
    }

    // ອ່ານໄຟລ໌ຮູບພາບ
    const buffer = fs.readFileSync(file.filepath);
    const base64Data = buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    // ສົ່ງຮູບໄປວິເຄາະກັບ Gemini API
    const extracted = await analyzeReceiptImage({ base64Data, mimeType });

    // ຄົ້ນຫາສິນຄ້າໃກ້ຄຽງ (Fuzzy Matching / Suggestions)
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

    // (Option) ລົບໄຟລ໌ Temp ອອກຈາກ Disk ຫຼັງຈາກປະມວນຜົນສຳເລັດ
    try {
      fs.unlinkSync(file.filepath);
    } catch (e) {
      // ຂ້າມຖ້າລົບບໍ່ໄດ້
    }

    // ສົ່ງ Response ກັບໄປ Frontend
    res.status(200).json({
      ...extracted,
      items: itemsWithSuggestions,
      image_name: file.originalFilename || null,
    });
  } catch (err) {
    console.error("API Analyze Error:", err);
    res.status(500).json({ error: err.message || "ເກີດຂໍ້ຜິດພາດໃນການວິເຄາະຮູບ" });
  }
};
