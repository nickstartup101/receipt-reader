const db = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { raw_text, store_name, mode, product_id, canonical_name } = req.body || {};
  if (!raw_text) return res.status(400).json({ error: "ຕ້ອງການ raw_text" });

  try {
    let product;
    if (mode === "existing") {
      if (!product_id) return res.status(400).json({ error: "ຕ້ອງການ product_id" });
      await db.addAlias(product_id, raw_text, store_name);
      product = await db.getProduct(product_id);
    } else {
      product = await db.createProduct(canonical_name || raw_text, null, raw_text, store_name);
    }
    res.status(200).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
