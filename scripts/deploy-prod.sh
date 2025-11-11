#!/usr/bin/env bash
set -euo pipefail

# Deploy the API to Cloud Run using environment variables from .env.prod
# Usage:
#   PROJECT_ID=your-project REGION=us-central1 ./scripts/deploy-prod.sh
# Environment variables (defaults shown):
#   PROJECT_ID (required)
#   REGION=${REGION:-us-central1}
#   REPOSITORY=${REPOSITORY:-quikday-docker}
#   IMAGE_NAME=${IMAGE_NAME:-quikday-api}
#   TAG=${TAG:-latest}
#   SERVICE_NAME=${SERVICE_NAME:-quikday-api}
#   DOCKERFILE=${DOCKERFILE:-Dockerfile.prod}
#   ENV_FILE=${ENV_FILE:-.env.prod}

PROJECT_ID=${PROJECT_ID:-oneway8x-portfolio}
REGION=${REGION:-europe-west4}
REPOSITORY=${REPOSITORY:-quikday-docker}
IMAGE_NAME=${IMAGE_NAME:-quikday-api}
TAG=${TAG:-latest}
SERVICE_NAME=${SERVICE_NAME:-quikday-api}
DOCKERFILE=${DOCKERFILE:-Dockerfile.prod}
ENV_FILE=${ENV_FILE:-.env.prod}

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: PROJECT_ID must be set. Example: PROJECT_ID=my-gcp-project $0"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}"

echo "\n1) Building API (pnpm workspace)..."
pnpm install --silent
pnpm --filter @quikday/api build

# Ensure gcloud is configured
echo "\n2) Configure gcloud project and docker auth"
gcloud config set project "$PROJECT_ID"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}"

echo "\n3) Building Docker image ($DOCKERFILE)"
docker build --platform linux/amd64 -f "$DOCKERFILE" -t "$IMAGE_URI" .

echo "\n4) Pushing image to Artifact Registry"
docker push "$IMAGE_URI"

# Deploy to Cloud Run
echo "\n5) Deploying to Cloud Run: $SERVICE_NAME"
if [ ! -f "$ENV_FILE" ]; then
  echo "\nWARNING: env file $ENV_FILE not found. Deploying without environment variables."
  gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URI" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --project="$PROJECT_ID"
else
  # Create a temporary YAML file for Cloud Run env vars (excluding PORT and duplicates)
  TEMP_ENV_FILE=$(mktemp).yaml
  SEEN_KEYS_FILE=$(mktemp)
  
  # Convert .env to YAML format, excluding PORT and comments
  while IFS= read -r line || [ -n "$line" ]; do
    # trim whitespace
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    # skip empty lines and comments
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue;;
    esac
    # skip lines without =
    [[ "$line" != *"="* ]] && continue
    
    key="${line%%=*}"
    value="${line#*=}"
    
    # Skip PORT - Cloud Run sets this automatically
    [[ "$key" == "PORT" ]] && continue
    
    # Skip duplicate keys (keep first occurrence)
    if grep -q "^${key}$" "$SEEN_KEYS_FILE" 2>/dev/null; then
      echo "WARNING: Skipping duplicate key: $key"
      continue
    fi
    echo "$key" >> "$SEEN_KEYS_FILE"
    
    # Remove surrounding quotes if present
    if [[ "$value" == '"'*'"' ]] || [[ "$value" == "'"*"'" ]]; then
      value="${value#[\"\']}"
      value="${value%[\"\']}"
    fi
    
    # Always quote the value to ensure it's treated as a string
    # Escape backslashes and double quotes
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    echo "$key: \"$value\"" >> "$TEMP_ENV_FILE"
  done < "$ENV_FILE"
  
  echo "Using environment variables from $ENV_FILE (PORT excluded - Cloud Run will set this)"
  
  gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URI" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --env-vars-file="$TEMP_ENV_FILE" \
    --port=3000 \
    --timeout=300 \
    --cpu=1 \
    --memory=512Mi \
    --project="$PROJECT_ID"
  
  # Clean up temp files
  rm -f "$TEMP_ENV_FILE" "$SEEN_KEYS_FILE"
fi

echo "\nDeployment complete. Service: $SERVICE_NAME -> $IMAGE_URI"

echo "To verify URL: gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' --project=$PROJECT_ID"
