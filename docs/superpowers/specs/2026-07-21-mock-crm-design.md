# Jomashop Mock CRM — Design Spec

Status: Approved for planning
Date: 2026-07-21

## 1. Purpose

Build a mock CRM backend that a voice agent can call over plain HTTP to execute
the four in-scope SOP flows (Order Status, Cancellations, Returns/RMA,
Shipping Delay) end-to-end, without touching Jomashop's real systems. The mock
is designed so that agent-integration code written against it transfers to the
real Jomashop API later with minimal change: where a real endpoint exists, the
mock mirrors its exact shape; where no real endpoint has been shared yet, the
mock invents one in the same style, clearly marked as a placeholder.

Reference: the SOP document ("Jomashop Voice Agent SOP — Draft for Approval",
v0.1) and the 3 real endpoints shared by Jomashop (`GetOrdersForPhoneAIByPhoneNo`,
`GetOrderDetailForPhoneAIByOrderNo`, `AddNurixAICallLog`, all under
`cancellationapi.jomashop.com` with HTTP Basic auth).

## 2. Scope

**In scope:** mock CRM (extends the existing `customer-crud-server` in this
repo), a calendar/business-day tool, and a scripted scenario harness that
exercises every SOP decision branch via real HTTP calls.

**Out of scope:** real voice/STT/TTS, the actual production integration, and
the Section 9 intents (pre-sales, damaged/wrong item, payment, pricing,
account/website, service) — no SOP exists for those yet.

## 3. Architecture

Extend the existing Express server (`server.js`, `lib/store.js`) rather than
starting a new project. Same JSON-file-per-entity storage, same
load-with-auto-seed-from-`seed/` pattern already in place for `customers`.

Three API surfaces on the same server, deliberately separated by purpose:

| Surface | Path prefix | Auth | Purpose |
| --- | --- | --- | --- |
| Jomashop-shaped API | `/api/*` | HTTP Basic (practice credential) | What the voice agent calls during a live call to execute the SOP. Mirrors real endpoints where they exist. |
| Calendar tool | `/tools/calendar/*` | None | Business-day math utility. Explicitly *not* part of the Jomashop contract — won't exist at the real integration; the agent platform (e.g. Nuplay) will need its own equivalent there. |
| Generic admin CRUD | `/customers`, `/orders`, `/tickets`, `/rma`, `/call_logs`, `/extend_claims` | None | Dev/test only — seeding scenario data and inspecting resulting state (tickets list doubles as a minimal IQ-Shop-style viewer). Existing pattern from `server.js`, extended to the new entities. |

The mock CRM does **not** enforce SOP business rules (thresholds, RMA-count
escalation, window checks). It records whatever it's told. This mirrors
reality — the 100-call audit found a human agent completing a $2,061.70
cancellation with no ticket raised, proving the real backend doesn't block
non-compliant actions — and lets the scenario harness actually test whether
the agent's own decision logic is correct, instead of the CRM masking agent
mistakes.

## 4. Data Model

Storage: one JSON file per entity under `data/`, auto-seeded from
`seed/<entity>.json` on first read (existing `lib/store.js` behavior,
unchanged).

### `customers` (existing entity, unchanged)

No schema changes. Existing fields (`profile`, `contact`, `addresses`,
`verification`, `account`, `preferences`, `summary`, `metadata`) are sufficient
for identity verification (phone/name/email) per SOP Section 2.

### `orders` (new, keyed by `order_number`)

```json
{
  "order_number": "M40E331Y",
  "customer_id": "CUST-100001",
  "order_datetime": "2026-07-15T14:05:00-04:00",
  "order_value": 1249.00,
  "approval_status": "Approved | Pending | Declined | BackOrdered | None",
  "item_status": "Open | Picked | Partial Picked | Picked Drop | ComeIn Drop | Canceled | Closed",
  "shipping_availability_text": "Usually Ships in 3-5 Business Days",
  "shipping_method": "Next Day Air",
  "payment_hold": false,
  "extend_protection": false,
  "exception_flag": false,
  "items": [
    { "sku": "WATCH-1001", "name": "Example Watch", "price": 1249.00 }
  ],
  "shipment": {
    "shipped": true,
    "ship_date": "2026-07-16",
    "tracking_number": "1Z999AA10123456784",
    "tracking_status": "no_movement | delivered",
    "last_movement_date": "2026-07-16",
    "delivered_date": null
  }
}
```

Notes:
- `item_status` keeps the SOP's own enum, including `Partial Picked` as a
  single value — no nested per-item status modeling, since the SOP never
  requires resolving partial status from underlying items.
- `shipping_availability_text` is literal prose (per Jomashop's actual CRM,
  confirmed in their meeting) — the agent parses it directly; the mock does
  not pre-parse or structure it.
- No precomputed deadline/window field — window checks are computed live by
  the agent using `order_datetime` / `shipment.ship_date` /
  `shipment.last_movement_date` plus the calendar tool (Section 6).
- `shipment.delivered_date` is set (non-null) only when `tracking_status` is
  `"delivered"` — needed for SOP Section 7.2's "still not located the
  following day" check.

### `tickets` (new, keyed by `ticket_id`)

```json
{
  "ticket_id": "ZD-10001",
  "order_number": "M40E331Y",
  "type": "Cancellation Exception - High Value",
  "reason": "customer request cancellation",
  "raised_by": "voice_agent",
  "created_at": "2026-07-21T10:15:00Z"
}
```

`type` values correspond to the SOP Section 8 ticket-trigger table (free text,
not a hard enum — new types can appear as the SOP evolves).

### `rma` (new, keyed by `rma_id`)

```json
{
  "rma_id": "RMA-5001",
  "order_number": "M40E331Y",
  "reason": "customer requested return",
  "created_at": "2026-07-21T10:15:00Z"
}
```

### `call_logs` (new, keyed by generated id, mirrors `AddNurixAICallLog` body)

```json
{
  "call_log_id": "CALL-9001",
  "PhoneNo": "7875551235",
  "OrderNo": "M40E331X",
  "ItemNo": "",
  "Email": "",
  "Transcript": "User called requesting status on order M40E331Y. AI provided tracking info.",
  "Solved": true,
  "created_at": "2026-07-21T10:15:00Z"
}
```

### `extend_claims` (new, keyed by `extend_claim_id`)

Records that Section 7's "send the Extend claim email" step happened. Kept
as its own entity rather than folded into `tickets` (Extend claims are
explicitly not Zendesk tickets, Section 3/8) or `call_logs` (whose shape
mirrors `AddNurixAICallLog` exactly and shouldn't be overloaded with an
unrelated record shape).

```json
{
  "extend_claim_id": "EXT-1",
  "order_number": "M40E331Y",
  "reason": "Package delayed, Extend protection on file",
  "created_at": "2026-07-21T10:15:00Z"
}
```

## 5. API Reference

All `/api/*` endpoints require `Authorization: Basic <credential>`. The mock
issues its own fresh practice credential — it does **not** reuse the real
Basic-auth secret embedded in the Postman collection Jomashop shared, so no
production credential ends up committed in this repo's test code. The
practice credential is documented in the README and configurable via an env
var, defaulting to a clearly-fake value for local dev.

### 5.1 Mirrored (same shape as the real 3 endpoints)

| Endpoint | Method | Params | Response |
| --- | --- | --- | --- |
| `/api/GetOrdersForPhoneAIByPhoneNo` | POST | `?phoneno=` | List of orders for that phone's customer |
| `/api/GetOrderDetailForPhoneAIByOrderNo` | POST | `?orderno=` | Full order record (Section 4 schema above) |
| `/api/AddNurixAICallLog` | POST | body: `{PhoneNo, OrderNo, ItemNo, Email, Transcript, Solved}` | `201` + stored record |

### 5.2 Invented (same naming/style, placeholders pending real contracts)

| Endpoint | Method | Params / Body | Effect |
| --- | --- | --- | --- |
| `/api/GetOrdersForEmailAI` | POST | `?email=` | List of orders for that email's customer (Section 2 allows email-based lookup; only phone was shared as a real endpoint) |
| `/api/GetOrdersForNameAI` | POST | `?name=` | Same, by name |
| `/api/CancelOrderForPhoneAI` | POST | body: `{orderno}` | Sets `item_status = "Canceled"` unconditionally, returns updated order. No threshold check — agent decides whether to call this or raise a ticket instead. |
| `/api/RaiseZendeskTicket` | POST | body: `{orderno, type, reason, raised_by, exception}` | Creates a `tickets` record. If `exception: true`, also sets `orders[orderno].exception_flag = true`. |
| `/api/CreateRMAForOrderAI` | POST | body: `{orderno, reason}` | Creates an `rma` record. No eligibility check. |
| `/api/GetRMAHistoryByOrderNo` | POST | `?orderno=` | `{order_number, rma_count, rma_records: [...]}` — lets the agent determine first vs. repeat RMA. |
| `/api/GetTicketsByOrderNo` | POST | `?orderno=` | `{order_number, tickets: [...]}` — direct lookup of tickets raised on an order, mirroring `GetRMAHistoryByOrderNo`'s pattern. Used by the scenario harness to assert ticket creation/type, and by the agent to check for existing open tickets before acting. |
| `/api/SendExtendClaimEmailAI` | POST | body: `{orderno, reason}` | Records that an Extend claim email was sent (no real email). Used for both Section 7 Extend branches, which raise no Zendesk ticket. |

### 5.3 Calendar tool (`/tools/calendar/*`, no auth)

| Endpoint | Method | Body | Response |
| --- | --- | --- | --- |
| `/tools/calendar/add-business-days` | POST | `{start_date, business_days}` | `{result_date}` |
| `/tools/calendar/business-days-between` | POST | `{date_a, date_b}` | `{business_days}` |

Both skip weekends. US holidays are not excluded by default (documented
simplification — flagged in README, not a hidden behavior).

### 5.4 Generic admin CRUD

Existing List/Create/Get/Update/Delete pattern from `server.js`, extended to
`orders`, `tickets`, `rma`, `call_logs` by adding them to the `ENTITIES` map —
no new code path needed beyond registering each with its id field.

## 6. SOP-to-endpoint mapping

| SOP section | Endpoints used |
| --- | --- |
| Sec 2 — Verification | `GetOrdersForPhoneAIByPhoneNo` / `-EmailAI` / `-NameAI`, `GetOrderDetailForPhoneAIByOrderNo` |
| Sec 4 — Order Status | `GetOrderDetailForPhoneAIByOrderNo`, calendar tool for window checks, `RaiseZendeskTicket` when escalating |
| Sec 5 — Cancellations | `CancelOrderForPhoneAI` (self-service path) or `RaiseZendeskTicket` (Exception path) |
| Sec 6 — Returns | `GetRMAHistoryByOrderNo`, then `CreateRMAForOrderAI` (self-service) or `RaiseZendeskTicket` (escalation) |
| Sec 7 — Shipping Delay | calendar tool for the 7-business-day / next-day checks, `SendExtendClaimEmailAI` (Extend paths) or `RaiseZendeskTicket` (non-Extend paths) |
| All sections | `AddNurixAICallLog` at end of call |

## 7. Seed / Scenario Coverage

Seed data must include one order per SOP branch so the scenario harness can
exercise all of them:

- Approval Status: Approved, Pending (in-window), Pending (past-window),
  Declined, BackOrdered (in-window), BackOrdered (past-window), None
  (in-window), None (past-due) — 8 orders.
- Item Status (Approval = Approved, so control reaches item-status logic):
  Open, Picked, Partial Picked, Picked Drop, ComeIn Drop, Canceled, Closed,
  plus one Closed/Open/Picked with `payment_hold: true` — 10 orders.
- Cancellations: one order value > $2,000 (any item status), plus one
  under-$2,000 order per cancellable/escalate/blocked item status (Open,
  Picked, Partial Picked, Picked Drop, ComeIn Drop, Closed) — 7 orders total
  (1 over-threshold + 6 under-threshold).
- Returns: under-$2,000 with 0 prior RMAs, under-$2,000 with 1+ prior RMA,
  over-$2,000 with 0 prior RMAs — 3 orders (plus matching `rma` seed
  records for the repeat case).
- Shipping Delay: Extend + no-movement, no-Extend + <7 business days
  no-movement, no-Extend + 7+ business days no-movement, Extend +
  delivered-not-received, no-Extend + delivered-not-received — 5 orders.

Total: roughly 33 seed orders (8 + 10 + 7 + 3 + 5) across a handful of seed
customers (existing `Erika Muirbrook` plus new ones as needed for
phone/email/name-based lookup coverage).

## 8. Scenario Harness

A `scenarios/` directory containing one scenario definition per branch above
(input: which endpoints to call and in what order; expected: resulting ticket
type or absence, resulting order/RMA state) and a runner script that:

1. Assumes the mock server is already running (e.g. `localhost:3000`).
2. Executes each scenario's HTTP calls in sequence, exactly as a voice agent
   would.
3. Asserts the expected outcome (ticket created with correct `type`, order
   `item_status`/`exception_flag` updated correctly, no ticket where none is
   expected).
4. Prints a pass/fail summary and exits non-zero on any failure.

## 9. Error Handling

- Unknown `order_number` / `customer_id` on an identity/detail lookup
  (`GetOrdersForPhoneAIByPhoneNo`/`-EmailAI`/`-NameAI`,
  `GetOrderDetailForPhoneAIByOrderNo`) → `404 {error}`. History-style lookups
  (`GetRMAHistoryByOrderNo`, `GetTicketsByOrderNo`) return `200` with an
  empty collection for an unknown order instead — a history query on a
  not-yet-known order is a legitimate "no history" answer, not an error.
- Missing required identity fields (no phone/name/email/order number) →
  `400 {error}`.
- Missing/invalid `Authorization` header on any `/api/*` call → `401 {error}`.
- Invalid date format to the calendar tool → `400 {error}`.
- All other behavior (thresholds, escalation eligibility) is intentionally
  unchecked by the CRM per Section 3.

## 10. Out of Scope

Real voice/STT/TTS integration, the actual production Jomashop connection,
and the six additional intents flagged in SOP Section 9 (no SOP exists for
those yet).
