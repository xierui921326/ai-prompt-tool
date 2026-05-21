PNPM ?= pnpm
CARGO ?= cargo

.PHONY: install dev build check typecheck rust-check web-dev web-build preview clean help

help:
	@echo "PromptCraft Tauri 2.0 一体化命令:"
	@echo "  make install     安装 pnpm 依赖"
	@echo "  make dev         启动 Tauri 桌面开发模式（推荐）"
	@echo "  make build       构建 Tauri 桌面应用（推荐）"
	@echo "  make check       执行前端类型检查 + Rust 检查"
	@echo "  make clean       清理前端与 Rust 构建产物"
	@echo ""
	@echo "子命令（仅用于单独调试）:"
	@echo "  make typecheck   仅执行 TypeScript 类型检查"
	@echo "  make rust-check  仅执行 Rust cargo check"
	@echo "  make web-dev     仅启动 Vite 前端开发服务"
	@echo "  make web-build   仅构建前端产物"
	@echo "  make preview     仅预览前端构建产物"

install:
	$(PNPM) install

dev:
	$(PNPM) tauri dev

build:
	$(PNPM) tauri build

check: typecheck rust-check

typecheck:
	$(PNPM) typecheck

rust-check:
	cd src-tauri && $(CARGO) check

web-dev:
	$(PNPM) dev --host 127.0.0.1

web-build:
	$(PNPM) build

preview:
	$(PNPM) preview

clean:
	rm -rf dist
	cd src-tauri && $(CARGO) clean
