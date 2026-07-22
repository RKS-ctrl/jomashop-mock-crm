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
  order({ order_number: "MD43553K", approval_status: "Approved", item_status: "Open" }),
  order({
    order_number: "MD91827L",
    approval_status: "Pending",
    order_datetime: `${businessDaysAgo(1)}T10:00:00-04:00`,
    shipping_availability_text: "Order under review - typically resolved within 2 business days",
  }),
  order({
    order_number: "MD91828L",
    approval_status: "Pending",
    order_datetime: `${businessDaysAgo(6)}T10:00:00-04:00`,
    shipping_availability_text: "Order under review - typically resolved within 2 business days",
  }),
  order({ order_number: "MK55214P", approval_status: "Declined" }),
  order({
    order_number: "MK77302R",
    approval_status: "BackOrdered",
    order_datetime: `${businessDaysAgo(2)}T10:00:00-04:00`,
    shipping_availability_text: "Usually Ships in 10-15 Business Days",
  }),
  order({
    order_number: "MK77303R",
    approval_status: "BackOrdered",
    order_datetime: `${businessDaysAgo(20)}T10:00:00-04:00`,
    shipping_availability_text: "Usually Ships in 10-15 Business Days",
  }),
  order({
    order_number: "MN20456T",
    approval_status: "None",
    order_datetime: `${businessDaysAgo(1)}T10:00:00-04:00`,
  }),
  order({
    order_number: "MN20457T",
    approval_status: "None",
    order_datetime: `${businessDaysAgo(8)}T10:00:00-04:00`,
  }),

  // --- Section 4.3 Item Status branches (7) + payment-hold variants (3) ---
  order({ order_number: "MP63821W", item_status: "Open" }),
  order({ order_number: "MP63822W", item_status: "Picked" }),
  order({ order_number: "MP63823W", item_status: "Partial Picked" }),
  order({ order_number: "MP63824W", item_status: "Picked Drop" }),
  order({ order_number: "MP63825W", item_status: "ComeIn Drop" }),
  order({ order_number: "MP63826W", item_status: "Canceled" }),
  order({
    order_number: "MP63827W",
    item_status: "Closed",
    order_datetime: `${businessDaysAgo(12)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 8, trackingNumber: "1Z0000000TESTCLOSED" }),
  }),
  order({ order_number: "MQ48213X", item_status: "Open", payment_hold: true }),
  order({ order_number: "MQ48214X", item_status: "Picked", payment_hold: true }),
  order({
    order_number: "MQ48215X",
    item_status: "Closed",
    payment_hold: true,
    order_datetime: `${businessDaysAgo(12)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 8, trackingNumber: "1Z0000000TESTHOLD" }),
  }),

  // --- Section 5 Cancellation branches (7) ---
  order({ order_number: "MR39561Y", order_value: 2500, item_status: "Open" }),
  order({ order_number: "MR39562Y", order_value: 500, item_status: "Open" }),
  order({ order_number: "MR39563Y", order_value: 500, item_status: "Picked" }),
  order({ order_number: "MR39564Y", order_value: 500, item_status: "Partial Picked" }),
  order({ order_number: "MR39565Y", order_value: 500, item_status: "Picked Drop" }),
  order({ order_number: "MR39566Y", order_value: 500, item_status: "ComeIn Drop" }),
  order({
    order_number: "MR39567Y",
    order_value: 500,
    item_status: "Closed",
    order_datetime: `${businessDaysAgo(7)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 5, trackingStatus: "delivered", lastMovementDaysAgo: 4, trackingNumber: "1Z0000000TESTCANCELCLOSED" }),
  }),

  // --- Section 6 Returns branches (3) ---
  order({
    order_number: "MS72904Z",
    order_value: 500,
    item_status: "Closed",
    order_datetime: `${businessDaysAgo(12)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 9, trackingNumber: "1Z0000000TESTRMA1" }),
  }),
  order({
    order_number: "MS72905Z",
    order_value: 500,
    item_status: "Closed",
    order_datetime: `${businessDaysAgo(22)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 20, trackingStatus: "delivered", lastMovementDaysAgo: 19, trackingNumber: "1Z0000000TESTRMA2" }),
  }),
  order({
    order_number: "MS72906Z",
    order_value: 3000,
    item_status: "Closed",
    order_datetime: `${businessDaysAgo(12)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 10, trackingStatus: "delivered", lastMovementDaysAgo: 9, trackingNumber: "1Z0000000TESTRMA3" }),
  }),

  // --- Section 7 Shipping Delay branches (5) ---
  order({
    order_number: "MT85017A",
    item_status: "Closed",
    extend_protection: true,
    order_datetime: `${businessDaysAgo(7)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 5, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY1" }),
  }),
  order({
    order_number: "MT85018A",
    item_status: "Closed",
    extend_protection: false,
    order_datetime: `${businessDaysAgo(5)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 3, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY2" }),
  }),
  order({
    order_number: "MT85019A",
    item_status: "Closed",
    extend_protection: false,
    order_datetime: `${businessDaysAgo(11)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 9, trackingStatus: "no_movement", trackingNumber: "1Z0000000TESTDELAY3" }),
  }),
  order({
    order_number: "MT85020A",
    item_status: "Closed",
    extend_protection: true,
    order_datetime: `${businessDaysAgo(8)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 6, trackingStatus: "delivered", lastMovementDaysAgo: 3, deliveredDaysAgo: 2, trackingNumber: "1Z0000000TESTDELAY4" }),
  }),
  order({
    order_number: "MT85021A",
    item_status: "Closed",
    extend_protection: false,
    order_datetime: `${businessDaysAgo(8)}T10:00:00-04:00`,
    shipment: shippedShipment({ shipDaysAgo: 6, trackingStatus: "delivered", lastMovementDaysAgo: 3, deliveredDaysAgo: 2, trackingNumber: "1Z0000000TESTDELAY5" }),
  }),
];

const rmaRecords = [
  {
    rma_id: "RMA-5001",
    order_number: "MS72905Z",
    reason: "Missing manual documentation from a prior return",
    created_at: `${businessDaysAgo(15)}T00:00:00Z`,
  },
];

// Order numbers are now realistic opaque codes (no meaningful prefix), so
// the scenario harness groups orders by position rather than by parsing
// order_number — these slices mirror the section comments above.
const orderStatusOrders = orders.slice(0, 18); // Approval Status (8) + Item Status/Hold (10)
const cancellationOrders = orders.slice(18, 25); // Cancellation (7)
const returnsOrders = orders.slice(25, 28); // Returns (3)
const shippingDelayOrders = orders.slice(28, 33); // Shipping Delay (5)

module.exports = {
  orders,
  rmaRecords,
  orderStatusOrders,
  cancellationOrders,
  returnsOrders,
  shippingDelayOrders,
};

if (require.main === module) {
  const seedDir = __dirname;
  fs.writeFileSync(path.join(seedDir, "orders.json"), JSON.stringify(orders, null, 2));
  fs.writeFileSync(path.join(seedDir, "rma.json"), JSON.stringify(rmaRecords, null, 2));
  console.log(`Wrote ${orders.length} orders to seed/orders.json and ${rmaRecords.length} rma record(s) to seed/rma.json`);
}
