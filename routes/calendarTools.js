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
