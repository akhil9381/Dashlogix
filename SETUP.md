# 🚀 DashLogix Setup Guide

Complete step-by-step guide to get DashLogix running locally.

## Prerequisites

- Node.js 16+ and npm
- MongoDB (local or cloud)
- Splunk instance with REST API access
- Code editor (VS Code recommended)

## Step 1: Backend Setup

### 1a. Install Dependencies

```bash
cd dashlogix-backend
npm install
```

### 1b. Create `.env` File

Create a `.env` file in `dashlogix-backend/` with your credentials:

```env
# Splunk Configuration
SPLUNK_HOST=your-splunk-server.example.com
SPLUNK_PORT=8089
SPLUNK_USERNAME=admin
SPLUNK_PASSWORD=your_password

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/dashlogix

# Optional
NODE_ENV=development
```

**Getting Splunk credentials:**

- Log into Splunk web UI
- Settings → Data Inputs → HTTP Event Collector
- Or use your admin credentials

**MongoDB options:**

- **Local:** `mongodb://localhost:27017/dashlogix`
- **MongoDB Atlas:** `mongodb+srv://user:password@cluster.mongodb.net/dashlogix`
- **Docker:** `mongodb://host.docker.internal:27017/dashlogix`

### 1c. Start Backend Server

```bash
node server.js
```

Expected output:

```
🔍 SPLUNK PORT: 8089
MongoDB connected 😎
Server running on port 5000 🚀
```

✅ Backend ready at `http://localhost:5000`

## Step 2: Frontend Setup

### 2a. Install Dependencies

```bash
cd dashlogix-frontend
npm install
```

### 2b. Start Development Server

```bash
npm run dev
```

Expected output:

```
  VITE v5.0.0  ready in 123 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

✅ Frontend ready at `http://localhost:3000`

## Step 3: Test the System

### 3a. Test Backend

```bash
# Health check
curl http://localhost:5000/

# Fetch logs (empty query = default)
curl "http://localhost:5000/logs"

# Fetch stats
curl http://localhost:5000/stats

# Fetch search history
curl http://localhost:5000/history
```

### 3b. Test Frontend

1. Open browser: `http://localhost:3000`
2. You should see the DashLogix dashboard
3. Try searching: `index=main | head 10`
4. Check MongoDB for stored logs

## 🔍 Verify MongoDB Data

### Check Stored Logs

```bash
# Using MongoDB CLI
mongo dashlogix

# List logs
db.logs.find().limit(5)

# Count logs
db.logs.countDocuments()

# Check search history
db.searchhistories.find().limit(5)
```

## ⚠️ Troubleshooting

### Backend Won't Start

**Error: "Cannot find module"**

```bash
# Install missing dependencies
npm install
```

**Error: "MongoDB connection failed"**

- Check MONGO_URI in .env
- Ensure MongoDB is running
- For local: `mongod`
- For Atlas: Check IP whitelist

**Error: "Splunk authentication failed"**

- Verify SPLUNK_HOST, PORT, USERNAME, PASSWORD
- Check Splunk is accessible: `curl -k https://SPLUNK_HOST:8089/`
- Ensure user has API access permissions

### Frontend Shows "Failed to load"

**Error: "Cannot connect to backend"**

- Ensure backend is running on port 5000
- Check no CORS issues
- Open browser console (F12) for errors

**Blank/White Page**

- Clear browser cache: Ctrl+Shift+Delete
- Check browser console for JavaScript errors
- Try hard refresh: Ctrl+Shift+R

### Ports Already in Use

**Backend port 5000 in use:**

```bash
# Windows: Find process
netstat -ano | findstr :5000

# Linux/Mac: Find process
lsof -i :5000

# Kill process
kill -9 <PID>  # or use Windows Task Manager
```

**Frontend port 3000 in use:**

```bash
# Use different port
npm run dev -- --port 3001
```

## 📊 MongoDB Setup

### Local MongoDB

**Windows:**

```bash
# Download: https://www.mongodb.com/try/download/community
# Install and run
mongod
```

**Mac (Homebrew):**

```bash
brew install mongodb-community
brew services start mongodb-community
```

**Linux:**

```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

### MongoDB Atlas (Cloud)

1. Go to: https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create cluster
4. Get connection string
5. Update MONGO_URI in `.env`

Example connect string:

```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/dashlogix?retryWrites=true&w=majority
```

## 🧪 Test API Endpoints

### 1. Health Check

```bash
curl http://localhost:5000/
```

### 2. Search & Store Logs

```bash
curl "http://localhost:5000/logs?q=index=main"
```

Response: Array of logs

### 3. Get Stored Logs

```bash
curl http://localhost:5000/stored-logs
```

### 4. Get Search History

```bash
curl http://localhost:5000/history
```

### 5. Get Stats

```bash
curl http://localhost:5000/stats
```

### 6. Clear Logs

```bash
curl -X DELETE http://localhost:5000/logs
```

## 📁 File Structure Check

Verify you have:

```
dashlogix/
├── dashlogix-backend/
│   ├── server.js
│   ├── models/
│   │   ├── Log.js
│   │   └── SearchHistory.js
│   ├── package.json
│   ├── .env
│   └── node_modules/
│
├── dashlogix-frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchBar.jsx
│   │   │   ├── LogsTable.jsx
│   │   │   ├── StatsCards.jsx
│   │   │   ├── FilterButtons.jsx
│   │   │   └── SearchHistory.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── node_modules/
│
└── README.md
```

## 🎯 Next Steps

1. ✅ Backend and frontend running
2. ✅ Test API endpoints
3. ✅ Check MongoDB data
4. Try different SPL queries:
   - `index=main ERROR`
   - `index=main | stats count by host`
   - `index=main `earliest=-1h`

5. Explore dashboard features:
   - Search history
   - Filter logs
   - View stats
   - Clear logs

## 🚀 Production Checklist

- [ ] Use strong MongoDB credentials
- [ ] Use HTTPS for Splunk connection
- [ ] Set NODE_ENV=production
- [ ] Enable CORS properly
- [ ] Add authentication to frontend
- [ ] Use environment variables for all secrets
- [ ] Set up rate limiting
- [ ] Configure backups for MongoDB
- [ ] Monitor application logs
- [ ] Set up error tracking (Sentry)

## 📞 Support

If issues persist:

1. Check console logs (both browser and terminal)
2. Verify all environment variables
3. Ensure all services are running
4. Check firewall/network connectivity
5. Review MongoDB connection
6. Test Splunk connectivity with curl

---

**Ready to go?** Open `http://localhost:3000` and start searching! 🎉
