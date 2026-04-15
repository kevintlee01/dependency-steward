# Dependency Steward

Dependency Steward is a full-stack monorepo that automates dependency upgrade evaluation, coverage-aware routing, test backfill generation, and PR-ready run reporting.

## Workspace layout

- `apps/web`: Next.js operator console.
- `apps/api`: Fastify control plane and read APIs.
- `apps/worker`: BullMQ worker and orchestration pipeline.
- `packages/*`: shared domain logic and service adapters.
- `infra/docker-compose.yml`: local Postgres and Redis.

## Local development

Run all commands from the repository root:

```bash
cd /Users/k0l0765/dependency-and-test-agent/dependency-steward
```

### 1. Verify prerequisites

```bash
node -v
docker-compose --version
```

Look for Node 18.18 or newer and a working `docker-compose` binary.

### 2. Create the local environment file

```bash
cp .env.example .env
grep -E 'POSTGRES_HOST_PORT|DATABASE_URL|REDIS_URL|NEXT_PUBLIC_API_BASE_URL|ARTIFACT_STORAGE_ROOT|LLM_MODEL' .env
```

Expected defaults:

- `POSTGRES_HOST_PORT=5433`
- `REDIS_URL=redis://127.0.0.1:6379`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`
- `ARTIFACT_STORAGE_ROOT=./artifacts`

If `DATABASE_URL` is left unset, the local scripts and runtime defaults synthesize `postgresql://postgres:postgres@localhost:$POSTGRES_HOST_PORT/dependency_steward`.

You can leave the GitHub and OpenAI values blank for a local-only boot. If `OPENAI_API_KEY` is blank, test generation routes to manual review instead of calling GPT-5.4.

### 3. Start the local database and Redis

If your Docker CLI is running on Colima and `docker compose` fails with a missing `docker-credential-desktop` helper, use a clean Docker config and point Docker directly at the Colima socket:

```bash
mkdir -p "$HOME/.docker-colima"

cat > "$HOME/.docker-colima/config.json" <<'EOF'
{
	"auths": {}
}
EOF

export DOCKER_CONFIG="$HOME/.docker-colima"
export DOCKER_HOST="unix:///Users/k0l0765/.colima/default/docker.sock"
```

Then start infrastructure with the legacy `docker-compose` binary:

```bash
docker-compose -f infra/docker-compose.yml down -v
docker-compose -f infra/docker-compose.yml up -d
docker-compose -f infra/docker-compose.yml ps
```

The reset is important after Postgres auth changes because the container only writes its host authentication rules when the data volume is first initialized.

This project defaults to host port `5433` so it does not collide with a locally installed Postgres server on the common default port `5432`.

If you want a different local Postgres port, export it once in the same shell before starting the stack:

```bash
export POSTGRES_HOST_PORT=5434
```

The Docker Compose mapping, Prisma scripts, and runtime database defaults all honor that override.

Look for:

- `infra-postgres-1` in `Up` state on port `$POSTGRES_HOST_PORT` or the default `5433`
- `infra-redis-1` in `Up` state on port `6379`

Optional readiness checks:

```bash
docker-compose -f infra/docker-compose.yml logs postgres --tail=50
docker-compose -f infra/docker-compose.yml logs redis --tail=50
```

Look for `database system is ready to accept connections` in the Postgres logs.

### 4. Install dependencies

```bash
npm install --ignore-scripts
```

If your VPN or network blocks npm registry access, run this step off VPN or against a reachable internal npm mirror. Everything after install can run locally.

If you previously saw `npm error Unsupported URL Type "workspace:"`, update to the latest checkout and retry. The workspace manifests now use npm-compatible local version pins.

Look for:

- successful command completion
- `node_modules` created
- `package-lock.json` created

### 5. Generate Prisma client

```bash
npm run prisma:generate
```

Run Prisma commands through the repo root scripts so the root `.env` file is loaded.

Look for a successful Prisma client generation message.

### 6. Create the local database schema

```bash
npm run prisma:migrate -- --name init
```

Look for a successful migration and no schema validation errors.

### 7. Seed demo data

```bash
npm run prisma:seed
```

Look for:

```text
Seeded Dependency Steward demo data.
```

### 8. Start the full stack

```bash
npm run dev
```

This starts:

- the web app on port `3001`
- the API on port `4000`
- the worker process for BullMQ jobs

Look for all three processes to stay up without immediate exit.

### 9. Verify the backend health

In a second terminal:

```bash
curl http://127.0.0.1:4000/health
```

Look for JSON with:

- `database: "ok"`
- `redis: "configured"`

These are acceptable for local-only boot:

- `github: "not_configured"`
- `llm: "not_configured"`

### 10. Open the UI

```bash
open http://127.0.0.1:3001
```

Look for:

- the Dependency Steward dashboard
- seeded repositories such as `acme/order-service`
- pending runs and vulnerable candidate cards

### 11. Trigger a scan

From the UI:

1. Open a repository page.
2. Click `Run dependency scan`.

Look for a run moving through `queued`, `preparing`, and `running`, then settling into one of:

- `succeeded`
- `waiting_for_followup`
- `awaiting_manual_review`

### Quick command list

```bash
cd /Users/k0l0765/dependency-and-test-agent/dependency-steward

cp .env.example .env

mkdir -p "$HOME/.docker-colima"

cat > "$HOME/.docker-colima/config.json" <<'EOF'
{
	"auths": {}
}
EOF

export DOCKER_CONFIG="$HOME/.docker-colima"
export DOCKER_HOST="unix:///Users/k0l0765/.colima/default/docker.sock"

docker-compose -f infra/docker-compose.yml down -v
docker-compose -f infra/docker-compose.yml up -d
docker-compose -f infra/docker-compose.yml ps

# run off VPN or against a reachable npm mirror
npm install --ignore-scripts

npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed

npm run dev
```

## Stop and reset

Stop the app stack by pressing `Ctrl+C` in the `npm run dev` terminal.

Stop Postgres and Redis:

```bash
export DOCKER_CONFIG="$HOME/.docker-colima"
export DOCKER_HOST="unix:///Users/k0l0765/.colima/default/docker.sock"
docker-compose -f infra/docker-compose.yml down
```

Stop and delete local volumes too:

```bash
export DOCKER_CONFIG="$HOME/.docker-colima"
export DOCKER_HOST="unix:///Users/k0l0765/.colima/default/docker.sock"
docker-compose -f infra/docker-compose.yml down -v
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

## Notes

- The implementation is pinned to GPT-5.4 for LLM-backed flows.
- Repository execution stays fail-closed when coverage, verification, or sandbox policy is ambiguous.
- GitHub Actions is the supported external CI coverage source for MVP.
- If the UI opens but the API is unavailable, the web app may fall back to mock dashboard data. Check `curl http://127.0.0.1:4000/health` first.
- If a run lands in `awaiting_manual_review`, that usually indicates intended fail-closed behavior rather than a crash.