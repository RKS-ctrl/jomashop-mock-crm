const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

test("POST /tools/calendar/add-business-days returns result_date", async () => {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/tools/calendar/add-business-days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-01-05", business_days: 3 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result_date, "2026-01-08");
  } finally {
    server.close();
  }
});

test("POST /tools/calendar/business-days-between returns business_days", async () => {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/tools/calendar/business-days-between`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_a: "2026-01-05", date_b: "2026-01-08" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.business_days, 3);
  } finally {
    server.close();
  }
});

test("missing fields return 400", async () => {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/tools/calendar/add-business-days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
