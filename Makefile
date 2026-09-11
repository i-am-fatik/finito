.DEFAULT_GOAL := help

.PHONY: help install dev tauri build start tauri-build check lint format types test e2e e2e-ui e2e-dev relay i18n clean

help:
	@echo "finito - run make <target>"
	@echo ""
	@echo "  install      install dependencies"
	@echo "  dev          web app on https://127.0.0.1:3000"
	@echo "  tauri        desktop app, boots the dev server itself"
	@echo "  build        static export into out/"
	@echo "  start        serve the export over https"
	@echo "  tauri-build  desktop bundle for this platform"
	@echo ""
	@echo "  check        lint, typegen, types and unit tests, the full gate"
	@echo "  lint         biome"
	@echo "  format       biome, writing fixes"
	@echo "  types        typegen and tsc"
	@echo "  test         unit tests"
	@echo ""
	@echo "  e2e          playwright, boots its own relay and server"
	@echo "  e2e-ui       playwright ui mode"
	@echo "  e2e-dev      playwright against a dev server you already run"
	@echo "  relay        strfry test relay in docker on port 7448"
	@echo "  SPEC=e2e/pos-charge.spec.ts narrows e2e and e2e-dev to one file"
	@echo ""
	@echo "  i18n         localize missing translation keys"
	@echo "  clean        drop build output and test artifacts"

install:
	bun install

dev:
	bun run dev

tauri:
	bunx tauri dev

build:
	bun run build

start:
	bun run start

tauri-build:
	bunx tauri build

check:
	bun run check

lint:
	bun run check:lint

format:
	bun run format

types:
	bun run typegen
	bun run check:types

test:
	bun run check:tests

e2e:
	bun run e2e $(SPEC)

e2e-ui:
	bun run e2e:ui

e2e-dev:
	bun run e2e:dev $(SPEC)

relay:
	bun run e2e:relay

i18n:
	bun run i18n:localize

clean:
	rm -rf .next .next-e2e out playwright-report test-results e2e/.auth
