const db = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    res.status(200).json(await db.listProducts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
