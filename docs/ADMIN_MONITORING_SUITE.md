# 🖥️ Admin Monitoring Suite Setup Guide

> **Matrix-Style Admin Dashboard for Star World Order & Future Projects**
> 
> A comprehensive monitoring, management, and admin suite with modern cyberpunk aesthetics.

---

## 📋 Overview

This guide sets up a centralized admin dashboard for managing multiple applications (SWO, future projects) across PROD and DEV environments.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN SUITE (Port 3090)                       │
│  ┌─────────────┬──────────────┬─────────────┬──────────────┐   │
│  │  Dashboard  │   Uptime     │   System    │   App        │   │
│  │  Overview   │   Monitor    │   Metrics   │   Logs       │   │
│  └─────────────┴──────────────┴─────────────┴──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │                │              │              │
         ▼                ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ SWO PROD    │  │ SWO DEV     │  │ Future App  │  │ Discord Bot │
│ :3080       │  │ :3081       │  │ :30XX       │  │ PM2         │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## 🎯 Components

| Component | Purpose | Port | Style |
|-----------|---------|------|-------|
| **Admin Dashboard** | Central hub, app management | 3090 | Matrix/Cyberpunk |
| **Uptime Kuma** | Service monitoring, alerts | 3001 | Dark theme |
| **Netdata** | Real-time system metrics | 19999 | Matrix green |
| **PM2** | Process management | CLI | Terminal |

---

## 🚀 Quick Start

### Prerequisites

```bash
# On your NUC server
sudo apt update && sudo apt install -y curl wget git

# Node.js 20+ (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 for process management
sudo npm install -g pm2
```

---

## 📦 1. Uptime Kuma Setup (Service Monitoring)

Uptime Kuma provides beautiful, real-time service monitoring with alerting.

### Installation

```bash
# Create directory
sudo mkdir -p /opt/monitoring/uptime-kuma
cd /opt/monitoring/uptime-kuma

# Clone and install
git clone https://github.com/louislam/uptime-kuma.git .
npm run setup

# Start with PM2
pm2 start server/server.js --name uptime-kuma
pm2 save
```

### Configuration

1. Access: `http://your-server-ip:3001`
2. Create admin account
3. Add monitors:

| Monitor | Type | URL/Host | Interval |
|---------|------|----------|----------|
| SWO PROD | HTTP(s) | `http://localhost:3080` | 60s |
| SWO DEV | HTTP(s) | `http://localhost:3081` | 60s |
| SWO API Health | HTTP(s) | `http://localhost:3080/api/admin?action=health` | 120s |
| Discord Bot | HTTP(s) | `http://localhost:3002/health` | 60s |
| Monad RPC | HTTP(s) | `https://rpc.monad.xyz` | 60s |

### Alerting (Optional)

- Discord Webhook
- Telegram Bot
- Email (SMTP)
- Pushover

---

## 📊 2. Netdata Setup (System Metrics)

Netdata provides matrix-style real-time system monitoring.

### Installation

```bash
# One-line install
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Or manual
sudo apt install -y netdata

# Enable and start
sudo systemctl enable netdata
sudo systemctl start netdata
```

### Access

- URL: `http://your-server-ip:19999`
- Default: No auth (secure with nginx reverse proxy in production)

### Matrix Theme Configuration

Edit `/etc/netdata/netdata.conf`:

```ini
[global]
    update every = 1

[web]
    default port = 19999
```

Edit `/usr/share/netdata/web/dashboard.js` CSS or use browser extension for Matrix green theme.

---

## 🎨 3. Admin Dashboard (Custom Next.js App)

Create a dedicated admin dashboard with Matrix/Cyberpunk aesthetics.

### Repository Structure

```
admin-suite/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── apps/
│   │   └── page.tsx          # App management
│   ├── monitoring/
│   │   └── page.tsx          # Embeds Uptime Kuma
│   ├── metrics/
│   │   └── page.tsx          # Embeds Netdata
│   ├── logs/
│   │   └── page.tsx          # PM2 logs viewer
│   └── api/
│       ├── apps/route.ts     # App status/control
│       ├── pm2/route.ts      # PM2 integration
│       └── health/route.ts   # Health aggregator
├── components/
│   ├── MatrixRain.tsx        # Matrix rain background
│   ├── StatusCard.tsx        # App status cards
│   ├── MetricsPanel.tsx      # Live metrics
│   └── Terminal.tsx          # Terminal-style log viewer
├── lib/
│   ├── pm2.ts                # PM2 API wrapper
│   └── apps.ts               # App configurations
└── globals.css               # Matrix/Cyberpunk theme
```

### Design System

```css
/* Matrix/Cyberpunk Color Palette */
:root {
  --matrix-green: #00ff00;
  --matrix-dark-green: #003300;
  --cyber-cyan: #00ffff;
  --cyber-magenta: #ff00ff;
  --terminal-bg: #0a0a0a;
  --terminal-text: #00ff00;
  --grid-color: rgba(0, 255, 0, 0.1);
  --glow-green: 0 0 10px #00ff00, 0 0 20px #00ff00;
  --glow-cyan: 0 0 10px #00ffff, 0 0 20px #00ffff;
  
  /* Fonts */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-display: 'Orbitron', 'Share Tech Mono', monospace;
}
```

### Key Features

#### Dashboard Overview
```
┌─────────────────────────────────────────────────────────────┐
│  ███ ADMIN SUITE ███                      [USER] [LOGOUT]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SYSTEM STATUS                         QUICK ACTIONS        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  [Restart PROD]       │
│  │ CPU     │ │ RAM     │ │ DISK    │  [Restart DEV]        │
│  │ ▓▓▓░░   │ │ ▓▓▓▓░   │ │ ▓▓░░░   │  [View Logs]         │
│  │ 45%     │ │ 68%     │ │ 32%     │  [Clear Cache]        │
│  └─────────┘ └─────────┘ └─────────┘                        │
│                                                             │
│  APPLICATIONS                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● SWO PROD    :3080   ▲ 99.9%   [Restart] [Logs]   │   │
│  │ ● SWO DEV     :3081   ▲ 100%    [Restart] [Logs]   │   │
│  │ ● Discord Bot PM2     ▲ 100%    [Restart] [Logs]   │   │
│  │ ○ Future App  :3082   — Stopped [Start]            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  RECENT ALERTS                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [WARN] 14:32 - SWO PROD response time > 500ms      │   │
│  │ [INFO] 12:15 - DEV deployment completed            │   │
│  │ [OK]   08:00 - Daily backup successful             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Matrix Rain Background Component

```tsx
// components/MatrixRain.tsx
'use client';

import { useEffect, useRef } from 'react';

export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops: number[] = Array(Math.floor(columns)).fill(1);

    function draw() {
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      ctx!.fillStyle = '#0f0';
      ctx!.font = `${fontSize}px monospace`;

      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx!.fillText(char, i * fontSize, y * fontSize);

        if (y * fontSize > canvas!.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      });
    }

    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 z-0 opacity-20 pointer-events-none"
    />
  );
}
```

---

## 🔧 4. PM2 Integration

### Ecosystem File

Create `/opt/star_world_order/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'swo-prod',
      cwd: '/opt/star_world_order/PROD/Star-World-Order',
      script: 'npm',
      args: 'start -- -p 3080',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_ENV_MODE: 'prod',
      },
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'swo-dev',
      cwd: '/opt/star_world_order/DEV/Star-World-Order',
      script: 'npm',
      args: 'start -- -p 3081',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_ENV_MODE: 'dev',
      },
      max_memory_restart: '1G',
    },
    {
      name: 'swo-bot',
      cwd: '/opt/star_world_order/SWO_bot',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'uptime-kuma',
      cwd: '/opt/monitoring/uptime-kuma',
      script: 'server/server.js',
    },
    {
      name: 'admin-suite',
      cwd: '/opt/admin-suite',
      script: 'npm',
      args: 'start -- -p 3090',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

### PM2 Commands

```bash
# Start all apps
pm2 start ecosystem.config.js

# Status
pm2 status

# Logs
pm2 logs              # All logs
pm2 logs swo-prod     # Specific app
pm2 logs --lines 100  # Last 100 lines

# Restart
pm2 restart swo-prod
pm2 restart all

# Monitor (terminal dashboard)
pm2 monit

# Save and auto-start on boot
pm2 save
pm2 startup
```

---

## 🔒 5. Security & Access

### Nginx Reverse Proxy (Optional but Recommended)

```nginx
# /etc/nginx/sites-available/admin-suite
server {
    listen 443 ssl;
    server_name admin.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Basic auth
    auth_basic "Admin Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    # Admin Dashboard
    location / {
        proxy_pass http://localhost:3090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Uptime Kuma
    location /uptime/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # Netdata
    location /metrics/ {
        proxy_pass http://localhost:19999/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### Create Auth File

```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Enter password when prompted
```

---

## 📱 6. Mobile Access

For mobile monitoring, consider:

1. **Uptime Kuma PWA** - Install as app from browser
2. **Netdata Cloud** - Free tier, mobile app available
3. **Discord Webhooks** - Get alerts in your pocket

---

## 🎮 7. Quick Setup Script

Create `/opt/setup-admin-suite.sh`:

```bash
#!/bin/bash

echo "=== Admin Suite Setup ==="

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

# 1. Install Uptime Kuma
echo -e "${GREEN}[1/4] Installing Uptime Kuma...${NC}"
mkdir -p /opt/monitoring/uptime-kuma
cd /opt/monitoring/uptime-kuma
git clone https://github.com/louislam/uptime-kuma.git . 2>/dev/null || git pull
npm run setup

# 2. Install Netdata
echo -e "${GREEN}[2/4] Installing Netdata...${NC}"
if ! command -v netdata &> /dev/null; then
    bash <(curl -Ss https://my-netdata.io/kickstart.sh) --dont-wait
fi

# 3. Create ecosystem file
echo -e "${GREEN}[3/4] Creating PM2 ecosystem...${NC}"
cat > /opt/star_world_order/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'swo-prod',
      cwd: '/opt/star_world_order/PROD/Star-World-Order',
      script: 'npm',
      args: 'start -- -p 3080',
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENV_MODE: 'prod' },
    },
    {
      name: 'swo-dev',
      cwd: '/opt/star_world_order/DEV',
      script: 'npm',
      args: 'start -- -p 3081',
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENV_MODE: 'dev' },
    },
    {
      name: 'uptime-kuma',
      cwd: '/opt/monitoring/uptime-kuma',
      script: 'server/server.js',
    },
  ],
};
EOF

# 4. Start services
echo -e "${GREEN}[4/4] Starting services...${NC}"
pm2 start /opt/star_world_order/ecosystem.config.js
pm2 save
pm2 startup

echo ""
echo "=== Setup Complete ==="
echo "Uptime Kuma: http://$(hostname -I | awk '{print $1}'):3001"
echo "Netdata:     http://$(hostname -I | awk '{print $1}'):19999"
echo "SWO PROD:    http://$(hostname -I | awk '{print $1}'):3080"
echo "SWO DEV:     http://$(hostname -I | awk '{print $1}'):3081"
```

---

## 📊 Dashboard Mockup

```
╔══════════════════════════════════════════════════════════════════════╗
║  ░░░ ADMIN SUITE ░░░                                   [●] [□] [×]  ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   ┌──────────────────────┐  ┌──────────────────────┐                ║
║   │  ▓▓▓▓▓▓▓▓░░░░  CPU  │  │  ▓▓▓▓▓▓▓▓▓▓░░  RAM  │                ║
║   │       45%           │  │       72%           │                ║
║   └──────────────────────┘  └──────────────────────┘                ║
║                                                                      ║
║   SERVICES                                                          ║
║   ├─ ● SWO PROD ────────── ONLINE ──── 99.9% ──── :3080            ║
║   ├─ ● SWO DEV ─────────── ONLINE ──── 100%  ──── :3081            ║
║   ├─ ● Discord Bot ─────── ONLINE ──── 100%  ──── PM2              ║
║   ├─ ● Uptime Kuma ─────── ONLINE ──── 100%  ──── :3001            ║
║   └─ ○ Future App ──────── STOPPED ─────────────── :3082           ║
║                                                                      ║
║   QUICK ACTIONS                         RECENT LOGS                 ║
║   ┌────────────────────┐               ┌────────────────────────┐   ║
║   │ [↻] Restart PROD   │               │ 15:42 [INFO] Deploy OK │   ║
║   │ [↻] Restart DEV    │               │ 15:41 [WARN] Slow RPC  │   ║
║   │ [📋] View Logs     │               │ 15:40 [INFO] Vote cast │   ║
║   │ [🗑️] Clear Cache   │               │ 15:39 [INFO] User join │   ║
║   └────────────────────┘               └────────────────────────┘   ║
║                                                                      ║
║   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 🔄 Maintenance

### Daily
- Check Uptime Kuma dashboard (automated alerts handle most issues)

### Weekly
- Review PM2 logs for errors: `pm2 logs --lines 500 | grep -i error`
- Check disk space: `df -h`

### Monthly
- Update dependencies: `npm update`
- Rotate logs: `pm2 flush`
- Review Netdata historical data

---

## 📚 Resources

- [Uptime Kuma Docs](https://github.com/louislam/uptime-kuma/wiki)
- [Netdata Docs](https://learn.netdata.cloud/)
- [PM2 Docs](https://pm2.keymetrics.io/docs/)
- [Next.js Docs](https://nextjs.org/docs)

---

## 🎯 Next Steps

1. **Run setup script** on your server
2. **Configure Uptime Kuma** monitors
3. **Set up Discord webhooks** for alerts
4. **(Optional)** Create custom admin dashboard repo
5. **(Optional)** Add Nginx reverse proxy with SSL

---

**Created for Star World Order infrastructure management.**
**Compatible with SWO and future projects.**
