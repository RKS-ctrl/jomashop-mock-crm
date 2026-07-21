function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function parseDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  // Validate that the parsed date round-trips back to the same YYYY-MM-DD
  // (rejects calendar-invalid dates like "2026-02-30" that silently roll over)
  if (date.toISOString().slice(0, 10) !== dateStr) {
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
