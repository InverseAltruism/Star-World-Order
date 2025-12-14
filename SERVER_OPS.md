# SERVER_OPS.md

Production environment setup documentation for the Star World Order NUC server.

## 1. Overview

**Live Site**: https://starworldorder.com

**Server Details**:
- **Device**: NUC (Intel Next Unit of Computing)
- **Internal IP**: 192.168.1.124
- **Public IP**: 92.104.162.171

## 2. Directory Structure

```
/opt/star_world_order/
├── DEV/                    # dev branch - testing (port 3081)
├── PROD/                   # main branch - production (port 3080)
├── deploy-dev.sh           # Deploy script for DEV
├── deploy-prod.sh          # Deploy script for PROD
├── health-check.sh         # Health monitoring script
└── logs/                   # Health check logs
```

## 3. Services & Ports

| Service | Port | URL |
|---------|------|-----|
| Star World PROD | 3080 | https://starworldorder.com |
| Star World DEV | 3081 | http://192.168.1.124:3081 |
| Grafana | 3000 | http://192.168.1.124:3000 |
| Nginx | 80/443 | Reverse proxy |

## 4. Quick Commands (Aliases)

These aliases provide quick access to common server operations:

- `swo-health` - Run health check
- `swo-deploy-dev` - Deploy to DEV
- `swo-deploy-prod` - Deploy to PROD
- `swo-logs` - View live PROD logs
- `swo-status` - Check service status
- `swo-restart` - Restart PROD service
- `swo-dev` - Start DEV server
- `swo-nginx-logs` - View nginx access logs

## 5. Systemd Service Commands

Control the Star World Order production service using systemd:

```bash
# Check service status
sudo systemctl status star-world

# Restart the service
sudo systemctl restart star-world

# Stop the service
sudo systemctl stop star-world

# View live logs
sudo journalctl -u star-world -f
```

## 6. PR/Deploy Workflow

Follow this workflow for deploying changes to production:

1. **Create PR**: Copilot Agent creates PR → targets `dev` branch
2. **Review & Merge**: Review and merge PR to `dev`
3. **Deploy to DEV**: Run `/opt/star_world_order/deploy-dev.sh`
4. **Test DEV**: Test at http://192.168.1.124:3081
5. **Promote to PROD**: If good → Create PR `dev` → `main` on GitHub, merge
6. **Deploy to PROD**: Run `/opt/star_world_order/deploy-prod.sh`
7. **Verify**: Live at https://starworldorder.com

## 7. SSL Certificate

**Provider**: Let's Encrypt

**Certificate Details**:
- **Expires**: March 14, 2026
- **Auto-renewal**: Configured via Certbot
- **Cert location**: `/etc/letsencrypt/live/starworldorder.com/`

**Manual renewal** (if needed):
```bash
sudo certbot renew --dry-run
```

## 8. Nginx Configuration

**Config file**: `/etc/nginx/sites-available/starworldorder`

**Common operations**:
```bash
# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx
```

## 9. Monitoring

**Health Check System**:
- Health check runs every **30 minutes** via cron
- Logs stored in `/opt/star_world_order/logs/health.log`
- Grafana available for advanced monitoring at http://192.168.1.124:3000

**Viewing logs**:
```bash
# View recent health checks
tail -f /opt/star_world_order/logs/health.log

# Check service logs
sudo journalctl -u star-world -f
```

## 10. Troubleshooting

Common issues and solutions:

### Site Down
1. Check service status: `swo-status`
2. View logs: `swo-logs`
3. Restart if needed: `swo-restart`

### IP Address Changes
- Update A record in GoDaddy DNS to point to new public IP
- Verify DNS propagation: `nslookup starworldorder.com`

### Server Action Errors
- Users need to hard refresh the browser: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
- This clears cached JavaScript bundles

### SSL Issues
- Check certificate expiration: `sudo certbot certificates`
- Test renewal: `sudo certbot renew --dry-run`
- Force renewal if needed: `sudo certbot renew --force-renewal`

### Port Conflicts
- Check what's using a port: `sudo lsof -i :3080`
- Kill process if needed: `sudo kill -9 <PID>`

### Nginx Not Starting
- Test config: `sudo nginx -t`
- Check error logs: `sudo tail -f /var/log/nginx/error.log`

## 11. Important Files

Quick reference for critical system files:

| File/Directory | Purpose |
|----------------|---------|
| `/etc/nginx/sites-available/starworldorder` | Nginx configuration |
| `/etc/systemd/system/star-world.service` | Systemd service definition |
| `/etc/letsencrypt/live/starworldorder.com/` | SSL certificates |
| `/opt/star_world_order/logs/` | Health check logs |
| `/opt/star_world_order/deploy-dev.sh` | DEV deployment script |
| `/opt/star_world_order/deploy-prod.sh` | PROD deployment script |

---

## Quick Reference

### Emergency Contacts
- **Server Admin**: Check internal documentation
- **Domain Registrar**: GoDaddy (starworldorder.com)

### Backup Strategy
- Automated backups via systemd timer
- Database snapshots stored in `/opt/star_world_order/backups/`

### Server Specs
- **CPU**: Intel NUC processor
- **RAM**: Check with `free -h`
- **Disk**: Check with `df -h`

---

*Last Updated: 2025-12-14*

*For additional help, refer to [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md)*
