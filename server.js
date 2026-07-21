const express = require("express");
const cors = require("cors");
const { load, save } = require("./lib/store");
const calendarTools = require("./routes/calendarTools");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/tools/calendar", calendarTools);

// Add new entities here — each gets List/Create/Get/Update/Delete for free.
const ENTITIES = {
  customers: { idField: "customer_id" },
  orders: { idField: "order_number" },
  tickets: { idField: "ticket_id" },
  rma: { idField: "rma_id" },
  call_logs: { idField: "call_log_id" },
  extend_claims: { idField: "extend_claim_id" },
};

app.get("/", (req, res) => {
  const entities = Object.keys(ENTITIES).map((name) => {
    const map = load(name, ENTITIES[name].idField);
    return { name, count: Object.keys(map).length };
  });
  res.json({ entities });
});

app.param("entity", (req, res, next, entity) => {
  if (!ENTITIES[entity]) {
    return res.status(404).json({ error: `Unknown entity: ${entity}` });
  }
  next();
});

// LIST
app.get("/:entity", (req, res) => {
  const { idField } = ENTITIES[req.params.entity];
  const map = load(req.params.entity, idField);
  res.json(Object.values(map));
});

// CREATE
app.post("/:entity", (req, res) => {
  const { idField } = ENTITIES[req.params.entity];
  const record = req.body;
  const id = record && record[idField];
  if (!id) return res.status(400).json({ error: `${idField} is required` });
  const map = load(req.params.entity, idField);
  if (map[id]) return res.status(409).json({ error: `${id} already exists` });
  map[id] = record;
  save(req.params.entity, map);
  res.status(201).json(record);
});

// GET one
app.get("/:entity/:id", (req, res) => {
  const { idField } = ENTITIES[req.params.entity];
  const map = load(req.params.entity, idField);
  const record = map[req.params.id];
  if (!record) return res.status(404).json({ error: "Record not found" });
  res.json(record);
});

// UPDATE (shallow merge)
app.put("/:entity/:id", (req, res) => {
  const { idField } = ENTITIES[req.params.entity];
  const map = load(req.params.entity, idField);
  const existing = map[req.params.id];
  if (!existing) return res.status(404).json({ error: "Record not found" });
  const updated = { ...existing, ...req.body, [idField]: req.params.id };
  map[req.params.id] = updated;
  save(req.params.entity, map);
  res.json(updated);
});

// DELETE
app.delete("/:entity/:id", (req, res) => {
  const { idField } = ENTITIES[req.params.entity];
  const map = load(req.params.entity, idField);
  if (!map[req.params.id]) {
    return res.status(404).json({ error: "Record not found" });
  }
  delete map[req.params.id];
  save(req.params.entity, map);
  res.status(204).send();
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Customer CRUD server listening on :${PORT}`);
  });
}

module.exports = app;
