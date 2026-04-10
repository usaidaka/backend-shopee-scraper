#!/bin/bash
# ============================================================
# Shopee Scraper Backend - Server Deployment Script
# Target: /opt/usaid on ubuntu@43.129.52.140:2222
# ============================================================

set -e
echo "============================================"
echo "  Shopee Scraper Backend Deployment Script  "
echo "============================================"

# ─── 1. Ensure /opt/usaid exists ───────────────────────────
echo ""
echo "[1/9] Checking /opt/usaid directory..."
if [ ! -d "/opt/usaid" ]; then
    sudo mkdir -p /opt/usaid
    sudo chown ubuntu:ubuntu /opt/usaid
    echo "  ✅ Created /opt/usaid"
else
    echo "  ✅ /opt/usaid already exists"
fi

cd /opt/usaid

# ─── 2. Install Node.js (via nvm) ──────────────────────────
echo ""
echo "[2/9] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 22 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "  ✅ Node.js installed: $(node -v)"
else
    echo "  ✅ Node.js already installed: $(node -v)"
fi

# ─── 3. Install PM2 globally ───────────────────────────────
echo ""
echo "[3/9] Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "  Installing PM2..."
    sudo npm install -g pm2
    echo "  ✅ PM2 installed: $(pm2 -v)"
else
    echo "  ✅ PM2 already installed: $(pm2 -v)"
fi

# ─── 4. Check Docker & run PostgreSQL container ───────────
echo ""
echo "[4/9] Setting up PostgreSQL with Docker..."
if ! command -v docker &> /dev/null; then
    echo "  Docker not found! Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    sudo usermod -aG docker ubuntu
    sudo systemctl start docker
    sudo systemctl enable docker
    echo "  ✅ Docker installed"
else
    echo "  ✅ Docker already installed: $(docker --version)"
fi

# Check if postgres container is already running
if sudo docker ps --format '{{.Names}}' | grep -q "^shopee-postgres$"; then
    echo "  ✅ PostgreSQL container 'shopee-postgres' already running"
elif sudo docker ps -a --format '{{.Names}}' | grep -q "^shopee-postgres$"; then
    echo "  Starting existing PostgreSQL container..."
    sudo docker start shopee-postgres
    echo "  ✅ PostgreSQL container started"
else
    echo "  Creating and starting PostgreSQL container..."
    sudo docker run -d \
        --name shopee-postgres \
        --restart unless-stopped \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD="Admin122!" \
        -e POSTGRES_DB=shopee_scraper \
        -p 5432:5432 \
        postgres:15
    echo "  ✅ PostgreSQL container created and started"
    echo "  Waiting 10s for PostgreSQL to be ready..."
    sleep 10
fi

# ─── 5. Clone / Update repository ─────────────────────────
echo ""
echo "[5/9] Setting up repository in /opt/usaid..."
if [ -d "/opt/usaid/backend-shopee-scraper" ]; then
    echo "  Repository already exists. Pulling latest changes..."
    cd /opt/usaid/backend-shopee-scraper
    git pull origin main || git pull origin master || echo "  (could not pull, continuing with existing code)"
else
    echo "  Cloning repository..."
    git clone https://github.com/usaidaka/backend-shopee-scraper.git /opt/usaid/backend-shopee-scraper
    echo "  ✅ Repository cloned"
fi

cd /opt/usaid/backend-shopee-scraper

# ─── 6. Create .env file ──────────────────────────────────
echo ""
echo "[6/9] Creating .env file..."
if [ ! -f ".env" ]; then
    cat > .env << 'ENVEOF'
DATABASE_URL=postgres://postgres:Admin122!@localhost:5432/shopee_scraper
PORT=3001

# ─── Session & Identity ───────────────────────────────────────────────────────
# Update these values manually after SSH-ing into the server
# Cara ambil: Buka shopee.co.id → F12 → Application → Cookies
SHOPEE_COOKIE=""

# ─── Browser Identity ────────────────────────────────────────────────────────
SHOPEE_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ─── CSRF Token ──────────────────────────────────────────────────────────────
SHOPEE_CSRF_TOKEN=

# ─── Anti-Fraud Token ────────────────────────────────────────────────────────
SHOPEE_AF_AC_ENC_DAT=

# ─── Anti-Bot Sensor Data ────────────────────────────────────────────────────
SHOPEE_ACF_SENSOR_DATA=

# ─── Shopee Request Headers ──────────────────────────────────────────────────
SHOPEE_API_SOURCE=pc
SHOPEE_LANGUAGE=id
ENVEOF
    echo "  ✅ .env created (please update SHOPEE_COOKIE and tokens manually)"
else
    echo "  ✅ .env already exists (skipping to preserve your config)"
fi

# ─── 7. Install npm dependencies ──────────────────────────
echo ""
echo "[7/9] Installing npm dependencies..."
npm install --production
echo "  ✅ npm install done"

# ─── 8. Install Playwright system dependencies ────────────
echo ""
echo "[8/9] Installing Playwright/Chromium system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    2>/dev/null || true

# Install playwright browser
npx playwright install chromium 2>/dev/null || echo "  (playwright install may need manual run)"
echo "  ✅ System dependencies installed"

# ─── 9. Initialize database & start backend ───────────────
echo ""
echo "[9/9] Initializing database and starting backend..."

# Run DB init
node init-db.js
echo "  ✅ Database initialized"

# Stop existing PM2 process if running
pm2 stop shopee-backend 2>/dev/null || true
pm2 delete shopee-backend 2>/dev/null || true

# Start backend with PM2
pm2 start index.js --name shopee-backend
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null | tail -1 | bash 2>/dev/null || true

echo ""
echo "============================================"
echo "  ✅ Deployment Complete!"
echo "============================================"
echo ""
echo "  Backend running at: http://43.129.52.140:3001"
echo "  PM2 status: $(pm2 list)"
echo ""
echo "  Next step: Update SHOPEE_COOKIE and tokens in:"
echo "  /opt/usaid/backend-shopee-scraper/.env"
echo "  Then run: pm2 restart shopee-backend"
echo ""
