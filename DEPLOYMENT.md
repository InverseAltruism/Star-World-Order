# Deployment Guide

This guide covers deploying the Star World Order website to various platforms.

## Vercel (Recommended)

Vercel is the recommended platform for deploying Next.js applications.

### Prerequisites
- Vercel account (sign up at https://vercel.com)
- GitHub repository connected to Vercel

### Steps

1. **Install Vercel CLI** (optional)
   ```bash
   npm install -g vercel
   ```

2. **Deploy via GitHub**
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Configure project settings:
     - Framework Preset: Next.js
     - Build Command: `npm run build`
     - Output Directory: `.next`

3. **Set Environment Variables**
   In Vercel dashboard, add:
   ```
   NEXT_PUBLIC_MONAD_CHAIN_ID=41454
   NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
   ```

4. **Deploy**
   - Click "Deploy"
   - Vercel will automatically deploy on every push to main branch

### Custom Domain

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Update DNS records as instructed

## Netlify

### Steps

1. **Connect Repository**
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Select your repository

2. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `.next`

3. **Set Environment Variables**
   Add the same environment variables as above

4. **Deploy**

## Self-Hosting (NUC Server)

Star World Order runs on an Intel NUC with the following setup:

### Directory Structure

```
/opt/star_world_order/
├── DEV/                    # dev branch (port 3081)
├── PROD/                   # main branch (port 3080)
├── deploy-dev.sh           # Deploy script for DEV
├── deploy-prod.sh          # Deploy script for PROD
├── health-check.sh         # Health monitoring
└── logs/                   # Health check logs
```

### Systemd Service

The production app runs as a systemd service:

```bash
# Check status
sudo systemctl status star-world

# Restart service
sudo systemctl restart star-world

# View logs
sudo journalctl -u star-world -f
```

### Deployment Commands

```bash
# Deploy to DEV
cd /opt/star_world_order/DEV
git pull origin dev
npm install
NEXT_PUBLIC_ENV_MODE=dev npm run build
npm start -- -p 3081

# Deploy to PROD
cd /opt/star_world_order/PROD
git pull origin main
npm install
NEXT_PUBLIC_ENV_MODE=prod npm run build
sudo systemctl restart star-world
```

### SSL/HTTPS

- **Provider**: Let's Encrypt (Certbot)
- **Reverse Proxy**: Nginx
- **Auto-renewal**: Configured via cron

### Using Docker (Alternative)

1. **Create Dockerfile**
   ```dockerfile
   FROM node:20.11-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

2. **Build and run**
   ```bash
   docker build -t star-world-order .
   docker run -p 3000:3000 star-world-order
   ```

## Environment Variables

Required environment variables for production:

```bash
# Monad Chain Configuration
NEXT_PUBLIC_MONAD_CHAIN_ID=41454
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz

# Optional: Contract Addresses (add when contracts are deployed)
# NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...
# NEXT_PUBLIC_DAO_CONTRACT_ADDRESS=0x...

# Optional: WalletConnect Project ID
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

## Performance Optimization

- Enable CDN caching
- Use Image Optimization (Next.js Image component)
- Enable compression
- Monitor Core Web Vitals

## Monitoring

Consider adding:
- Vercel Analytics
- Sentry for error tracking
- Google Analytics or Plausible for user analytics

## Security

- Use HTTPS (automatic with Vercel/Netlify)
- Set proper CORS headers
- Never commit private keys or sensitive data
- Regular security audits

### Cron / internal-endpoint auth — production checklist

The cron and internal STAR endpoints (`/api/cron/*`,
`/api/sanctuary/star/earn`) authenticate via `CRON_SECRET` and
`STAR_INTERNAL_SECRET`. A local-dev escape hatch exists behind the
explicit flag `SANCTUARY_ALLOW_CRON_BYPASS=1`.

**Production deploys must NOT set `SANCTUARY_ALLOW_CRON_BYPASS`.**

- Vercel / Netlify / hosted: do not add the variable to the project's
  environment settings. If it appears, delete it or set it to `0`.
- Self-hosted (NUC / systemd): the systemd unit and `deploy-prod.sh`
  must not export `SANCTUARY_ALLOW_CRON_BYPASS`. Verify with
  `systemctl show star-world -p Environment` after deploy.
- Docker: do not pass `-e SANCTUARY_ALLOW_CRON_BYPASS=1`. If a
  `docker-compose.yml` or `Dockerfile` references it, remove the line.

The flag is intentionally decoupled from `NODE_ENV` — relying on
`NODE_ENV !== "production"` was brittle because some build/runtime
environments leave `NODE_ENV` unset, which silently disabled cron
auth. Only the literal string `1` activates the bypass; any other
value (including `true` or empty) is treated as disabled.

## Troubleshooting

### Build Failures
- Check Node.js version (20+ required, 22 recommended)
- Verify all dependencies are installed
- Check environment variables are set

### Runtime Errors
- Check browser console for errors
- Verify wallet connection works
- Check Monad RPC endpoint is accessible

---

For more help, refer to the [Next.js deployment documentation](https://nextjs.org/docs/deployment).
