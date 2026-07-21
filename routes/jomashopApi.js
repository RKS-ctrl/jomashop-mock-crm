const express = require("express");
const { load } = require("../lib/store");

const router = express.Router();

function findCustomerByPhone(phone) {
  const customers = load("customers", "customer_id");
  return Object.values(customers).find((c) => c.contact && c.contact.primary_phone === phone);
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

module.exports = router;
