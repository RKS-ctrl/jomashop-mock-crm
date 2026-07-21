# Customer CRUD Server

A plain, always-on Express server exposing generic entity CRUD over a
customer dataset, backed by a local JSON file (`data/customers.json`).
No serverless platform, no special SDKs — just HTTP in, HTTP out, so any
external caller (including Nurix's Nuplay platform) can hit it over
plain HTTP/HTTPS.

Currently registered entities: `customers` (keyed by `customer_id`). Add
more by extending the `ENTITIES` map in [server.js](server.js) and adding a
matching `seed/<entity>.json`.

## Run locally

```bash
npm install
npm start   # listens on http://localhost:3000
```

## Docs

Swagger UI: `http://localhost:3000/api-docs.html` (spec at `/openapi.json`).

## Endpoints

| Method | Path            | Action                                |
|--------|-----------------|-----------------------------------------|
| GET    | `/`             | List all entities with record counts    |
| GET    | `/{entity}`     | List all records in an entity           |
| POST   | `/{entity}`     | Create a record                         |
| GET    | `/{entity}/{id}`| Get one record by id                    |
| PUT    | `/{entity}/{id}`| Update a record (shallow merge)         |
| DELETE | `/{entity}/{id}`| Delete a record                         |

## Try it

```bash
BASE=http://localhost:3000

curl $BASE/                       # list entities + counts (auto-seeds)
curl $BASE/customers               # list all customers
curl $BASE/customers/CUST-100001   # get one

curl -X POST $BASE/customers \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST-100002", "profile": {"first_name": "Jane"}}'

curl -X PUT $BASE/customers/CUST-100001 \
  -H "Content-Type: application/json" \
  -d '{"account": {"vip_customer": true}}'

curl -X DELETE $BASE/customers/CUST-100001
```

## Jomashop-shaped mock API (`/api/*`)

These endpoints require HTTP Basic auth and simulate what a voice agent
calls during a live call. `GetOrdersForPhoneAIByPhoneNo`,
`GetOrderDetailForPhoneAIByOrderNo`, and `AddNurixAICallLog` mirror the
3 real endpoints Jomashop shared. Everything else is an invented
placeholder in the same naming style, pending a real contract.

Credential: set `JOMASHOP_MOCK_CREDENTIAL` (format `user:pass`), or use
the default `nurix-mock:practice-only-2026` for local dev. This is a
practice-only credential — never the real Jomashop secret.

| Endpoint | Real or invented |
|---|---|
| `POST /api/GetOrdersForPhoneAIByPhoneNo?phoneno=` | Real |
| `POST /api/GetOrdersForEmailAI?email=` | Invented |
| `POST /api/GetOrdersForNameAI?name=` | Invented |
| `POST /api/GetOrderDetailForPhoneAIByOrderNo?orderno=` | Real |
| `POST /api/CancelOrderForPhoneAI` | Invented |
| `POST /api/RaiseZendeskTicket` | Invented |
| `POST /api/CreateRMAForOrderAI` | Invented |
| `POST /api/GetRMAHistoryByOrderNo?orderno=` | Invented |
| `POST /api/GetTicketsByOrderNo?orderno=` | Invented |
| `POST /api/SendExtendClaimEmailAI` | Invented |
| `POST /api/AddNurixAICallLog` | Real |

## Calendar tool (`/tools/calendar/*`)

No auth. Business-day math for SOP window checks — weekends skipped,
US holidays NOT excluded (documented simplification).

```bash
curl -X POST $BASE/tools/calendar/add-business-days \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2026-01-05", "business_days": 3}'

curl -X POST $BASE/tools/calendar/business-days-between \
  -H "Content-Type: application/json" \
  -d '{"date_a": "2026-01-05", "date_b": "2026-01-08"}'
```

## Seed data & scenario harness

```bash
npm run seed        # (re)generates seed/orders.json and seed/rma.json,
                     # dates computed relative to today so "in window" /
                     # "past window" scenarios stay correct over time
rm -f data/*.json    # clear any stale persisted state
npm start &          # start the server
npm run scenarios    # plays the voice agent's role through every SOP
                     # branch over real HTTP, asserts outcomes
```

See `docs/superpowers/specs/2026-07-21-mock-crm-design.md` for the full
design rationale.

## Deploying (e.g. to Render)

`Dockerfile` and `render.yaml` are included. On Render: New → Web Service →
connect the GitHub repo this code is pushed to → it auto-detects
`render.yaml`. Render assigns a public `https://...onrender.com` URL — that's
what you'd point Nuplay's HTTP requests at.

**Storage caveat:** `data/customers.json` lives on local disk. On most
free/managed hosts (including Render's free tier) the filesystem is
ephemeral — anything written via POST/PUT/DELETE is lost on redeploy or
when the instance restarts/spins down. Fine for testing; if Nuplay needs
writes to actually persist long-term, this needs a real database or a
mounted persistent disk instead of a JSON file.
