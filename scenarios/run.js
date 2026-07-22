const { orderStatusOrders, cancellationOrders, returnsOrders, shippingDelayOrders } = require("../seed/generate");
const { CREDENTIAL } = require("../lib/auth");
const {
  orderStatusDecision,
  cancellationDecision,
  returnsDecision,
  shippingDelayDecision,
} = require("./sopDecisions");

const BASE_URL = process.env.MOCK_CRM_URL || "http://localhost:3000";
const AUTH_HEADER = "Basic " + Buffer.from(CREDENTIAL).toString("base64");

async function callApi(endpoint, { query = "", body } = {}) {
  const res = await fetch(`${BASE_URL}/api/${endpoint}${query}`, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getTicketTypes(orderNo) {
  const res = await callApi("GetTicketsByOrderNo", { query: `?orderno=${orderNo}` });
  return res.body.tickets.map((t) => t.type);
}

async function runOrderStatusScenario(order) {
  const detailRes = await callApi("GetOrderDetailForPhoneAIByOrderNo", { query: `?orderno=${order.order_number}` });
  assert(detailRes.status === 200, `expected 200 on order detail, got ${detailRes.status}`);
  const decision = orderStatusDecision(detailRes.body);
  if (decision.escalate) {
    await callApi("RaiseZendeskTicket", {
      body: {
        orderno: order.order_number,
        type: decision.ticketType,
        reason: "order-status window check",
        raised_by: "scenario_harness",
      },
    });
  }
  const types = await getTicketTypes(order.order_number);
  if (decision.escalate) {
    assert(types.includes(decision.ticketType), `expected ticket type "${decision.ticketType}", got [${types}]`);
  } else {
    assert(types.length === 0, `expected no ticket, got [${types}]`);
  }
}

async function runCancellationScenario(order) {
  const decision = cancellationDecision(order);
  if (decision.action === "cancel") {
    const res = await callApi("CancelOrderForPhoneAI", { body: { orderno: order.order_number } });
    assert(res.status === 200, `expected 200 on cancel, got ${res.status}`);
    assert(res.body.item_status === "Canceled", "expected item_status Canceled after cancel");
  } else if (decision.action === "escalate") {
    await callApi("RaiseZendeskTicket", {
      body: {
        orderno: order.order_number,
        type: decision.ticketType,
        reason: "customer request cancellation",
        raised_by: "scenario_harness",
        exception: true,
      },
    });
    const types = await getTicketTypes(order.order_number);
    assert(types.includes(decision.ticketType), `expected ticket type "${decision.ticketType}", got [${types}]`);
  } else {
    const types = await getTicketTypes(order.order_number);
    assert(types.length === 0, "blocked (Closed) orders should not self-cancel or raise a ticket here");
  }
}

async function runReturnsScenario(order) {
  const historyRes = await callApi("GetRMAHistoryByOrderNo", { query: `?orderno=${order.order_number}` });
  const decision = returnsDecision(order, historyRes.body.rma_count);
  if (decision.action === "self_service") {
    const res = await callApi("CreateRMAForOrderAI", { body: { orderno: order.order_number, reason: "customer requested return" } });
    assert(res.status === 201, `expected 201 on RMA creation, got ${res.status}`);
  } else {
    await callApi("RaiseZendeskTicket", {
      body: {
        orderno: order.order_number,
        type: decision.ticketType,
        reason: "return escalation",
        raised_by: "scenario_harness",
      },
    });
    const types = await getTicketTypes(order.order_number);
    assert(types.includes(decision.ticketType), `expected ticket type "${decision.ticketType}", got [${types}]`);
  }
}

async function runShippingDelayScenario(order) {
  const decision = shippingDelayDecision(order);
  if (decision.action === "extend") {
    const res = await callApi("SendExtendClaimEmailAI", { body: { orderno: order.order_number, reason: "extend-eligible delay" } });
    assert(res.status === 201, `expected 201 on extend claim, got ${res.status}`);
    const types = await getTicketTypes(order.order_number);
    assert(types.length === 0, "Extend path should never raise a Zendesk ticket");
  } else if (decision.action === "escalate") {
    await callApi("RaiseZendeskTicket", {
      body: {
        orderno: order.order_number,
        type: decision.ticketType,
        reason: "shipping delay escalation",
        raised_by: "scenario_harness",
      },
    });
    const types = await getTicketTypes(order.order_number);
    assert(types.includes(decision.ticketType), `expected ticket type "${decision.ticketType}", got [${types}]`);
  } else {
    // decision.action === "wait": nothing should be raised yet.
    const types = await getTicketTypes(order.order_number);
    assert(types.length === 0, `expected no ticket while still within the no-movement wait window, got [${types}]`);
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  async function runGroup(label, group, fn) {
    for (const order of group) {
      try {
        await fn(order);
        passed += 1;
        console.log(`PASS  ${label}:${order.order_number}`);
      } catch (err) {
        failed += 1;
        console.error(`FAIL  ${label}:${order.order_number} - ${err.message}`);
      }
    }
  }

  await runGroup("order-status", orderStatusOrders, runOrderStatusScenario);
  await runGroup("cancellation", cancellationOrders, runCancellationScenario);
  await runGroup("returns", returnsOrders, runReturnsScenario);
  await runGroup("shipping-delay", shippingDelayOrders, runShippingDelayScenario);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
