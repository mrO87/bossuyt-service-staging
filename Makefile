ENV_FILE := .env.staging.local
COMPOSE  := docker compose --env-file $(ENV_FILE) -f docker-compose.staging.yml

staging-up:
	NEXT_PUBLIC_GIT_SHA=$$(git rev-parse --short HEAD) $(COMPOSE) up --build -d

staging-down:
	$(COMPOSE) down

staging-logs:
	$(COMPOSE) logs -f app-staging

staging-restart:
	$(COMPOSE) restart app-staging

.PHONY: staging-up staging-down staging-logs staging-restart
