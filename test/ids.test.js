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
