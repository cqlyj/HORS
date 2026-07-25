.PHONY: init setup set-ens server expose reset

PORT ?= 3200
ROOT := ../..

init:
	@echo "=== Installing and building monorepo ==="
	cd $(ROOT) && pnpm install && pnpm build
	@echo "\n=== Linking hors CLI globally ==="
	cd $(ROOT)/packages/hors-cli && pnpm link --global
	@echo "\n=== Checking .env ==="
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")
	@test -f .env && echo ".env exists"
	@echo "\n=== Done ==="
	@echo "Next: fill in .env with your keys, then run: make setup"

setup:
	pnpm tsx enroll.ts

set-ens:
	pnpm tsx set-ens.ts $(ENDPOINT)

server:
	pnpm tsx server.ts

# Rewrite Host to localhost so MCP DNS-rebinding guards accept tunnel traffic.
expose:
	ngrok http --host-header=rewrite $(PORT)

reset:
	rm -rf ~/.hors
	@echo "Reset complete. Run: hors connect --fresh"
