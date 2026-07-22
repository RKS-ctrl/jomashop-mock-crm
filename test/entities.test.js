const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");

test.beforeEach(() => {
  for (const name of ["orders", "tickets", "rma", "call_logs", "extend_claims"]) {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("GET /orders lists the seeded order", async () => {
  const app = require("../server");
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/orders`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.some((o) => o.order_number === "MD43553K"));
  } finally {
    server.close();
  }
});

test("GET /tickets, /call_logs, /extend_claims all list empty (no seed file yet)", async () => {
  const app = require("../server");
  const server = app.listen(0);
  const port = server.address().port;
  try {
    for (const entity of ["tickets", "call_logs", "extend_claims"]) {
      const res = await fetch(`http://localhost:${port}/${entity}`);
      assert.equal(res.status, 200, `${entity} should be a registered entity`);
      const body = await res.json();
      assert.deepEqual(body, []);
    }
  } finally {
    server.close();
  }
});

test("GET /rma lists the seeded repeat-RMA record", async () => {
  const app = require("../server");
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/rma`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].order_number, "MS72905Z");
  } finally {
    server.close();
  }
});
