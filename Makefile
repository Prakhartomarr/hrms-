# Local development entry points. Infra runs in Docker; app roles run with `pnpm dev`.
COMPOSE := docker compose
INFRA := postgres redis mailpit

.PHONY: help up down reset migrate seed dev test test-unit build lint typecheck registry

help:
	@echo "make up        start Postgres, Redis, Mailpit (creates .env from .env.example)"
	@echo "make migrate   apply Postgres migrations (core + modules)"
	@echo "make seed      demo tenant Demo Pvt Ltd (admin@demo.test / demo-password-123)"
	@echo "make dev       api :4100, web :5180, worker, scheduler (watch mode)"
	@echo "make test      unit + end-to-end tests (needs make up)"
	@echo "make down      stop everything (data kept);  make reset  also deletes volumes"

.env:
	cp .env.example .env

up: .env
	$(COMPOSE) up -d --wait $(INFRA)

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

migrate: .env
	pnpm migrate

seed: .env
	pnpm seed

dev: .env
	pnpm dev

test: .env
	pnpm test

test-unit:
	pnpm test:unit

build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

registry:
	pnpm registry
