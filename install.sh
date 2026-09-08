#!/usr/bin/env bash
# =============================================================================
#  CSLINK - URL Shortener | One-Click Installer
#  Powered By Percetakan Rainbow
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/csrainbow/cslink/main/install.sh | bash
#    # atau dengan direktori kustom:
#    curl -fsSL https://raw.githubusercontent.com/csrainbow/cslink/main/install.sh | bash -s -- /opt/cslink
# =============================================================================
set -euo pipefail

# --- Konfigurasi -------------------------------------------------------------
REPO_URL="https://github.com/csrainbow/cslink.git"
INSTALL_DIR="${1:-/opt/cslink}"
SERVICE_NAME="cslink"
NODE_MAJOR=20

# --- Warna helper -------------------------------------------------------------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }

echo -e "${CYAN}"
echo "  ██████ ███████  ██       ██ ███    ██ ██   ██"
echo " ██      ██      ██ ██     ██ ████   ██ ██  ██"
echo " ██      ███████ ██  ██    ██ ██ ██  ██ █████"
echo " ██      ██      ███████   ██ ██  ██ ██ ██  ██"
echo "  ██████ ███████ ██   ██   ██ ██   ████ ██   ██"
echo "        URL Shortener - Powered By Percetakan Rainbow"
echo -e "${NC}"

# --- Cek akses root ----------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    err "Harap jalankan sebagai root: sudo bash -c \"$(curl -fsSL ...)\""
    exit 1
fi

# --- Deteksi OS ---------------------------------------------------------------
install_pkg() {
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq "$@" >/dev/null
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y "$@" >/dev/null
    elif command -v yum >/dev/null 2>&1; then
        yum install -y "$@" >/dev/null
    elif command -v apk >/dev/null 2>&1; then
        apk add --no-cache "$@" >/dev/null
    else
        err "Manager paket tidak dikenali. Install manual: git curl"
        exit 1
    fi
}

info "Menginstal dependensi dasar..."
command -v git  >/dev/null 2>&1 || install_pkg git
command -v curl >/dev/null 2>&1 || install_pkg curl

# --- Install Node.js bila belum ada ------------------------------------------
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    NODE_VER=$(node -v | sed 's/v//')
    ok "Node.js sudah terpasang: v$NODE_VER"
else
    warn "Node.js belum ada, menginstal Node v$NODE_MAJOR ..."
    export DEBIAN_FRONTEND=noninteractive
    if [ -f /etc/os-release ]; then
        . /etc/os-release
    else
        ID="unknown"; VERSION_CODENAME=""
    fi
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1 || {
        # Fallback: tarball resmi
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64) NODE_ARCH=linux-x64 ;;
            aarch64|arm64) NODE_ARCH=linux-arm64 ;;
            armv7l) NODE_ARCH=linux-armv7l ;;
            *) err "Arsitektur tidak didukung: $ARCH"; exit 1 ;;
        esac
        curl -fsSL "https://nodejs.org/dist/v${NODE_MAJOR}.17.0/node-v${NODE_MAJOR}.17.0-${NODE_ARCH}.tar.xz" \
            | tar -xJ -C /usr/local --strip-components=1
        ok "Node.js diinstal dari tarball (${NODE_ARCH})"
    }
    # Jika via nodesource, pastikan terinstal
    command -v node >/dev/null 2>&1 || install_pkg nodejs
    ok "Node.js siap: $(node -v)"
fi

# --- Kloning repo -------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
    warn "Direktori $INSTALL_DIR sudah ada, menarik update terbaru..."
    git -C "$INSTALL_DIR" pull --rebase || true
else
    info "Mengkloning CSLINK ke $INSTALL_DIR ..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- Konfigurasi .env ---------------------------------------------------------
if [ ! -f .env ]; then
    cp .env.example .env
    # Cari IP LAN otomatis
    LAN_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)192\.168\.\d+\.\d+' | head -1 || true)
    if [ -n "$LAN_IP" ]; then
        sed -i "s|^BASE_URL=.*|BASE_URL=http://$LAN_IP:3000|" .env
        ok "Terdeteksi IP LAN: $LAN_IP"
    else
        warn "IP LAN tidak ditemukan, gunakan http://localhost:3000 secara default."
    fi
else
    ok "File .env sudah ada, mempertahankan konfigurasi."
fi

# --- Install dependencies -----------------------------------------------------
info "Menginstal dependency npm..."
npm install --no-audit --no-fund

# --- Setup systemd service ----------------------------------------------------
if [ -d /run/systemd/system ]; then
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CSLINK - URL Shortener (Powered By Percetakan Rainbow)
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
    systemctl restart "$SERVICE_NAME"
    ok "Layanan systemd '$SERVICE_NAME' dimulai."
    ACTIVE=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
    if [ "$ACTIVE" = "active" ]; then
        ok "Service aktif & berjalan."
    else
        warn "Service tidak aktif (status: $ACTIVE). Cek: journalctl -u $SERVICE_NAME -e"
    fi
else
    warn "systemd tidak terdeteksi. Jalankan manual: node $INSTALL_DIR/server.js"
    (cd "$INSTALL_DIR" && nohup node server.js > server.log 2>&1 &)
    ok "Server berjalan di background (log: $INSTALL_DIR/server.log)"
fi

# --- Selesai -----------------------------------------------------------------
PORT_VAL=$(grep -E '^PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3000")
BASE_VAL=$(grep -E '^BASE_URL=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "http://localhost:3000")

echo
echo -e "${GREEN}==============================================${NC}"
echo -e "${GREEN}  CSLINK berhasil diinstal! ${NC}"
echo -e "${GREEN}==============================================${NC}"
echo "  Direktori   : $INSTALL_DIR"
echo "  Akses web   : $BASE_VAL"
echo "  Service     : systemctl status $SERVICE_NAME"
echo "  Log         : journalctl -u $SERVICE_NAME -f"
echo
info "Tips akses eksternal:"
echo "  1. Akali IP publik / Cloudflare Tunnel bila ingin online."
echo "  2. Ubah BASE_URL di $INSTALL_DIR/.env lalu restart service."
echo