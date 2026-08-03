const db = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const r = await db.getReceipt(req.query.id);
    if (!r) return res.status(404).json({ error: "ບໍ່ພົບໃບບິນນີ້" });
    res.status(200).json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
