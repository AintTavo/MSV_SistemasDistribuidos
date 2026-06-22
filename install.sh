#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  El mapa del aventurero — Microservicios  ·  Instalador automático
#  En una máquina limpia (Debian/Ubuntu o Fedora/RHEL):
#      chmod +x install.sh && ./install.sh
#  Instala Docker + Docker Compose, prepara el .env y levanta todo.
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

APP_NAME="El mapa del aventurero Microservicios (msv)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}/src"
PKG=""

log()  { printf '\033[1;36m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

# ── 0. Privilegios ────────────────────────────────────────────────
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
    err "Necesitas privilegios de root o sudo para instalar paquetes."; exit 1
  fi
fi

# ── 1. Detectar el gestor de paquetes ─────────────────────────────
detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then PKG="apt"
  elif command -v dnf >/dev/null 2>&1; then PKG="dnf"
  else err "No se detectó apt ni dnf. Distribución no soportada."; exit 1
  fi
  log "Gestor de paquetes detectado: $PKG"
}

# ── 2. Dependencias del sistema (curl, git, make, ca-certificates) ─
ensure_base_deps() {
  log "Verificando dependencias del sistema (curl, git, make, ca-certificates)…"
  if [ "$PKG" = "apt" ]; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y curl git make ca-certificates gnupg
  else
    $SUDO dnf install -y curl git make ca-certificates
  fi
}

# ── 3. Instalar Docker Engine + plugin Compose si faltan ──────────
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker y Docker Compose ya están instalados."
  else
    log "Instalando Docker Engine + Compose (script oficial get.docker.com)…"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    $SUDO sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
  fi

  log "Habilitando y arrancando el servicio docker…"
  $SUDO systemctl enable --now docker 2>/dev/null || warn "No se pudo gestionar docker vía systemctl (¿contenedor/CI?)."

  if [ -n "$SUDO" ] && ! id -nG "$USER" | grep -qw docker; then
    $SUDO usermod -aG docker "$USER" || true
    warn "Se añadió $USER al grupo 'docker'. Cierra sesión y vuelve a entrar para usar docker sin sudo."
  fi
}

# ── 4. Preparar el archivo .env ───────────────────────────────────
prepare_env() {
  if [ -f "${COMPOSE_DIR}/.env" ]; then
    log ".env ya existe, se conserva."
  elif [ -f "${COMPOSE_DIR}/.env.example" ]; then
    cp "${COMPOSE_DIR}/.env.example" "${COMPOSE_DIR}/.env"
    log "Creado ${COMPOSE_DIR}/.env a partir de .env.example (ajústalo si es producción)."
  fi
}

# ── 5. Levantar la arquitectura ───────────────────────────────────
launch() {
  log "Construyendo y levantando $APP_NAME…"
  local DC="docker"
  docker info >/dev/null 2>&1 || DC="$SUDO docker"
  ( cd "$COMPOSE_DIR" && $DC compose up -d --build )

  local port
  port="$(grep -E '^WEB_PORT=' "${COMPOSE_DIR}/.env" 2>/dev/null | cut -d= -f2 || true)"
  port="${port:-8080}"
  log "¡Listo! $APP_NAME disponible en: http://localhost:${port}"
}

main() {
  log "== Instalador de ${APP_NAME} =="
  detect_pkg
  ensure_base_deps
  ensure_docker
  prepare_env
  launch
}

main "$@"
