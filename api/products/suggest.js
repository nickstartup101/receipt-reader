const db = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const text = req.query.text || "";
    const suggestions = await db.suggestProducts(text, 8);
    res.status(200).json(
      suggestions.map((s) => ({
        product_id: s.product.id,
        canonical_name: s.product.canonical_name,
        aliases: s.product.aliases.map((a) => a.alias_text),
        score: Math.round(s.score * 100) / 100,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
