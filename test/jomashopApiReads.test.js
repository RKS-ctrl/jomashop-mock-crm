const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");
const { CREDENTIAL } = require("../lib/auth");

const AUTH = "Basic " + Buffer.from(CREDENTIAL).toString("base64");

function startServer() {
  const server = app.listen(0);
  return { server, base: `http://localhost:${server.address().port}` };
}

test("GetOrdersForPhoneAIByPhoneNo returns orders for the matching customer", async () => {
  const { server, base } = startServer();
  try {
    const res = await fetch(`${base}/api/GetOrdersForPhoneAIByPhoneNo?phoneno=8016289922`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.every((o) => o.customer_id === "CUST-100001"));
  } finally {
    server.close();
  }
});

test("GetOrdersForEmailAI and GetOrdersForNameAI resolve the same customer", async () => {
  const { server, base } = startServer();
  try {
    const byEmail = await fetch(`${base}/api/GetOrdersForEmailAI?email=erikastewart2418@gmail.com`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    const byName = await fetch(`${base}/api/GetOrdersForNameAI?name=Erika Muirbrook`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    assert.equal(byEmail.status, 200);
    assert.equal(byName.status, 200);
    const emailBody = await byEmail.json();
    const nameBody = await byName.json();
    assert.deepEqual(
      emailBody.map((o) => o.order_number).sort(),
      nameBody.map((o) => o.order_number).sort()
    );
  } finally {
    server.close();
  }
});

test("GetOrderDetailForPhoneAIByOrderNo returns 404 for unknown order", async () => {
  const { server, base } = startServer();
  try {
    const res = await fetch(`${base}/api/GetOrderDetailForPhoneAIByOrderNo?orderno=NOPE`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("all /api/* routes require auth", async () => {
  const { server, base } = startServer();
  try {
    const res = await fetch(`${base}/api/GetOrderDetailForPhoneAIByOrderNo?orderno=ORD-SAMPLE-0001`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
