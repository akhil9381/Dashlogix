# 📊 DashLogix - Log Monitoring & Analytics System

A complete full-stack log monitoring and analytics solution that fetches logs from Splunk, stores them in MongoDB, and displays real-time analytics in a React dashboard.

## 🏗️ Architecture

```
┌─────────────┐
│   Splunk    │ (Log Ingestion & Analysis)
│   (Source)  │
└──────┬──────┘
       │
       │ (REST API)
       ▼
┌──────────────────────────────────┐
│   Backend (Node.js + Express)    │
├──────────────────────────────────┤
│ • /logs → Fetch from Splunk      │
│ • /stored-logs → Get from MongoDB│
│ • /history → Search history      │
│ • /stats → Dashboard stats       │
│ • DELETE /logs → Clear data      │
└──────────────────────────────────┘
       │
       │ (REST API)
       ▼
┌──────────────────────────────────┐
│   MongoDB                        │
│ • Log collection (persistence)   │
│ • SearchHistory (search tracking)│
└──────────────────────────────────┘
       │
       │ (REST API)
       ▼
┌──────────────────────────────────┐
│   Frontend (React)               │
├──────────────────────────────────┤
│ • Search bar (SPL queries)       │
│ • Logs table (real-time display) │
│ • Stats cards (analytics)        │
│ • Filter buttons (ERROR/WARNING) │
│ • Search history (quick reuse)   │
└──────────────────────────────────┘
```

## 📁 Project Structure

```
dashlogix/
├── dashlogix-backend/          # Node.js + Express backend
│   ├── server.js              # Main server with all routes
│   ├── models/
│   │   ├── Log.js            # Log schema (fetched logs)
│   │   └── SearchHistory.js  # Search query history schema
│   ├── package.json
│   ├── .env                  # Environment variables
│   └── node_modules/
│
├── dashlogix-frontend/        # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchBar.jsx       # Search input
│   │   │   ├── LogsTable.jsx       # Logs display
│   │   │   ├── StatsCards.jsx      # Analytics cards
│   │   │   ├── FilterButtons.jsx   # Filter controls
│   │   │   └── SearchHistory.jsx   # Recent searches
│   │   ├── App.jsx                 # Main app component
│   │   ├── App.css                 # Styling
│   │   └── main.jsx                # React entry point
│   ├── public/
│   │   └── index.html             # HTML template
│   ├── package.json
│   ├── vite.config.js            # Vite build config
│   └── node_modules/
│
└── README.md                   # This file
```

## 🚀 Quick Start

### 1️⃣ Backend Setup

```bash
cd dashlogix-backend
npm install
```

**Configure `.env` file:**

```env
# Splunk Configuration
SPLUNK_HOST=your-splunk-host
SPLUNK_PORT=8089
SPLUNK_USERNAME=admin
SPLUNK_PASSWORD=password

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/dashlogix
```

**Start the backend:**

```bash
node server.js
```

Backend runs on `http://localhost:5000`

### 2️⃣ Frontend Setup

```bash
cd dashlogix-frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

## 📡 API Routes

### GET `/logs?q=query`

Fetch logs from Splunk, store in MongoDB, and return results.

**Example:**

```bash
curl "http://localhost:5000/logs?q=index=main%20ERROR"
```

### GET `/stored-logs`

Retrieve last 50 stored logs from MongoDB.

**Response:**

```json
[
  {
    "_id": "...",
    "time": "2026-03-23T10:30:00Z",
    "host": "server-01",
    "source": "/var/log/app.log",
    "log": "ERROR: Connection timeout",
    "query": "index=main ERROR",
    "createdAt": "2026-03-23T10:30:15Z"
  }
]
```

### GET `/history`

Get last 10 search queries.

**Response:**

```json
[
  {
    "_id": "...",
    "query": "index=main ERROR",
    "timestamp": "2026-03-23T10:30:15Z"
  }
]
```

### GET `/stats`

Get dashboard statistics (total logs, errors, warnings, info).

**Response:**

```json
{
  "totalLogs": 1523,
  "errorCount": 145,
  "warningCount": 89,
  "infoCount": 1289
}
```

### DELETE `/logs`

Clear all stored logs from MongoDB (for testing).

**Response:**

```json
{
  "message": "Cleared 1523 logs",
  "deletedCount": 1523
}
```

## 🎯 Key Features

✅ **Dynamic SPL Queries** - Enter any Splunk SPL query  
✅ **Data Persistence** - Logs stored in MongoDB for fast retrieval  
✅ **Deduplication** - Avoids storing duplicate logs using MD5 hash  
✅ **Search History** - Reuse previous searches from the sidebar  
✅ **Log Filtering** - Filter by ERROR, WARNING, or INFO  
✅ **Real-time Stats** - See total logs, errors, warnings count  
✅ **Clean UI** - Dark theme, responsive design  
✅ **Error Handling** - Graceful error messages and loading states

## 🔧 Technical Details

### Backend Technologies

- **Express.js** - REST API framework
- **Mongoose** - MongoDB ORM
- **Axios** - HTTP client for Splunk
- **Node.js 16+** - JavaScript runtime

### Frontend Technologies

- **React 18** - UI library
- **Axios** - API communication
- **Vite** - Build tool (fast dev server)
- **CSS3** - Styling (no external UI framework needed)

### Data Flow

1. **User searches** → Frontend sends query to `/logs`
2. **Backend fetches** → Splunk REST API query executed
3. **Parse response** → Clean and format log data
4. **Deduplication** → Check for existing logs using hash
5. **Store in DB** → New logs saved to MongoDB
6. **Save history** → Query added to search history
7. **Return to UI** → Logs displayed in table
8. **Next load** → Dashboard pulls from `/stored-logs` (fast!)

## 🎨 UI Components

### Search Bar

- Input field for SPL queries
- Search button with loading state
- Placeholder with example query

### Stats Cards

- **Total Logs** - Overall count
- **Errors** - Red card, error count
- **Warnings** - Orange card, warning count
- **Info** - Blue card, info count

### Filter Buttons

- **ALL** - Show all logs
- **ERROR** - Red highlighting
- **WARNING** - Orange highlighting
- **INFO** - Blue highlighting

### Logs Table

- Time, Host, Source, Message columns
- Scrollable with sticky header
- Row highlighting for errors/warnings
- Monospace font for readability

### Search History

- Sidebar panel with recent searches
- Click to rerun query
- Shows timestamp of each search
- Latest 10 queries

## 📊 MongoDB Collections

### Logs Collection

```javascript
{
  time: String,          // "2026-03-23T10:30:00Z"
  host: String,          // "server-01"
  source: String,        // "/var/log/app.log"
  log: String,           // Full log message
  query: String,         // The SPL query used
  createdAt: Date        // Auto-timestamp
}
```

### SearchHistory Collection

```javascript
{
  query: String,         // "index=main ERROR"
  timestamp: Date        // Auto-timestamp
}
```

## 🛡️ Error Handling

- **Splunk connection fails** → User sees error banner
- **MongoDB unavailable** → Clear error in console
- **Empty results** → "No logs found" message
- **Invalid SPL query** → Splunk error returned
- **Network timeout** → Graceful retry mechanism

## 🚦 Loading States

- Search button disables during fetch
- "Searching..." text shows progress
- Table shows "Loading logs..." state
- Stats show "Loading stats..." state
- Filter buttons disable during load

## 📝 Sample Queries

```bash
# All errors in main index
index=main ERROR

# Specific application errors
index=main source=/var/log/app.log ERROR | head 100

# Host-specific logs from last day
index=main host=server-01 earliest=-24h

# Warning levels
index=main WARNING

# Authentication failures
index=security authentication=failed
```

## 🧪 Testing

### Test Endpoints

```bash
# Test backend health
curl http://localhost:5000/

# Fetch and store logs
curl "http://localhost:5000/logs?q=index=main%20|%20head%2010"

# Get stored logs
curl http://localhost:5000/stored-logs

# Get search history
curl http://localhost:5000/history

# Get stats
curl http://localhost:5000/stats

# Clear logs (DELETE)
curl -X DELETE http://localhost:5000/logs
```

### Test with Frontend

1. Start backend: `npm start` (backend folder)
2. Start frontend: `npm run dev` (frontend folder)
3. Open `http://localhost:3000` in browser
4. Enter SPL query in search bar
5. Check MongoDB for stored data

## 🔐 Security Notes

- Store credentials in `.env`, never commit
- Use HTTPS in production
- Validate all user queries
- Implement authentication for dashboard
- Add rate limiting to API
- Use MongoDB authentication

## 🚀 Production Deployment

### Backend

```bash
# Build
npm install

# Run with process manager (PM2)
pm2 start server.js

# Environment variables
export SPLUNK_HOST=...
export MONGODB_URI=...
```

### Frontend

```bash
# Build
npm run build

# Serves optimized build from dist/
npm run preview
```

## 📈 Future Enhancements

- ✅ User authentication (login)
- ✅ Dashboard customization
- ✅ Real-time log streaming (WebSockets)
- ✅ Advanced filtering (date range, regex)
- ✅ Export logs (CSV, JSON)
- ✅ Alert rules (auto-notify on errors)
- ✅ Multiple Splunk instances
- ✅ Log alerting via email/SMS

## 🤝 Support

For issues or questions:

1. Check `.env` configuration
2. Verify Splunk connectivity
3. Check MongoDB connection
4. Review console logs for errors
5. Ensure ports 5000 and 3000 are free

## 📄 License

MIT License - Free to use and modify

---

**Built with ❤️ for log monitoring**

DashLogix: Smart. Fast. Simple.
