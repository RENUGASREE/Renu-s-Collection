# Renu's Collections - Deployment Guide

This guide provides instructions for deploying the Renu's Collections e-commerce application.

## Project Overview

- **Brand Name**: Renu's Collections
- **Owner**: Renuga Sree
- **Contact**: renuscollection05@gmail.com
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + TypeScript + MongoDB
- **Database**: MongoDB Atlas (recommended) or local MongoDB

## Prerequisites

- Node.js >= 20
- MongoDB Atlas account or local MongoDB instance
- Git
- Domain name (optional for production)

## Environment Variables

### Backend (.env)

Create a `.env` file in the `server/` directory:

```env
# Server
NODE_ENV=production
PORT=8000
API_PREFIX=/api/v1

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/renu_collections?retryWrites=true&w=majority

# CORS (comma-separated origins)
CORS_ORIGINS=https://renucollections.com,https://www.renucollections.com

# JWT (Required before production)
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars-production
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Razorpay (Payment gateway)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email (SMTP configuration)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@renucollections.com

# Frontend URL (password reset links, etc.)
FRONTEND_URL=https://renucollections.com
FRONTEND_BASE_PATH=/

# Admin
ADMIN_API_KEY=your-admin-api-key-change-me-production
ADMIN_SEED_EMAIL=admin@renucollections.com
ADMIN_SEED_PASSWORD=Admin@12345
```

### Frontend (.env)

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_BASE_URL=https://your-backend-api.com
```

## Deployment Options

### Option 1: Vercel (Frontend) + Render/Railway (Backend)

#### Frontend Deployment (Vercel)

1. Push code to GitHub
2. Import project in Vercel
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add environment variables
6. Deploy

#### Backend Deployment (Render/Railway)

1. Push code to GitHub
2. Import project in Render/Railway
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables
6. Deploy

### Option 2: VPS (DigitalOcean, AWS EC2, etc.)

#### Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB (if using local)
# Follow MongoDB installation guide for your OS

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone repository
git clone <your-repo-url>
cd Renu_Collections

# Install dependencies
cd server && npm install
cd ../frontend && npm install

# Build frontend
cd frontend
npm run build

# Build backend
cd ../server
npm run build

# Start backend with PM2
pm2 start dist/index.js --name renu-collections-api

# Setup Nginx reverse proxy (optional)
# Configure Nginx to serve frontend and proxy API requests
```

#### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name renucollections.com www.renucollections.com;

    # Frontend
    location / {
        root /path/to/Renu_Collections/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 3: Docker Deployment

#### Dockerfile (Backend)

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8000

CMD ["node", "dist/index.js"]
```

#### Dockerfile (Frontend)

```dockerfile
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/renu_collections
    depends_on:
      - mongo

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  mongo:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

## Post-Deployment Steps

1. **Seed Admin User**
   ```bash
   cd server
   npm run seed:admin
   ```
   Default admin credentials:
   - Email: admin@renucollections.com
   - Password: Admin@12345 (CHANGE IMMEDIATELY)

2. **Configure Domain**
   - Update DNS records to point to your server
   - Set up SSL certificate (Let's Encrypt recommended)

3. **Test Application**
   - Verify frontend loads correctly
   - Test API endpoints
   - Test authentication flow
   - Test payment integration (if configured)

4. **Monitor Logs**
   ```bash
   # With PM2
   pm2 logs renu-collections-api

   # With Docker
   docker-compose logs -f
   ```

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT secrets (min 32 characters)
- [ ] Enable HTTPS/SSL
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Use environment variables for sensitive data
- [ ] Never commit .env files to version control

## Backup Strategy

### MongoDB Backup

```bash
# Manual backup
mongodump --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/renu_collections" --out=/backup/path

# Automated backup (cron job)
0 2 * * * mongodump --uri="..." --out=/backup/path/$(date +\%Y\%m\%d)
```

## Troubleshooting

### Backend won't start
- Check MongoDB connection string
- Verify environment variables are set
- Check port availability

### Frontend build fails
- Clear node_modules and reinstall
- Check Node.js version (>= 20)
- Verify all dependencies are installed

### API requests failing
- Check CORS configuration
- Verify API_BASE_URL in frontend .env
- Check backend logs for errors

## Support

For issues or questions, contact: renuscollection05@gmail.com

## License

Proprietary - Renu's Collections
