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
  // Calendar-invalid dates (e.g. Feb 30) that roll over also throw
  assert.throws(() => addBusinessDays("2026-02-30", 1));
  assert.throws(() => businessDaysBetween("2026-02-30", "2026-03-01"));
});
