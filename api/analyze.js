const { analyzeReceiptImage } = require("../lib/gemini");
const db = require("../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ຮັບຄ່າ JSON Base64 ໂດຍຕົງ (ບໍ່ຕ້ອງໃຊ້ formidable)
    const { image, mimeType, imageName } = req.body || {};
    
    if (!image) {
      return res.status(400).json({ error: "ບໍ່ພົບຮູບພາບ (image) ໃນຄຳຮ້ອງຂໍ" });
    }

    const base64Data = image;
    const extracted = await analyzeReceiptImage({ 
      base64Data, 
      mimeType: mimeType || "image/jpeg" 
    });

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
      image_name: imageName || null,
    });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "ເກີດຂໍ້ຜິດພາດໃນການວິເຄາະຮູບ" });
  }
};
