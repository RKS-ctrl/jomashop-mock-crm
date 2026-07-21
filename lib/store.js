const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SEED_DIR = path.join(__dirname, "..", "seed");

function dataFile(entity) {
  return path.join(DATA_DIR, `${entity}.json`);
}

function save(entity, map) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dataFile(entity), JSON.stringify(map, null, 2));
}

// Loads an entity's records as an { id: record } map, seeding from
// seed/<entity>.json the first time this entity is read.
function load(entity, idField) {
  const file = dataFile(entity);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const seedPath = path.join(SEED_DIR, `${entity}.json`);
  const seedRecords = fs.existsSync(seedPath)
    ? JSON.parse(fs.readFileSync(seedPath, "utf8"))
    : [];
  const map = {};
  for (const record of seedRecords) map[record[idField]] = record;
  save(entity, map);
  return map;
}

module.exports = { load, save };
