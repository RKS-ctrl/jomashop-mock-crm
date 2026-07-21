function nextId(map, prefix, start) {
  const numbers = Object.keys(map)
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => parseInt(id.slice(prefix.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numbers.length ? Math.max(...numbers) : start - 1;
  return `${prefix}-${max + 1}`;
}

module.exports = { nextId };
