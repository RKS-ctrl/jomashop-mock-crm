# Jomashop Mock CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `customer-crud-server` into a mock Jomashop CRM that a voice agent can call over plain HTTP to execute the four in-scope SOP flows, plus a calendar tool and a scripted scenario harness that proves every SOP branch is executable.

**Architecture:** Same Express app, same JSON-file-per-entity storage (`lib/store.js`, unchanged). Three route surfaces: `/api/*` (Jomashop-shaped, Basic-auth protected), `/tools/calendar/*` (business-day math, no auth), and generic CRUD (`/customers`, `/orders`, `/tickets`, `/rma`, `/call_logs`, `/extend_claims`, no auth, dev/test only).

**Tech Stack:** Node.js (v26 available), Express 4, `node:test` + `node:assert/strict` (built-in, no new test dependency), global `fetch` (built-in) for HTTP-level tests and the scenario harness.

## Global Constraints

- No SOP-rule enforcement in the CRM — every `/api/*` action endpoint executes unconditionally; the agent (or scenario harness) decides when to call it. (Spec Section 3.)
- `/api/*` requires HTTP Basic auth with a fresh practice credential — never reuse the real credential from Jomashop's Postman collection. (Spec Section 5.)
- `shipping_availability_text` and any similar advertised-window field is literal prose, never pre-parsed/structured by the CRM. (Spec Section 4.)
- No precomputed deadline/window field on `orders` — window math happens live via the calendar tool. (Spec Section 4.)
- `/tools/calendar/*` has no auth and skips weekends only (no holiday calendar) — documented simplification, not a hidden behavior. (Spec Section 5.3.)

---

## Task 1: Testability fix + calendar library + calendar tool routes

**Files:**
- Modify: `server.js` (guard `app.listen`)
- Create: `lib/calendar.js`
- Create: `test/calendar.test.js`
- Create: `routes/calendarTools.js`
- Create: `test/calendarTools.test.js`

**Interfaces:**
- Produces: `lib/calendar.js` exports `addBusinessDays(startDateStr: string, businessDays: number): string` and `businessDaysBetween(dateAStr: string, dateBStr: string): number`, both throwing `Error` on an unparseable date string. Dates are `YYYY-MM-DD`.
- Produces: `routes/calendarTools.js` exports an Express `Router` mounted at `/tools/calendar`, exposing `POST /add-business-days` and `POST /business-days-between`.
- Produces: `server.js` now guards its own `app.listen` behind `require.main === module`, so `require("../server")` in tests never binds a port — every later task's HTTP tests rely on this.

- [ ] **Step 1: Guard `app.listen` in `server.js` so requiring it in tests doesn't bind a port**

Change the bottom of `server.js` from:

```javascript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Customer CRUD server listening on :${PORT}`);
});

module.exports = app;
```

to:

```javascript
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Customer CRUD server listening on :${PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 2: Verify the server still starts standalone**

Run: `node server.js &` then `curl -s http://localhost:3000/ | head -c 200; kill %1`
Expected: JSON response listing entities (customers), then the background process is killed.

- [ ] **Step 3: Write the failing test for `lib/calendar.js`**

Create `test/calendar.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { addBusinessDays, businessDaysBetween } = require("../lib/calendar");

test("addBusinessDays skips no weekend when the range doesn't cross one", () => {
  assert.equal(addBusinessDays("2026-01-05", 3), "2026-01-08"); // Mon -> Thu
});

test("addBusinessDays skips the weekend", () => {
  assert.equal(addBusinessDays("2026-01-09", 1), "2026-01-12"); // Fri -> Mon
});

test("businessDaysBetween counts elapsed business days, weekend excluded", () => {
  assert.equal(businessDaysBetween("2026-01-05", "2026-01-08"), 3); // Mon -> Thu
  assert.equal(businessDaysBetween("2026-01-09", "2026-01-12"), 1); // Fri -> Mon
});

test("businessDaysBetween is order-independent (absolute)", () => {
  assert.equal(businessDaysBetween("2026-01-08", "2026-01-05"), 3);
});

test("addBusinessDays and businessDaysBetween are inverses", () => {
  const end = addBusinessDays("2026-01-05", 7);
  assert.equal(businessDaysBetween("2026-01-05", end), 7);
});

test("invalid date strings throw", () => {
  assert.throws(() => addBusinessDays("not-a-date", 1));
  assert.throws(() => businessDaysBetween("2026-01-05", "not-a-date"));
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test test/calendar.test.js`
Expected: FAIL — `Cannot find module '../lib/calendar'`

- [ ] **Step 5: Implement `lib/calendar.js`**

```javascript
function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function parseDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addBusinessDays(startDateStr, businessDays) {
  const date = parseDate(startDateStr);
  let remaining = businessDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!isWeekend(date)) remaining -= 1;
  }
  return formatDate(date);
}

function businessDaysBetween(dateAStr, dateBStr) {
  const dateA = parseDate(dateAStr);
  const dateB = parseDate(dateBStr);
  const [earlier, later] = dateA <= dateB ? [dateA, dateB] : [dateB, dateA];
  const cursor = new Date(earlier.getTime());
  let count = 0;
  while (cursor.getTime() < later.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

module.exports = { addBusinessDays, businessDaysBetween, parseDate, formatDate };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/calendar.test.js`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 7: Write the failing test for the calendar tool routes**

Create `test/calendarTools.test.js`:

```javascript
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
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test test/calendarTools.test.js`
Expected: FAIL — 404s because `/tools/calendar/*` isn't mounted yet

- [ ] **Step 9: Implement `routes/calendarTools.js`**

```javascript
const express = require("express");
const { addBusinessDays, businessDaysBetween } = require("../lib/calendar");

const router = express.Router();

router.post("/add-business-days", (req, res) => {
  const { start_date, business_days } = req.body || {};
  if (!start_date || typeof business_days !== "number") {
    return res.status(400).json({ error: "start_date and business_days are required" });
  }
  try {
    res.json({ result_date: addBusinessDays(start_date, business_days) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/business-days-between", (req, res) => {
  const { date_a, date_b } = req.body || {};
  if (!date_a || !date_b) {
    return res.status(400).json({ error: "date_a and date_b are required" });
  }
  try {
    res.json({ business_days: businessDaysBetween(date_a, date_b) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 10: Wire it into `server.js`**

Add near the top, after the existing `require` lines:

```javascript
const calendarTools = require("./routes/calendarTools");
```

Add right after `app.use(express.static("public"));` (before the `ENTITIES` block):

```javascript
app.use("/tools/calendar", calendarTools);
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `node --test test/calendarTools.test.js`
Expected: PASS — 3 tests, 0 failures

- [ ] **Step 12: Commit**

```bash
git add server.js lib/calendar.js routes/calendarTools.js test/calendar.test.js test/calendarTools.test.js
git commit -m "Add business-day calendar tool and make server requirable in tests"
```

---

## Task 2: Basic-auth middleware for `/api/*`

**Files:**
- Create: `lib/auth.js`
- Create: `test/auth.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `lib/auth.js` exports `basicAuth(req, res, next)` (Express middleware) and `CREDENTIAL` (string, the plaintext `user:pass` practice credential) — Task 4/5's tests build valid `Authorization` headers from `CREDENTIAL`, and the scenario harness (Task 7) does the same.

- [ ] **Step 1: Write the failing test**

Create `test/auth.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/auth.test.js`
Expected: FAIL — `Cannot find module '../lib/auth'`

- [ ] **Step 3: Implement `lib/auth.js`**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/auth.test.js`
Expected: PASS — 3 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js test/auth.test.js
git commit -m "Add Basic-auth middleware for the Jomashop-shaped API"
```

---

## Task 3: Register `orders`, `tickets`, `rma`, `call_logs`, `extend_claims` as generic-CRUD entities

**Files:**
- Modify: `server.js` (extend `ENTITIES`)
- Create: `seed/orders.json` (placeholder — Task 6 replaces this wholesale)
- Create: `test/entities.test.js`

**Interfaces:**
- Consumes: `lib/store.js`'s existing `load(entity, idField)` / `save(entity, map)` (unchanged).
- Produces: `ENTITIES` in `server.js` now has keys `customers`, `orders`, `tickets`, `rma`, `call_logs`, `extend_claims`, each with `idField` set to `order_number`, `ticket_id`, `rma_id`, `call_log_id`, `extend_claim_id` respectively. Later tasks' route handlers call `load("orders", "order_number")` etc. directly (not through `ENTITIES`), so they don't depend on this map, but they DO depend on `data/orders.json` being seedable, which this task establishes.

- [ ] **Step 1: Write the failing test**

Create `test/entities.test.js`:

```javascript
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
    assert.ok(body.some((o) => o.order_number === "ORD-SAMPLE-0001"));
  } finally {
    server.close();
  }
});

test("GET /tickets, /rma, /call_logs, /extend_claims all list empty (no seed file yet)", async () => {
  const app = require("../server");
  const server = app.listen(0);
  const port = server.address().port;
  try {
    for (const entity of ["tickets", "rma", "call_logs", "extend_claims"]) {
      const res = await fetch(`http://localhost:${port}/${entity}`);
      assert.equal(res.status, 200, `${entity} should be a registered entity`);
      const body = await res.json();
      assert.deepEqual(body, []);
    }
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/entities.test.js`
Expected: FAIL — `/orders`, `/tickets`, `/rma`, `/call_logs`, `/extend_claims` all 404 (unknown entity)

- [ ] **Step 3: Create the placeholder seed file**

Create `seed/orders.json`:

```json
[
  {
    "order_number": "ORD-SAMPLE-0001",
    "customer_id": "CUST-100001",
    "order_datetime": "2026-07-15T10:00:00-04:00",
    "order_value": 500,
    "approval_status": "Approved",
    "item_status": "Open",
    "shipping_availability_text": "Usually Ships in 3-5 Business Days",
    "shipping_method": "Standard",
    "payment_hold": false,
    "extend_protection": false,
    "exception_flag": false,
    "items": [{ "sku": "WATCH-1000", "name": "Example Watch", "price": 500 }],
    "shipment": {
      "shipped": false,
      "ship_date": null,
      "tracking_number": null,
      "tracking_status": null,
      "last_movement_date": null,
      "delivered_date": null
    }
  }
]
```

- [ ] **Step 4: Extend `ENTITIES` in `server.js`**

Change:

```javascript
const ENTITIES = {
  customers: { idField: "customer_id" },
};
```

to:

```javascript
const ENTITIES = {
  customers: { idField: "customer_id" },
  orders: { idField: "order_number" },
  tickets: { idField: "ticket_id" },
  rma: { idField: "rma_id" },
  call_logs: { idField: "call_log_id" },
  extend_claims: { idField: "extend_claim_id" },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/entities.test.js`
Expected: PASS — 2 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add server.js seed/orders.json test/entities.test.js
git commit -m "Register orders, tickets, rma, call_logs, extend_claims as generic-CRUD entities"
```

---

## Task 4: Jomashop read endpoints

**Files:**
- Create: `routes/jomashopApi.js`
- Create: `test/jomashopApiReads.test.js`
- Modify: `server.js` (mount `/api` with `basicAuth`)

**Interfaces:**
- Consumes: `lib/store.js`'s `load`; `lib/auth.js`'s `basicAuth`, `CREDENTIAL`.
- Produces: `routes/jomashopApi.js` exports an Express `Router` with `POST /GetOrdersForPhoneAIByPhoneNo`, `POST /GetOrdersForEmailAI`, `POST /GetOrdersForNameAI`, `POST /GetOrderDetailForPhoneAIByOrderNo` — Task 5 adds more routes to this SAME router (don't create a second router file).

- [ ] **Step 1: Write the failing test**

Create `test/jomashopApiReads.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/jomashopApiReads.test.js`
Expected: FAIL — 404s, `/api/*` not mounted yet

- [ ] **Step 3: Implement `routes/jomashopApi.js`**

```javascript
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
```

- [ ] **Step 4: Mount `/api` in `server.js`**

Add near the top, alongside the other `require`s:

```javascript
const { basicAuth } = require("./lib/auth");
const jomashopApi = require("./routes/jomashopApi");
```

Add right after `app.use("/tools/calendar", calendarTools);`:

```javascript
app.use("/api", basicAuth, jomashopApi);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/jomashopApiReads.test.js`
Expected: PASS — 4 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add server.js routes/jomashopApi.js test/jomashopApiReads.test.js
git commit -m "Add Jomashop-shaped order-lookup endpoints under /api"
```

---

## Task 5: Jomashop action endpoints

**Files:**
- Create: `lib/ids.js`
- Modify: `routes/jomashopApi.js` (add routes to the same router from Task 4)
- Create: `test/jomashopApiActions.test.js`

**Interfaces:**
- Consumes: `lib/store.js`'s `load`/`save`.
- Produces: `lib/ids.js` exports `nextId(map: object, prefix: string, start: number): string` — generates the next sequential id like `${prefix}-${n}` given an existing `{id: record}` map. Used for `ticket_id`, `rma_id`, `call_log_id`, `extend_claim_id`.
- Produces: on `routes/jomashopApi.js`'s router — `POST /CancelOrderForPhoneAI`, `POST /RaiseZendeskTicket`, `POST /CreateRMAForOrderAI`, `POST /GetRMAHistoryByOrderNo`, `POST /GetTicketsByOrderNo`, `POST /SendExtendClaimEmailAI`, `POST /AddNurixAICallLog`. Task 7's scenario harness calls all of these directly by name.

- [ ] **Step 1: Write the failing test for `lib/ids.js`**

Create `test/ids.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { nextId } = require("../lib/ids");

test("starts at the given start value when the map is empty", () => {
  assert.equal(nextId({}, "ZD", 10001), "ZD-10001");
});

test("continues past the highest existing id with that prefix", () => {
  const map = { "ZD-10001": {}, "ZD-10005": {} };
  assert.equal(nextId(map, "ZD", 10001), "ZD-10006");
});

test("ignores ids with a different prefix", () => {
  const map = { "RMA-5001": {} };
  assert.equal(nextId(map, "ZD", 10001), "ZD-10001");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ids.test.js`
Expected: FAIL — `Cannot find module '../lib/ids'`

- [ ] **Step 3: Implement `lib/ids.js`**

```javascript
function nextId(map, prefix, start) {
  const numbers = Object.keys(map)
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => parseInt(id.slice(prefix.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numbers.length ? Math.max(...numbers) : start - 1;
  return `${prefix}-${max + 1}`;
}

module.exports = { nextId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ids.test.js`
Expected: PASS — 3 tests, 0 failures

- [ ] **Step 5: Write the failing test for the action endpoints**

Create `test/jomashopApiActions.test.js`:

```javascript
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
    const res = await post(base, "CancelOrderForPhoneAI", { orderno: "ORD-SAMPLE-0001" });
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
      orderno: "ORD-SAMPLE-0001",
      type: "Cancellation Exception - High Value",
      reason: "customer request cancellation",
      raised_by: "voice_agent",
      exception: true,
    });
    assert.equal(res.status, 201);
    const ticket = await res.json();
    assert.equal(ticket.type, "Cancellation Exception - High Value");
    assert.ok(ticket.ticket_id);

    const detail = await post(base, "GetOrderDetailForPhoneAIByOrderNo?orderno=ORD-SAMPLE-0001");
    const order = await detail.json();
    assert.equal(order.exception_flag, true);
  } finally {
    server.close();
  }
});

test("CreateRMAForOrderAI then GetRMAHistoryByOrderNo reflects it", async () => {
  const { server, base } = startServer();
  try {
    await post(base, "CreateRMAForOrderAI", { orderno: "ORD-SAMPLE-0001", reason: "wrong size" });
    const res = await post(base, "GetRMAHistoryByOrderNo?orderno=ORD-SAMPLE-0001");
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
      orderno: "ORD-SAMPLE-0001",
      type: "Order Decline Review",
      reason: "order declined",
      raised_by: "voice_agent",
    });
    const res = await post(base, "GetTicketsByOrderNo?orderno=ORD-SAMPLE-0001");
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
      orderno: "ORD-SAMPLE-0001",
      reason: "no movement, has Extend",
    });
    assert.equal(res.status, 201);
    const ticketsRes = await post(base, "GetTicketsByOrderNo?orderno=ORD-SAMPLE-0001");
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test test/jomashopApiActions.test.js`
Expected: FAIL — 404s, routes don't exist yet

- [ ] **Step 7: Add the action routes to `routes/jomashopApi.js`**

Add near the top of the file, alongside the existing `require`:

```javascript
const { save } = require("../lib/store");
const { nextId } = require("../lib/ids");
```

(Change the existing `const { load } = require("../lib/store");` line to `const { load, save } = require("../lib/store");`.)

Add these routes before `module.exports = router;`:

```javascript
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test test/jomashopApiActions.test.js`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 9: Run the full test suite so far**

Run: `node --test`
Expected: PASS — all tests across all files, 0 failures

- [ ] **Step 10: Commit**

```bash
git add lib/ids.js routes/jomashopApi.js test/ids.test.js test/jomashopApiActions.test.js
git commit -m "Add Jomashop-shaped action endpoints (cancel, ticket, RMA, extend claim, call log)"
```

---

## Task 6: Full seed-data generation covering every SOP branch

**Files:**
- Create: `seed/generate.js`
- Modify: `package.json` (add `"seed"` script)
- Create: `test/seedCoverage.test.js`

**Interfaces:**
- Consumes: `lib/calendar.js`'s `addBusinessDays` is NOT used here directly (this script computes dates going *backward* from today, which `addBusinessDays` doesn't do) — instead it defines its own local `businessDaysAgo`/`calendarDaysAgo` helpers, kept private to this script.
- Produces: `seed/generate.js` exports `{ orders }` (the array of generated order objects) for Task 7's scenario harness to import directly, and — when run as `node seed/generate.js` — writes `seed/orders.json` and `seed/rma.json` to disk (overwriting the Task 3 placeholder).

This script computes order dates **relative to the current date at generation time**, not hardcoded calendar dates — so re-running `npm run seed` keeps every "in window" / "past window" scenario correct regardless of when it's run, instead of the fixture going stale.

- [ ] **Step 1: Write the failing test**

Create `test/seedCoverage.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { orders } = require("../seed/generate");

function find(orderNumber) {
  return orders.find((o) => o.order_number === orderNumber);
}

test("generates exactly 33 orders", () => {
  assert.equal(orders.length, 33);
});

test("covers every Approval Status branch (Section 4.2)", () => {
  for (const id of [
    "ORD-APR-APPROVED",
    "ORD-APR-PENDING-INWINDOW",
    "ORD-APR-PENDING-PASTWINDOW",
    "ORD-APR-DECLINED",
    "ORD-APR-BACKORDERED-INWINDOW",
    "ORD-APR-BACKORDERED-PASTWINDOW",
    "ORD-APR-NONE-INWINDOW",
    "ORD-APR-NONE-PASTDUE",
  ]) {
    assert.ok(find(id), `missing seed order ${id}`);
  }
});

test("covers every Item Status branch plus payment-hold variants (Section 4.3)", () => {
  for (const id of [
    "ORD-ITEM-OPEN",
    "ORD-ITEM-PICKED",
    "ORD-ITEM-PARTIAL-PICKED",
    "ORD-ITEM-PICKED-DROP",
    "ORD-ITEM-COMEIN-DROP",
    "ORD-ITEM-CANCELED",
    "ORD-ITEM-CLOSED",
    "ORD-HOLD-OPEN",
    "ORD-HOLD-PICKED",
    "ORD-HOLD-CLOSED",
  ]) {
    assert.ok(find(id), `missing seed order ${id}`);
  }
  assert.equal(find("ORD-HOLD-OPEN").payment_hold, true);
});

test("covers every Cancellation branch (Section 5)", () => {
  const over = find("ORD-CANCEL-OVER2000");
  assert.ok(over.order_value > 2000);
  for (const id of [
    "ORD-CANCEL-UNDER-OPEN",
    "ORD-CANCEL-UNDER-PICKED",
    "ORD-CANCEL-UNDER-PARTIAL-PICKED",
    "ORD-CANCEL-UNDER-PICKED-DROP",
    "ORD-CANCEL-UNDER-COMEIN-DROP",
    "ORD-CANCEL-UNDER-CLOSED",
  ]) {
    const order = find(id);
    assert.ok(order, `missing seed order ${id}`);
    assert.ok(order.order_value < 2000);
  }
});

test("covers every Returns branch (Section 6), repeat-RMA order has a pre-existing rma record", () => {
  assert.ok(find("ORD-RMA-UNDER-FIRST").order_value < 2000);
  assert.ok(find("ORD-RMA-UNDER-REPEAT").order_value < 2000);
  assert.ok(find("ORD-RMA-OVER2000").order_value > 2000);

  const { rmaRecords } = require("../seed/generate");
  assert.ok(rmaRecords.some((r) => r.order_number === "ORD-RMA-UNDER-REPEAT"));
});

test("covers every Shipping Delay branch (Section 7)", () => {
  const extendNoMovement = find("ORD-DELAY-EXTEND-NOMOVEMENT");
  assert.equal(extendNoMovement.extend_protection, true);
  assert.equal(extendNoMovement.shipment.tracking_status, "no_movement");

  const under7 = find("ORD-DELAY-NOEXTEND-UNDER7");
  assert.equal(under7.extend_protection, false);

  const over7 = find("ORD-DELAY-NOEXTEND-OVER7");
  assert.equal(over7.extend_protection, false);

  const { businessDaysBetween } = require("../lib/calendar");
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(businessDaysBetween(under7.shipment.ship_date, today) < 7);
  assert.ok(businessDaysBetween(over7.shipment.ship_date, today) >= 7);

  for (const id of ["ORD-DELAY-EXTEND-NOTRECEIVED", "ORD-DELAY-NOEXTEND-NOTRECEIVED"]) {
    const order = find(id);
    assert.equal(order.shipment.tracking_status, "delivered");
    assert.ok(order.shipment.delivered_date);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/seedCoverage.test.js`
Expected: FAIL — `Cannot find module '../seed/generate'`

- [ ] **Step 3: Implement `seed/generate.js`**

```javascript
const fs = require("fs");
const path = require("path");

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function businessDaysAgo(n) {
  const date = new Date();
  let remaining = n;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return isoDate(date);
}

function calendarDaysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return isoDate(date);
}

const BASE_ITEM = [{ sku: "WATCH-1000", name: "Example Watch", price: 500 }];

const NO_SHIPMENT = {
  shipped: false,
  ship_date: null,
  tracking_number: null,
  tracking_status: null,
  last_movement_date: null,
  delivered_date: null,
};

function order(overrides) {
  return {
    order_number: overrides.order_number,
    customer_id: overrides.customer_id || "CUST-100001",
    order_datetime: overrides.order_datetime || `${businessDaysAgo(1)}T10:00:00-04:00`,
    order_value: overrides.order_value !== undefined ? overrides.order_value : 500,
    approval_status: overrides.approval_status || "Approved",
    item_status: overrides.item_status || "Open",
    shipping_availability_text:
      overrides.shipping_availability_text || "Usually Ships in 3-5 Business Days",
    shipping_method: overrides.shipping_method || "Standard",
    payment_hold: overrides.payment_hold || false,
    extend_protection: overrides.extend_protection || false,
    exception_flag: false,
    items: overrides.items || BASE_ITEM,
    shipment: overrides.shipment || NO_SHIPMENT,
  };
}

function shippedShipment({ shipDaysAgo, trackingStatus, lastMovementDaysAgo, deliveredDaysAgo, trackingNumber }) {
  return {
    shipped: true,
    ship_date: businessDaysAgo(shipDaysAgo),
    tracking_number: trackingNumber,
    tracking_status: trackingStatus,
    last_movement_date: businessDaysAgo(lastMovementDaysAgo !== undefined ? lastMovementDaysAgo : shipDaysAgo),
    delivered_date: deliveredDaysAgo !== undefined ? calendarDaysAgo(deliveredDaysAgo) : null,
  };
}

const orders = [
  // --- Section 4.2 Approval Status branches (8) ---
  order({ order_number: "ORD-APR-APPROVED", approval_status: "Approved", item_status: "Open" }),
  order({
    order_number: "ORD-APR-PENDING-INWINDOW",
    approval_status: "Pending",
    order_datetime: `${businessDaysAgo(1)}T10:00:00-04:00`,
    shipping_availability_text: "Order under review - typically resolved within 2 business days",
  }),
  order({
    order_number: "ORD-APR-PENDING-PASTWINDOW",
    approval_status: "Pending",
    order_datetime: `${businessDaysAgo(6)}T10:00:00-04:00`,
    shipping_availability_text: "Order under review - typically resolved within 2 business days",
  }),
  order({ order_number: "ORD-APR-DECLINED", approval_status: "Declined" }),
  order({
    order_number: "ORD-APR-BACKORDERED-INWINDOW",
    approval_status: "BackOrdered",
    order_datetime: `${businessDaysAgo(2)}T10:00:00-04:00`,
    shipping_availability_text: "Usually Ships in 10-15 Business Days",
  }),
  order({
    order_number: "ORD-APR-BACKORDERED-PASTWINDOW",
    approval_status: "BackOrdered",
    order_datetime: `${businessDaysAgo(20)}T10:00:00-04:00`,
    shipping_availability_text: "Usually Ships in 10-15 Business Days",
  }),
  order({
    order_number: "ORD-APR-NONE-INWINDOW",
    approval_status: "None",
    order_datetime: `${businessDaysAgo(1)}T10:00:00-04:00`,
  }),
  order({
    order_number: "ORD-APR-NONE-PASTDUE",
    approval_status: "None",
    order_datetime: `${businessDaysAgo(8)}T10:00:00-04:00`,
  }),

  // --- Section 4.3 Item Status branches (7) + payment-hold variants (3) ---
  order({ order_number: "ORD-ITEM-OPEN", item_status: "Open" }),
  order({ order_number: "ORD-ITEM-PICKED", item_status: "Picked" }),
  order({ order_number: "ORD-ITEM-PARTIAL-PICKED", item_status: "Partial Picked" }),
  order({ order_number: "ORD-ITEM-PICKED-DROP", item_status: "Picked Drop" }),
  order({ order_number: "ORD-ITEM-COMEIN-DROP", item_status: "ComeIn Drop" }),
  order({ order_number: "ORD-ITEM-CANCELED", item_status: "Canceled" }),
  order({
    order_number: "ORD-ITEM-CLOSED",
    item_status: "Closed",
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 8, trackingNumber: "1Z0000000TESTCLOSED" }),
  }),
  order({ order_number: "ORD-HOLD-OPEN", item_status: "Open", payment_hold: true }),
  order({ order_number: "ORD-HOLD-PICKED", item_status: "Picked", payment_hold: true }),
  order({
    order_number: "ORD-HOLD-CLOSED",
    item_status: "Closed",
    payment_hold: true,
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 8, trackingNumber: "1Z0000000TESTHOLD" }),
  }),

  // --- Section 5 Cancellation branches (7) ---
  order({ order_number: "ORD-CANCEL-OVER2000", order_value: 2500, item_status: "Open" }),
  order({ order_number: "ORD-CANCEL-UNDER-OPEN", order_value: 500, item_status: "Open" }),
  order({ order_number: "ORD-CANCEL-UNDER-PICKED", order_value: 500, item_status: "Picked" }),
  order({ order_number: "ORD-CANCEL-UNDER-PARTIAL-PICKED", order_value: 500, item_status: "Partial Picked" }),
  order({ order_number: "ORD-CANCEL-UNDER-PICKED-DROP", order_value: 500, item_status: "Picked Drop" }),
  order({ order_number: "ORD-CANCEL-UNDER-COMEIN-DROP", order_value: 500, item_status: "ComeIn Drop" }),
  order({
    order_number: "ORD-CANCEL-UNDER-CLOSED",
    order_value: 500,
    item_status: "Closed",
    shipment: shippedShipment({ shipDaysAgo: 5, trackingStatus: "delivered", lastMovementDaysAgo: 4, trackingNumber: "1Z0000000TESTCANCELCLOSED" }),
  }),

  // --- Section 6 Returns branches (3) ---
  order({
    order_number: "ORD-RMA-UNDER-FIRST",
    order_value: 500,
    item_status: "Closed",
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 9, trackingNumber: "1Z0000000TESTRMA1" }),
  }),
  order({
    order_number: "ORD-RMA-UNDER-REPEAT",
    order_value: 500,
    item_status: "Closed",
    shipment: shippedShipment({ shipDaysAgo: 20, trackingStatus: "delivered", lastMovementDaysAgo: 19, trackingNumber: "1Z0000000TESTRMA2" }),
  }),
  order({
    order_number: "ORD-RMA-OVER2000",
    order_value: 3000,
    item_status: "Closed",
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 9, trackingNumber: "1Z0000000TESTRMA3" }),
  }),

  // --- Section 7 Shipping Delay branches (5) ---
  order({
    order_number: "ORD-DELAY-EXTEND-NOMOVEMENT",
    item_status: "Closed",
    extend_protection: true,
    shipment: shippedShipment({ shipDaysAgo: 5, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY1" }),
  }),
  order({
    order_number: "ORD-DELAY-NOEXTEND-UNDER7",
    item_status: "Closed",
    extend_protection: false,
    shipment: shippedShipment({ shipDaysAgo: 3, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY2" }),
  }),
  order({
    order_number: "ORD-DELAY-NOEXTEND-OVER7",
    item_status: "Closed",
    extend_protection: false,
    shipment: shippedShipment({ shipDaysAgo: 9, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY3" }),
  }),
  order({
    order_number: "ORD-DELAY-EXTEND-NOTRECEIVED",
    item_status: "Closed",
    extend_protection: true,
    shipment: shippedShipment({ shipDaysAgo: 6, trackingStatus: "delivered", lastMovementDaysAgo: 3, deliveredDaysAgo: 2, trackingNumber: "1Z0000000TESTDELAY4" }),
  }),
  order({
    order_number: "ORD-DELAY-NOEXTEND-NOTRECEIVED",
    item_status: "Closed",
    extend_protection: false,
    shipment: shippedShipment({ shipDaysAgo: 6, trackingStatus: "delivered", lastMovementDaysAgo: 3, deliveredDaysAgo: 2, trackingNumber: "1Z0000000TESTDELAY5" }),
  }),
];

const rmaRecords = [
  {
    rma_id: "RMA-5001",
    order_number: "ORD-RMA-UNDER-REPEAT",
    reason: "Missing manual documentation from a prior return",
    created_at: `${businessDaysAgo(15)}T00:00:00Z`,
  },
];

module.exports = { orders, rmaRecords };

if (require.main === module) {
  const seedDir = __dirname;
  fs.writeFileSync(path.join(seedDir, "orders.json"), JSON.stringify(orders, null, 2));
  fs.writeFileSync(path.join(seedDir, "rma.json"), JSON.stringify(rmaRecords, null, 2));
  console.log(`Wrote ${orders.length} orders to seed/orders.json and ${rmaRecords.length} rma record(s) to seed/rma.json`);
}
```

- [ ] **Step 4: Add the `seed` script to `package.json`**

Change:

```json
  "scripts": {
    "start": "node server.js"
  },
```

to:

```json
  "scripts": {
    "start": "node server.js",
    "seed": "node seed/generate.js",
    "test": "node --test"
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/seedCoverage.test.js`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 6: Regenerate the seed files and clear stale data so the server picks them up**

Run: `npm run seed && rm -f data/orders.json data/rma.json`
Expected: `Wrote 33 orders to seed/orders.json and 1 rma record(s) to seed/rma.json`

- [ ] **Step 7: Run the full test suite**

Run: `node --test`
Expected: PASS — all tests across all files, 0 failures (note: `test/entities.test.js`'s sample-order assertion now looks for `ORD-SAMPLE-0001`, which the regenerated `seed/orders.json` no longer contains — update that one assertion to check for `ORD-APR-APPROVED` instead, since Task 3's placeholder is superseded)

- [ ] **Step 7b: Fix the now-stale assertion in `test/entities.test.js`**

Change:

```javascript
    assert.ok(body.some((o) => o.order_number === "ORD-SAMPLE-0001"));
```

to:

```javascript
    assert.ok(body.some((o) => o.order_number === "ORD-APR-APPROVED"));
```

Re-run: `node --test`
Expected: PASS — all tests, 0 failures

- [ ] **Step 8: Commit**

```bash
git add seed/generate.js seed/orders.json seed/rma.json package.json test/seedCoverage.test.js test/entities.test.js
git commit -m "Generate full SOP-branch-coverage seed data, relative to current date"
```

---

## Task 7: SOP decision helpers + scenario harness

**Files:**
- Create: `scenarios/sopDecisions.js`
- Create: `scenarios/run.js`
- Modify: `package.json` (add `"scenarios"` script)

**Interfaces:**
- Consumes: `seed/generate.js`'s `{ orders, rmaRecords }`; `lib/calendar.js`'s `businessDaysBetween`; `lib/auth.js`'s `CREDENTIAL`; the running server's `/api/*` endpoints (Task 4/5).
- Produces: `scenarios/sopDecisions.js` exports pure functions `orderStatusDecision(order)`, `cancellationDecision(order)`, `returnsDecision(order, rmaCount)`, `shippingDelayDecision(order)` — each internally compares against the current date via `lib/calendar.js`'s `businessDaysBetween`, so no caller ever passes "today" in. They return `{ escalate: boolean, ticketType: string | null }` (or, for shipping delay, `{ action: "extend" | "escalate" | "wait", ticketType: string | null }`). These encode the SOP's own decision tables for the harness's expected-outcome computation ONLY — they are test-only code, never imported by `server.js` or `routes/*`, preserving the "CRM is dumb" constraint.

This is the harness described in spec Section 8: it assumes the server is already running and drives it purely over HTTP, exactly as a voice agent would.

- [ ] **Step 1: Implement `scenarios/sopDecisions.js`**

There's no separate failing-test step for this file — it's exercised end-to-end by `scenarios/run.js` in Step 3, which doubles as its test (this mirrors how the spec's Section 8 harness is meant to validate the whole chain, not the decision functions in isolation).

```javascript
const { businessDaysBetween } = require("../lib/calendar");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function orderStatusDecision(order) {
  const orderDate = order.order_datetime.slice(0, 10);
  const elapsed = businessDaysBetween(orderDate, today());

  switch (order.approval_status) {
    case "Approved":
      return itemStatusDecision(order);
    case "Pending":
      return elapsed > 2
        ? { escalate: true, ticketType: "Order Review — Pending Past Window" }
        : { escalate: false, ticketType: null };
    case "Declined":
      return { escalate: true, ticketType: "Order Decline Review" };
    case "BackOrdered":
      return elapsed > 15
        ? { escalate: true, ticketType: "Backorder Escalation" }
        : { escalate: false, ticketType: null };
    case "None":
      return elapsed > 5
        ? { escalate: true, ticketType: "Order Review — Undetermined Status" }
        : { escalate: false, ticketType: null };
    default:
      throw new Error(`Unknown approval_status: ${order.approval_status}`);
  }
}

function itemStatusDecision(order) {
  if (order.payment_hold && ["Open", "Picked", "Closed"].includes(order.item_status)) {
    return { escalate: true, ticketType: "Payment Hold Review" };
  }
  return { escalate: false, ticketType: null };
}

function cancellationDecision(order) {
  if (order.order_value > 2000) {
    return { action: "escalate", ticketType: "Cancellation Exception — High Value" };
  }
  if (["Open", "ComeIn Drop"].includes(order.item_status)) {
    return { action: "cancel", ticketType: null };
  }
  if (["Picked", "Partial Picked"].includes(order.item_status)) {
    return { action: "escalate", ticketType: "Cancellation Exception — In Process" };
  }
  if (order.item_status === "Picked Drop") {
    return { action: "escalate", ticketType: "Cancellation Exception — Drop-Ship Vendor" };
  }
  if (order.item_status === "Closed") {
    return { action: "blocked", ticketType: null };
  }
  throw new Error(`Unhandled item_status for cancellation: ${order.item_status}`);
}

function returnsDecision(order, rmaCount) {
  if (order.order_value > 2000) {
    return { action: "escalate", ticketType: "Return Authorization — High Value" };
  }
  if (rmaCount === 0) {
    return { action: "self_service", ticketType: null };
  }
  return { action: "escalate", ticketType: "Return Escalation — Repeat Request" };
}

function shippingDelayDecision(order) {
  const shipDate = order.shipment.ship_date;

  if (order.shipment.tracking_status === "no_movement") {
    if (order.extend_protection) {
      return { action: "extend", ticketType: null };
    }
    const elapsed = businessDaysBetween(shipDate, today());
    return elapsed >= 7
      ? { action: "escalate", ticketType: "Carrier Claim — No Movement" }
      : { action: "wait", ticketType: null };
  }

  if (order.shipment.tracking_status === "delivered" && order.shipment.delivered_date) {
    return order.extend_protection
      ? { action: "extend", ticketType: null }
      : { action: "escalate", ticketType: "Carrier Claim — Not Received" };
  }

  throw new Error(`Unhandled shipment state for order ${order.order_number}`);
}

module.exports = { orderStatusDecision, cancellationDecision, returnsDecision, shippingDelayDecision };
```

- [ ] **Step 2: Implement `scenarios/run.js`**

```javascript
const { orders, rmaRecords } = require("../seed/generate");
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

  await runGroup(
    "order-status",
    orders.filter((o) => o.order_number.startsWith("ORD-APR") || o.order_number.startsWith("ORD-ITEM") || o.order_number.startsWith("ORD-HOLD")),
    runOrderStatusScenario
  );
  await runGroup("cancellation", orders.filter((o) => o.order_number.startsWith("ORD-CANCEL")), runCancellationScenario);
  await runGroup("returns", orders.filter((o) => o.order_number.startsWith("ORD-RMA")), runReturnsScenario);
  await runGroup("shipping-delay", orders.filter((o) => o.order_number.startsWith("ORD-DELAY")), runShippingDelayScenario);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
```

- [ ] **Step 3: Add the `scenarios` script to `package.json`**

Change the `scripts` block again to:

```json
  "scripts": {
    "start": "node server.js",
    "seed": "node seed/generate.js",
    "test": "node --test",
    "scenarios": "node scenarios/run.js"
  },
```

- [ ] **Step 4: Start the server, reseed, and run the scenario harness**

Run:

```bash
rm -f data/orders.json data/tickets.json data/rma.json data/call_logs.json data/extend_claims.json
npm run seed
node server.js &
sleep 1
npm run scenarios
kill %1
```

Expected: `33 passed, 0 failed` (one scenario per seeded order — every `ORD-APR-*`/`ORD-ITEM-*`/`ORD-HOLD-*` order runs through `runOrderStatusScenario`, every `ORD-CANCEL-*` through `runCancellationScenario`, every `ORD-RMA-*` through `runReturnsScenario`, every `ORD-DELAY-*` through `runShippingDelayScenario`).

If any scenario fails, read its printed error, fix the mismatched decision logic or seed data (not the test), and re-run before proceeding.

- [ ] **Step 5: Commit**

```bash
git add scenarios/sopDecisions.js scenarios/run.js package.json
git commit -m "Add SOP decision helpers and end-to-end scenario harness"
```

---

## Task 8: OpenAPI docs + README sync

**Files:**
- Modify: `public/openapi.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new (documentation only, no behavior change).

- [ ] **Step 1: Add the new paths to `public/openapi.json`**

Insert into the `"paths"` object (after the existing `"/{entity}/{id}"` entry, before the closing brace), and add `"security"` + a `basicAuth` scheme under `"components"`:

```json
    "/api/GetOrdersForPhoneAIByPhoneNo": {
      "post": {
        "summary": "Look up orders by phone number (mirrors the real Jomashop endpoint)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "phoneno", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" }, "404": { "description": "No customer found" } }
      }
    },
    "/api/GetOrdersForEmailAI": {
      "post": {
        "summary": "Look up orders by email (invented — no real endpoint shared yet)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "email", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" }, "404": { "description": "No customer found" } }
      }
    },
    "/api/GetOrdersForNameAI": {
      "post": {
        "summary": "Look up orders by name (invented — no real endpoint shared yet)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "name", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" }, "404": { "description": "No customer found" } }
      }
    },
    "/api/GetOrderDetailForPhoneAIByOrderNo": {
      "post": {
        "summary": "Get full order detail by order number (mirrors the real Jomashop endpoint)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "orderno", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" }, "404": { "description": "Order not found" } }
      }
    },
    "/api/CancelOrderForPhoneAI": {
      "post": {
        "summary": "Cancel an order unconditionally (invented — CRM does not enforce SOP thresholds)",
        "security": [{ "basicAuth": [] }],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object", "required": ["orderno"], "properties": { "orderno": { "type": "string" } } } } } },
        "responses": { "200": { "description": "OK" }, "404": { "description": "Order not found" } }
      }
    },
    "/api/RaiseZendeskTicket": {
      "post": {
        "summary": "Raise a Zendesk ticket (invented)",
        "security": [{ "basicAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["orderno", "type"],
                "properties": {
                  "orderno": { "type": "string" },
                  "type": { "type": "string" },
                  "reason": { "type": "string" },
                  "raised_by": { "type": "string" },
                  "exception": { "type": "boolean" }
                }
              }
            }
          }
        },
        "responses": { "201": { "description": "Created" }, "404": { "description": "Order not found" } }
      }
    },
    "/api/CreateRMAForOrderAI": {
      "post": {
        "summary": "Create an RMA/return record (invented)",
        "security": [{ "basicAuth": [] }],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object", "required": ["orderno"], "properties": { "orderno": { "type": "string" }, "reason": { "type": "string" } } } } } },
        "responses": { "201": { "description": "Created" }, "404": { "description": "Order not found" } }
      }
    },
    "/api/GetRMAHistoryByOrderNo": {
      "post": {
        "summary": "Get RMA count/history for an order (invented)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "orderno", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/api/GetTicketsByOrderNo": {
      "post": {
        "summary": "Get tickets raised for an order (invented)",
        "security": [{ "basicAuth": [] }],
        "parameters": [{ "name": "orderno", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/api/SendExtendClaimEmailAI": {
      "post": {
        "summary": "Record that an Extend claim email was sent (invented — not a Zendesk ticket)",
        "security": [{ "basicAuth": [] }],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object", "required": ["orderno"], "properties": { "orderno": { "type": "string" }, "reason": { "type": "string" } } } } } },
        "responses": { "201": { "description": "Created" }, "404": { "description": "Order not found" } }
      }
    },
    "/api/AddNurixAICallLog": {
      "post": {
        "summary": "Log a call transcript (mirrors the real Jomashop endpoint)",
        "security": [{ "basicAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["Transcript", "Solved"],
                "properties": {
                  "PhoneNo": { "type": "string" },
                  "OrderNo": { "type": "string" },
                  "ItemNo": { "type": "string" },
                  "Email": { "type": "string" },
                  "Transcript": { "type": "string" },
                  "Solved": { "type": "boolean" }
                }
              }
            }
          }
        },
        "responses": { "201": { "description": "Created" } }
      }
    },
    "/tools/calendar/add-business-days": {
      "post": {
        "summary": "Add N business days to a date (weekends skipped, no auth)",
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object", "required": ["start_date", "business_days"], "properties": { "start_date": { "type": "string" }, "business_days": { "type": "number" } } } } } },
        "responses": { "200": { "description": "OK" }, "400": { "description": "Invalid input" } }
      }
    },
    "/tools/calendar/business-days-between": {
      "post": {
        "summary": "Count business days between two dates (weekends skipped, no auth)",
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object", "required": ["date_a", "date_b"], "properties": { "date_a": { "type": "string" }, "date_b": { "type": "string" } } } } } },
        "responses": { "200": { "description": "OK" }, "400": { "description": "Invalid input" } }
      }
    }
```

Add a `"security"`/`"securitySchemes"` block under `"components"` (alongside the existing `"schemas"` key):

```json
    "securitySchemes": {
      "basicAuth": { "type": "http", "scheme": "basic" }
    }
```

- [ ] **Step 2: Verify the OpenAPI JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/openapi.json', 'utf8')); console.log('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 3: Verify Swagger UI loads it without errors**

Run: `node server.js &`, then open `http://localhost:3000/api-docs.html` in a browser (or `curl -s http://localhost:3000/openapi.json | head -c 200`) — confirm the new `/api/*` and `/tools/calendar/*` paths appear; `kill %1` when done.

- [ ] **Step 4: Update `README.md`**

Add a new section after the existing "## Endpoints" table:

```markdown
## Jomashop-shaped mock API (`/api/*`)

These endpoints require HTTP Basic auth and simulate what a voice agent
calls during a live call. `GetOrdersForPhoneAIByPhoneNo`,
`GetOrderDetailForPhoneAIByOrderNo`, and `AddNurixAICallLog` mirror the
3 real endpoints Jomashop shared. Everything else is an invented
placeholder in the same naming style, pending a real contract.

Credential: set `JOMASHOP_MOCK_CREDENTIAL` (format `user:pass`), or use
the default `nurix-mock:practice-only-2026` for local dev. This is a
practice-only credential — never the real Jomashop secret.

| Endpoint | Real or invented |
|---|---|
| `POST /api/GetOrdersForPhoneAIByPhoneNo?phoneno=` | Real |
| `POST /api/GetOrdersForEmailAI?email=` | Invented |
| `POST /api/GetOrdersForNameAI?name=` | Invented |
| `POST /api/GetOrderDetailForPhoneAIByOrderNo?orderno=` | Real |
| `POST /api/CancelOrderForPhoneAI` | Invented |
| `POST /api/RaiseZendeskTicket` | Invented |
| `POST /api/CreateRMAForOrderAI` | Invented |
| `POST /api/GetRMAHistoryByOrderNo?orderno=` | Invented |
| `POST /api/GetTicketsByOrderNo?orderno=` | Invented |
| `POST /api/SendExtendClaimEmailAI` | Invented |
| `POST /api/AddNurixAICallLog` | Real |

## Calendar tool (`/tools/calendar/*`)

No auth. Business-day math for SOP window checks — weekends skipped,
US holidays NOT excluded (documented simplification).

```bash
curl -X POST $BASE/tools/calendar/add-business-days \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2026-01-05", "business_days": 3}'

curl -X POST $BASE/tools/calendar/business-days-between \
  -H "Content-Type: application/json" \
  -d '{"date_a": "2026-01-05", "date_b": "2026-01-08"}'
```

## Seed data & scenario harness

```bash
npm run seed        # (re)generates seed/orders.json and seed/rma.json,
                     # dates computed relative to today so "in window" /
                     # "past window" scenarios stay correct over time
rm -f data/*.json    # clear any stale persisted state
npm start &          # start the server
npm run scenarios    # plays the voice agent's role through every SOP
                     # branch over real HTTP, asserts outcomes
```

See `docs/superpowers/specs/2026-07-21-mock-crm-design.md` for the full
design rationale.
```

- [ ] **Step 5: Commit**

```bash
git add public/openapi.json README.md
git commit -m "Document the Jomashop-shaped API and calendar tool in Swagger and README"
```
