const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = require("../server");
const { CREDENTIAL } = require("../lib/auth");

const AUTH = "Basic " + Buffer.from(CREDENTIAL).toString("base64");
const DATA_DIR = path.join(__dirname, "..", "data");

test.beforeEach(() => {
  for (const name of ["orders", "tickets", "rma", "call_logs", "extend_claims"]) {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

function startServer() {
  const server = app.listen(0);
  return { server, base: `http://localhost:${server.address().port}` };
}

async function post(base, path, body) {
  return fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("CancelOrderForPhoneAI sets item_status to Canceled unconditionally", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "CancelOrderForPhoneAI", { orderno: "ORD-APR-APPROVED" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.item_status, "Canceled");
  } finally {
    server.close();
  }
});

test("RaiseZendeskTicket creates a ticket and, with exception:true, flags the order", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "RaiseZendeskTicket", {
      orderno: "ORD-APR-APPROVED",
      type: "Cancellation Exception - High Value",
      reason: "customer request cancellation",
      raised_by: "voice_agent",
      exception: true,
    });
    assert.equal(res.status, 201);
    const ticket = await res.json();
    assert.equal(ticket.type, "Cancellation Exception - High Value");
    assert.ok(ticket.ticket_id);

    const detail = await post(base, "GetOrderDetailForPhoneAIByOrderNo?orderno=ORD-APR-APPROVED");
    const order = await detail.json();
    assert.equal(order.exception_flag, true);
  } finally {
    server.close();
  }
});

test("CreateRMAForOrderAI then GetRMAHistoryByOrderNo reflects it", async () => {
  const { server, base } = startServer();
  try {
    await post(base, "CreateRMAForOrderAI", { orderno: "ORD-APR-APPROVED", reason: "wrong size" });
    const res = await post(base, "GetRMAHistoryByOrderNo?orderno=ORD-APR-APPROVED");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rma_count, 1);
    assert.equal(body.rma_records[0].reason, "wrong size");
  } finally {
    server.close();
  }
});

test("GetTicketsByOrderNo returns tickets raised for that order", async () => {
  const { server, base } = startServer();
  try {
    await post(base, "RaiseZendeskTicket", {
      orderno: "ORD-APR-APPROVED",
      type: "Order Decline Review",
      reason: "order declined",
      raised_by: "voice_agent",
    });
    const res = await post(base, "GetTicketsByOrderNo?orderno=ORD-APR-APPROVED");
    const body = await res.json();
    assert.equal(body.tickets.length, 1);
    assert.equal(body.tickets[0].type, "Order Decline Review");
  } finally {
    server.close();
  }
});

test("SendExtendClaimEmailAI records an extend_claims entry, not a ticket", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "SendExtendClaimEmailAI", {
      orderno: "ORD-APR-APPROVED",
      reason: "no movement, has Extend",
    });
    assert.equal(res.status, 201);
    const ticketsRes = await post(base, "GetTicketsByOrderNo?orderno=ORD-APR-APPROVED");
    const ticketsBody = await ticketsRes.json();
    assert.equal(ticketsBody.tickets.length, 0);
  } finally {
    server.close();
  }
});

test("AddNurixAICallLog stores the call log with the exact shared field names", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "AddNurixAICallLog", {
      PhoneNo: "7875551235",
      OrderNo: "ORD-SAMPLE-0001",
      ItemNo: "",
      Email: "",
      Transcript: "User called requesting status. AI provided tracking info.",
      Solved: true,
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.Solved, true);
    assert.equal(body.OrderNo, "ORD-SAMPLE-0001");
  } finally {
    server.close();
  }
});

test("CancelOrderForPhoneAI returns 400 without orderno and 404 for an unknown order", async () => {
  const { server, base } = startServer();
  try {
    let res = await post(base, "CancelOrderForPhoneAI", {});
    assert.equal(res.status, 400);

    res = await post(base, "CancelOrderForPhoneAI", { orderno: "NOPE" });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("RaiseZendeskTicket returns 400 without orderno/type and 404 for an unknown order", async () => {
  const { server, base } = startServer();
  try {
    let res = await post(base, "RaiseZendeskTicket", { orderno: "ORD-SAMPLE-0001" });
    assert.equal(res.status, 400);

    res = await post(base, "RaiseZendeskTicket", {
      orderno: "NOPE",
      type: "Order Decline Review",
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("CreateRMAForOrderAI returns 400 without orderno and 404 for an unknown order", async () => {
  const { server, base } = startServer();
  try {
    let res = await post(base, "CreateRMAForOrderAI", {});
    assert.equal(res.status, 400);

    res = await post(base, "CreateRMAForOrderAI", { orderno: "NOPE", reason: "wrong size" });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("GetRMAHistoryByOrderNo returns 400 without orderno", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "GetRMAHistoryByOrderNo");
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("GetTicketsByOrderNo returns 400 without orderno", async () => {
  const { server, base } = startServer();
  try {
    const res = await post(base, "GetTicketsByOrderNo");
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("SendExtendClaimEmailAI returns 400 without orderno and 404 for an unknown order", async () => {
  const { server, base } = startServer();
  try {
    let res = await post(base, "SendExtendClaimEmailAI", {});
    assert.equal(res.status, 400);

    res = await post(base, "SendExtendClaimEmailAI", { orderno: "NOPE", reason: "no movement" });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("AddNurixAICallLog returns 400 when Transcript or Solved is missing", async () => {
  const { server, base } = startServer();
  try {
    let res = await post(base, "AddNurixAICallLog", { PhoneNo: "7875551235", Solved: true });
    assert.equal(res.status, 400);

    res = await post(base, "AddNurixAICallLog", { PhoneNo: "7875551235", Transcript: "hi" });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("action routes require auth", async () => {
  const { server, base } = startServer();
  try {
    const res = await fetch(`${base}/api/CancelOrderForPhoneAI`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderno: "ORD-SAMPLE-0001" }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
