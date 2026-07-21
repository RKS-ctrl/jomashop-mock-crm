const CREDENTIAL = process.env.JOMASHOP_MOCK_CREDENTIAL || "nurix-mock:practice-only-2026";

function basicAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", "Basic");
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  if (decoded !== CREDENTIAL) {
    res.set("WWW-Authenticate", "Basic");
    return res.status(401).json({ error: "Invalid credentials" });
  }
  next();
}

module.exports = { basicAuth, CREDENTIAL };
