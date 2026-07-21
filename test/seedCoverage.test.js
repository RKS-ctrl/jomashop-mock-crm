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
