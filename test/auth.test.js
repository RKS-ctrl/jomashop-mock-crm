const test = require("node:test");
const assert = require("node:assert/strict");
const { basicAuth, CREDENTIAL } = require("../lib/auth");
const express = require("express");

function buildApp() {
  const app = express();
  app.get("/protected", basicAuth, (req, res) => res.json({ ok: true }));
  return app;
}

test("rejects missing Authorization header", async () => {
  const server = buildApp().listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/protected`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("rejects wrong credential", async () => {
  const server = buildApp().listen(0);
  const port = server.address().port;
  try {
    const bad = "Basic " + Buffer.from("wrong:creds").toString("base64");
    const res = await fetch(`http://localhost:${port}/protected`, { headers: { Authorization: bad } });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("accepts the configured credential", async () => {
  const server = buildApp().listen(0);
  const port = server.address().port;
  try {
    const good = "Basic " + Buffer.from(CREDENTIAL).toString("base64");
    const res = await fetch(`http://localhost:${port}/protected`, { headers: { Authorization: good } });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
