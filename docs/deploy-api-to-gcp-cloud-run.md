# Deploy `apps/api` to GCP Cloud Run

This guide walks through building the API locally, creating a production Docker image (Dockerfile.prod) that uses a local build output, pushing the image to Google Artifact Registry / Container Registry, and deploying to Cloud Run. It includes example commands for macOS (zsh). Adjust variables to match your GCP project, region, and service name.

## Overview / contract

- Input: repo root with `apps/api/` (NestJS) and working `pnpm` workspace
- Output: a Cloud Run service running the production image built from local build
- Success criteria: Cloud Run service is deployed and receives requests
- Error modes: missing gcloud auth, missing APIs, incorrect image path, env var handling

## Prerequisites

- gcloud SDK installed and logged in
  - `gcloud auth login`
- Docker installed and running
- A GCP project where you have permission to create Artifact Registry/Container Registry and Cloud Run services
- Enable required APIs:
  - Cloud Run: `run.googleapis.com`
  - Artifact Registry (or Container Registry): `artifactregistry.googleapis.com` / `containerregistry.googleapis.com`
  - Secret Manager (optional but recommended): `secretmanager.googleapis.com`

You can enable APIs with:

```bash
# set your project first
gcloud config set project PROJECT_ID
# then enable APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

Recommended IAM roles for the account doing the deploy:
- roles/run.admin
- roles/artifactregistry.writer (or storage.objectAdmin for Container Registry)
- roles/iam.serviceAccountUser (if using a service account)

## High-level steps

1. Build the API locally (production build)
2. Create a `Dockerfile.prod` that copies the local build into the image (multi-stage will be shown)
3. Keep secrets out of the image; use Cloud Run env vars or Secret Manager. Use `.env.prod` locally only for local testing.
4. Build and push the image to Artifact Registry or Container Registry
5. Deploy Cloud Run with environment variables or secrets attached

---

## 1) Build locally

From the repo root:

```bash
# install deps (once)
pnpm install

# build only the API package (monorepo):
pnpm --filter @quikday/api build
```

Notes:
- The project uses `pnpm` and a workspace. The API build output is expected in `apps/api/dist` (or as configured by that package).
- If you prefer, run any tests before building: `pnpm --filter @quikday/api test`.

## 2) Create a production Dockerfile (`Dockerfile.prod`)

Goal: produce a small runtime image that does NOT bake secrets into the image. Use multi-stage build so you only include the compiled output and runtime deps.

Example `Dockerfile.prod` for Node 20 + pnpm (place next to `apps/api` root or at repo root and reference correct build dirs):

```dockerfile
# Stage: runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install a lightweight package manager for runtime (pnpm runtime install not required if node_modules are copied)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only production artifacts
COPY apps/api/package.json apps/api/pnpm-lock.yaml ./
COPY apps/api/dist ./dist

# Install only production deps
RUN pnpm install --prod --frozen-lockfile

# Expose port and run
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

If your monorepo layout requires copying shared `node_modules` or more files, adapt the `COPY` lines accordingly. The important points:
- Build locally first, then COPY the build result (`apps/api/dist`) into the image.
- Do not copy `.env` into the image.

## 3) Handling environment variables / secrets

Options (recommended order):

A) Use Secret Manager and mount secrets into Cloud Run (recommended for production):

1. Create secret from your `.env.prod` or individual keys:

```bash
# single secret containing entire file (not recommended for individual secrets but shown for convenience)
gcloud secrets create quikday-api-env --data-file=.env.prod

# OR create a per-key secret
# echo -n "super-secret-value" | gcloud secrets create OPENAI_API_KEY --data-file=-
```

2. Add a secret version (if not using --data-file above):

```bash
echo -n "${YOUR_VALUE}" | gcloud secrets versions add OPENAI_API_KEY --secret=OPENAI_API_KEY
```

3. When deploying Cloud Run you can map secrets to env vars:

```bash
gcloud run deploy SERVICE_NAME \
  --image=REGION-docker.pkg.dev/PROJECT/REPOSITORY/IMAGE:TAG \
  --region=REGION \
  --platform=managed \
  --set-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --allow-unauthenticated
```

B) Use Cloud Run `--set-env-vars` for non-sensitive configuration (convenient for small values):

```bash
# from a shell-friendly .env.prod you can set many vars at once (beware of newlines and special chars)
# Example: convert .env.prod into comma-separated KEY=VAL pairs
ENV_PAIRS=$(grep -v '^#' .env.prod | xargs | sed 's/ /,/g')

gcloud run deploy SERVICE_NAME \
  --image=REGION-docker.pkg.dev/PROJECT/REPOSITORY/IMAGE:TAG \
  --region=REGION \
  --platform=managed \
  --set-env-vars="$ENV_PAIRS" \
  --allow-unauthenticated
```

C) (Not recommended) Bake `.env.prod` into the image. Avoid for production.

## 4) Tag and push image to Artifact Registry (recommended) or Container Registry

Artifact Registry (example using `us-central1` region):

```bash
# variables
PROJECT_ID=your-gcp-project
REGION=us-central1
REPOSITORY=quikday-docker  # create this in the next step
IMAGE_NAME=quikday-api
TAG=latest

# create a docker (artifact) repo (do once)
gcloud artifacts repositories create $REPOSITORY --repository-format=docker --location=$REGION --description="Docker repo for quikday"

# configure docker auth for Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# build the image (from repo root; ensure Dockerfile.prod path correct)
docker build -f Dockerfile.prod -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG} .

# push image
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}
```

Alternative: use Cloud Build to build & push directly:

```bash
gcloud builds submit --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}
```

If you prefer Container Registry instead of Artifact Registry (older):
- use `gcr.io/PROJECT_ID/IMAGE:TAG` and `gcloud auth configure-docker gcr.io`.

## 5) Deploy to Cloud Run

Simple deploy command (example using environment variables or secrets as shown above):

```bash
SERVICE_NAME=quikday-api
IMAGE_URI=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}

# deploy
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE_URI \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --max-instances=5
```

Add `--set-env-vars` or `--set-secrets` as needed (see section 3).

## Validate the deployment

- Get the service URL:

```bash
gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)"
```

- Curl the endpoint and verify a health route or /status (adjust as your app exposes):

```bash
curl -v $(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")/health
```

## Local container test (optional)

Run the image locally to sanity check:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgresql://...' \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}

# then visit http://localhost:3000
```

## CI/CD / GitHub Actions (short notes)

- In CI, prefer `gcloud builds submit` or `docker build && docker push` to Artifact Registry.
- Use GitHub Actions with `google-github-actions/auth` to authenticate and `google-github-actions/setup-gcloud`.
- Use encrypted secrets in your GitHub repo for `PROJECT_ID`, `GCP_SA_KEY`, and reference them in Actions.

## Troubleshooting & tips

- If `gcloud run deploy` fails with permission errors, ensure your identity has `roles/run.admin` and artifact registry write access.
- For large monorepos: make sure Docker build context doesn't copy the entire repo unnecessarily. Use `.dockerignore` to exclude node_modules and other heavy files.
- Use Cloud Run concurrency and memory tuning to control cost/perf. Start small and monitor.
- Prefer Secret Manager for any API keys, DB credentials, or tokens.

## Example quick checklist (copy and run interactively)

```bash
# Set these values
PROJECT_ID=your-project-id
REGION=us-central1
REPOSITORY=quikday-docker
IMAGE_NAME=quikday-api
TAG=latest
SERVICE_NAME=quikday-api

# 1) Build locally
pnpm install
pnpm --filter @quikday/api build

# 2) Build image and push
gcloud config set project $PROJECT_ID
gcloud auth configure-docker ${REGION}-docker.pkg.dev
docker build -f Dockerfile.prod -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG} .
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}

# 3) Deploy
gcloud run deploy $SERVICE_NAME --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG} --region=$REGION --platform=managed --allow-unauthenticated
```

## Next steps / follow-up

- (Recommended) Add a GitHub Actions workflow to automatically build and deploy on push to `main`.
- Add per-key Secret Manager secrets and attach them to the Cloud Run service for production.
- Add monitoring & logging (Stackdriver / Cloud Logging) and health checks.

---

Completion summary
- This document explains local build, Dockerfile.prod pattern, pushing to Artifact Registry, and deploying to Cloud Run. It includes commands and secure patterns for environment variables.

If you want, I can:
- Add a `Dockerfile.prod` file into the repo at `apps/api/Dockerfile.prod` with repo-specific tweaks.
- Draft a simple GitHub Actions workflow that builds, pushes, and deploys on `main`.
- Show how to create per-key Secret Manager secrets from the `.env` you attached.

Tell me which follow-up you'd like and I'll add it next.
