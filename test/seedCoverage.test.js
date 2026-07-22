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
    "MD43553K",
    "MD91827L",
    "MD91828L",
    "MK55214P",
    "MK77302R",
    "MK77303R",
    "MN20456T",
    "MN20457T",
  ]) {
    assert.ok(find(id), `missing seed order ${id}`);
  }
});

test("covers every Item Status branch plus payment-hold variants (Section 4.3)", () => {
  for (const id of [
    "MP63821W",
    "MP63822W",
    "MP63823W",
    "MP63824W",
    "MP63825W",
    "MP63826W",
    "MP63827W",
    "MQ48213X",
    "MQ48214X",
    "MQ48215X",
  ]) {
    assert.ok(find(id), `missing seed order ${id}`);
  }
  assert.equal(find("MQ48213X").payment_hold, true);
});

test("covers every Cancellation branch (Section 5)", () => {
  const over = find("MR39561Y");
  assert.ok(over.order_value > 2000);
  for (const id of [
    "MR39562Y",
    "MR39563Y",
    "MR39564Y",
    "MR39565Y",
    "MR39566Y",
    "MR39567Y",
  ]) {
    const order = find(id);
    assert.ok(order, `missing seed order ${id}`);
    assert.ok(order.order_value < 2000);
  }
});

test("covers every Returns branch (Section 6), repeat-RMA order has a pre-existing rma record", () => {
  assert.ok(find("MS72904Z").order_value < 2000);
  assert.ok(find("MS72905Z").order_value < 2000);
  assert.ok(find("MS72906Z").order_value > 2000);

  const { rmaRecords } = require("../seed/generate");
  assert.ok(rmaRecords.some((r) => r.order_number === "MS72905Z"));
});

test("covers every Shipping Delay branch (Section 7)", () => {
  const extendNoMovement = find("MT85017A");
  assert.equal(extendNoMovement.extend_protection, true);
  assert.equal(extendNoMovement.shipment.tracking_status, "no_movement");

  const under7 = find("MT85018A");
  assert.equal(under7.extend_protection, false);

  const over7 = find("MT85019A");
  assert.equal(over7.extend_protection, false);

  const { businessDaysBetween } = require("../lib/calendar");
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(businessDaysBetween(under7.shipment.ship_date, today) < 7);
  assert.ok(businessDaysBetween(over7.shipment.ship_date, today) >= 7);

  for (const id of ["MT85020A", "MT85021A"]) {
    const order = find(id);
    assert.equal(order.shipment.tracking_status, "delivered");
    assert.ok(order.shipment.delivered_date);
  }
});
