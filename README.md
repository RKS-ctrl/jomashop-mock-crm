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
