ENV_FILE := .env.staging.local
COMPOSE  := docker compose --env-file $(ENV_FILE) -f docker-compose.staging.yml

staging-up: pre-staging
	NEXT_PUBLIC_GIT_SHA=$$(git rev-parse --short HEAD) $(COMPOSE) up --build -d

pre-staging:
	@bash scripts/pre-staging.sh

staging-down:
	$(COMPOSE) down

staging-logs:
	$(COMPOSE) logs -f app-staging

staging-restart:
	$(COMPOSE) restart app-staging

.PHONY: staging-up pre-staging staging-down staging-logs staging-restart
