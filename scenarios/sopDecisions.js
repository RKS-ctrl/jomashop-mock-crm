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
