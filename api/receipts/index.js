const db = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    try {
      res.status(200).json(await db.listReceipts());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      res.status(200).json(await db.saveReceipt(req.body || {}));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
