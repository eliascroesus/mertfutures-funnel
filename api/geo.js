/* The visitor's country (two letters, e.g. "NL"), from the x-vercel-ip-country header Vercel adds to every request,
   so the phone box can open on their country. No outside service and nothing stored. */
module.exports = (req, res) => {
  const c = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ country: /^[A-Z]{2}$/.test(c) ? c : "" }));
};
