.PHONY: register server client reset

register:
	pnpm tsx register.ts

server:
	pnpm tsx server.ts

client:
	pnpm tsx client.ts

reset:
	rm -f .env
	@echo "Reset. Run 'make register' to set up again."
