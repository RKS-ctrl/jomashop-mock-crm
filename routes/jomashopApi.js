const express = require("express");
const { load, save } = require("../lib/store");
const { nextId } = require("../lib/ids");

const router = express.Router();

// Strips formatting (+, spaces, dashes, parens) and any country code so
// callers can be matched regardless of the exact format Caller ID sends.
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, "").slice(-10);
}

function findCustomerByPhone(phone) {
  const customers = load("customers", "customer_id");
  const target = normalizePhone(phone);
  return Object.values(customers).find(
    (c) => c.contact && normalizePhone(c.contact.primary_phone) === target
  );
}

function findCustomerByEmail(email) {
  const customers = load("customers", "customer_id");
  return Object.values(customers).find((c) => c.contact && c.contact.email === email);
}

function findCustomerByName(name) {
  const customers = load("customers", "customer_id");
  const target = name.trim().toLowerCase();
  return Object.values(customers).find(
    (c) => c.profile && c.profile.full_name && c.profile.full_name.trim().toLowerCase() === target
  );
}

function ordersForCustomer(customerId) {
  const orders = load("orders", "order_number");
  return Object.values(orders).filter((o) => o.customer_id === customerId);
}

router.post("/GetOrdersForPhoneAIByPhoneNo", (req, res) => {
  const phone = req.query.phoneno;
  if (!phone) return res.status(400).json({ error: "phoneno is required" });
  const customer = findCustomerByPhone(phone);
  if (!customer) return res.status(404).json({ error: "No customer found for phoneno" });
  res.json(ordersForCustomer(customer.customer_id));
});

router.post("/GetOrdersForEmailAI", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "email is required" });
  const customer = findCustomerByEmail(email);
  if (!customer) return res.status(404).json({ error: "No customer found for email" });
  res.json(ordersForCustomer(customer.customer_id));
});

router.post("/GetOrdersForNameAI", (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "name is required" });
  const customer = findCustomerByName(name);
  if (!customer) return res.status(404).json({ error: "No customer found for name" });
  res.json(ordersForCustomer(customer.customer_id));
});

router.post("/GetOrderDetailForPhoneAIByOrderNo", (req, res) => {
  const orderNo = req.query.orderno;
  if (!orderNo) return res.status(400).json({ error: "orderno is required" });
  const orders = load("orders", "order_number");
  const order = orders[orderNo];
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

router.post("/CancelOrderForPhoneAI", (req, res) => {
  const { orderno } = req.body || {};
  if (!orderno) return res.status(400).json({ error: "orderno is required" });
  const orders = load("orders", "order_number");
  const order = orders[orderno];
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.item_status = "Canceled";
  orders[orderno] = order;
  save("orders", orders);
  res.json(order);
});

router.post("/RaiseZendeskTicket", (req, res) => {
  const { orderno, type, reason, raised_by, exception } = req.body || {};
  if (!orderno || !type) return res.status(400).json({ error: "orderno and type are required" });
  const orders = load("orders", "order_number");
  const order = orders[orderno];
  if (!order) return res.status(404).json({ error: "Order not found" });
  const tickets = load("tickets", "ticket_id");
  const ticket_id = nextId(tickets, "ZD", 10001);
  const ticket = {
    ticket_id,
    order_number: orderno,
    type,
    reason: reason || "",
    raised_by: raised_by || "voice_agent",
    created_at: new Date().toISOString(),
  };
  tickets[ticket_id] = ticket;
  save("tickets", tickets);
  if (exception) {
    order.exception_flag = true;
    orders[orderno] = order;
    save("orders", orders);
  }
  res.status(201).json(ticket);
});

router.post("/CreateRMAForOrderAI", (req, res) => {
  const { orderno, reason } = req.body || {};
  if (!orderno) return res.status(400).json({ error: "orderno is required" });
  const orders = load("orders", "order_number");
  if (!orders[orderno]) return res.status(404).json({ error: "Order not found" });
  const rmas = load("rma", "rma_id");
  const rma_id = nextId(rmas, "RMA", 5001);
  const rma = { rma_id, order_number: orderno, reason: reason || "", created_at: new Date().toISOString() };
  rmas[rma_id] = rma;
  save("rma", rmas);
  res.status(201).json(rma);
});

router.post("/GetRMAHistoryByOrderNo", (req, res) => {
  const orderNo = req.query.orderno;
  if (!orderNo) return res.status(400).json({ error: "orderno is required" });
  const rmas = load("rma", "rma_id");
  const records = Object.values(rmas).filter((r) => r.order_number === orderNo);
  res.json({ order_number: orderNo, rma_count: records.length, rma_records: records });
});

router.post("/GetTicketsByOrderNo", (req, res) => {
  const orderNo = req.query.orderno;
  if (!orderNo) return res.status(400).json({ error: "orderno is required" });
  const tickets = load("tickets", "ticket_id");
  const records = Object.values(tickets).filter((t) => t.order_number === orderNo);
  res.json({ order_number: orderNo, tickets: records });
});

router.post("/SendExtendClaimEmailAI", (req, res) => {
  const { orderno, reason } = req.body || {};
  if (!orderno) return res.status(400).json({ error: "orderno is required" });
  const orders = load("orders", "order_number");
  if (!orders[orderno]) return res.status(404).json({ error: "Order not found" });
  const claims = load("extend_claims", "extend_claim_id");
  const extend_claim_id = nextId(claims, "EXT", 1);
  const claim = {
    extend_claim_id,
    order_number: orderno,
    reason: reason || "",
    created_at: new Date().toISOString(),
  };
  claims[extend_claim_id] = claim;
  save("extend_claims", claims);
  res.status(201).json(claim);
});

router.post("/AddNurixAICallLog", (req, res) => {
  const { PhoneNo, OrderNo, ItemNo, Email, Transcript, Solved } = req.body || {};
  if (Transcript === undefined || Solved === undefined) {
    return res.status(400).json({ error: "Transcript and Solved are required" });
  }
  const callLogs = load("call_logs", "call_log_id");
  const call_log_id = nextId(callLogs, "CALL", 9001);
  const record = {
    call_log_id,
    PhoneNo: PhoneNo || "",
    OrderNo: OrderNo || "",
    ItemNo: ItemNo || "",
    Email: Email || "",
    Transcript,
    Solved,
    created_at: new Date().toISOString(),
  };
  callLogs[call_log_id] = record;
  save("call_logs", callLogs);
  res.status(201).json(record);
});

module.exports = router;
