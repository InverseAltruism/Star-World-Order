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

## Self-Hosting

### Using Node.js Server

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm run start
   ```

3. **Use a process manager** (PM2 recommended)
   ```bash
   npm install -g pm2
   pm2 start npm --name "swo" -- start
   pm2 save
   pm2 startup
   ```

### Using Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine
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

## Troubleshooting

### Build Failures
- Check Node.js version (18+ required)
- Verify all dependencies are installed
- Check environment variables are set

### Runtime Errors
- Check browser console for errors
- Verify wallet connection works
- Check Monad RPC endpoint is accessible

---

For more help, refer to the [Next.js deployment documentation](https://nextjs.org/docs/deployment).
