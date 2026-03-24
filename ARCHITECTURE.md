# 🏗️ DashLogix Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       USER INTERFACE (Browser)                      │
│                   React Dashboard @ :3000                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                            HTTP (REST API)
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICE                              │
│                   Node.js + Express @ :5000                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Route Handler: GET /logs?q=query                                   │
│  ├─ Authenticate with Splunk                                       │
│  ├─ Execute SPL query                                              │
│  ├─ Parse streaming JSON response                                  │
│  ├─ Deduplicate logs (MD5 hash)                                    │
│  ├─ Store unique logs in MongoDB                                   │
│  ├─ Store search query in history                                  │
│  └─ Return logs to frontend                                        │
│                                                                      │
│  Route Handler: GET /stored-logs                                    │
│  └─ Return last 50 logs from MongoDB                               │
│                                                                      │
│  Route Handler: GET /history                                        │
│  └─ Return last 10 search queries                                  │
│                                                                      │
│  Route Handler: GET /stats                                          │
│  └─ Calculate & return log statistics                              │
│                                                                      │
│  Route Handler: DELETE /logs                                        │
│  └─ Clear all stored logs from MongoDB                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
           │                              │
    HTTPS Calls                    MongoDB Connection
           │                              │
           ▼                              ▼
┌──────────────────┐           ┌──────────────────┐
│   SPLUNK         │           │    MONGODB       │
│   (Data Source)  │           │  (Persistence)   │
├──────────────────┤           ├──────────────────┤
│ • Indexers       │           │ • Logs           │
│ • Parsing        │           │ • SearchHistory  │
│ • Indexing       │           │                  │
│ • Search API     │           │ Storage Limit:   │
│                  │           │ (Configurable)   │
└──────────────────┘           └──────────────────┘
```

## Data Flow Diagram

### Flow 1: User Searches (Interactive)

```
┌─────────────┐
│   User      │
│ Enters SPL  │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│   Frontend           │
│ (React Dashboard)    │
│                      │
│ POST /logs?q=...     │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────────┐
│   Backend (Express)          │
│                              │
│  1. Auth with Splunk         │
│  2. Execute SPL Query        │
│  3. Parse Response           │
│  4. Deduplicate              │
│  5. Store in MongoDB         │
│  6. Save to History          │
│  7. Return Results           │
└──────┬───────────────────────┘
       │
       ├─→ Splunk (HTTPS :8089)
       ├─→ MongoDB (Atlas)
       │
       ▼
┌──────────────────────┐
│  Response to Client  │
│  Logs + Stats        │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Display in UI      │
│  • Logs table        │
│  • Highlight errors  │
│  • Show stats        │
└──────────────────────┘
```

### Flow 2: Dashboard Loads (Cached)

```
┌─────────────┐
│   User      │
│   Loads     │
│ Dashboard   │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│   Frontend           │
│ (React Dashboard)    │
│                      │
│ GET /stored-logs     │
│ GET /stats           │
│ GET /history         │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Backend (Express)  │
│                      │
│ Query MongoDB        │
│ Calculate Stats      │
│ Return All Data      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   MongoDB            │
│  • Logs (recent)     │
│  • History (queries) │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Display in UI       │
│  • Logs table        │
│  • Stats cards       │
│  • Search history    │
│  • Filter buttons    │
└──────────────────────┘

⚠️  No Splunk call! (Fast ⚡)
```

## Component Architecture

### Frontend Components

```
App.jsx
├── Header
│   └── Title + Description
│
├── Sidebar
│   └── SearchHistory
│       ├── Recent searches
│       └── Click to reuse
│
└── Main Content
    ├── SearchBar
    │   ├── Input field
    │   └── Search button
    │
    ├── StatsCards
    │   ├── Total Logs
    │   ├── Errors
    │   ├── Warnings
    │   └── Info
    │
    ├── Controls
    │   ├── FilterButtons (ALL, ERROR, WARNING, INFO)
    │   └── Clear Logs button
    │
    └── LogsTable
        ├── Time column
        ├── Host column
        ├── Source column
        └── Message column
            (with highlighte ERROR/WARNING rows)
```

### Backend Routes

```
GET /
└─ Health check

GET /logs?q=<SPL_QUERY>
├─ Splunk auth
├─ Execute query
├─ Parse results
├─ Deduplicate (MD5)
├─ Store in MongoDB
├─ Store in history
└─ Return logs

GET /stored-logs
├─ Query MongoDB
├─ Limit to 50
├─ Sort by newest
└─ Return logs

GET /history
├─ Query MongoDB
├─ Limit to 10
├─ Sort by newest
└─ Return queries

GET /stats
├─ Count total logs
├─ Count errors
├─ Count warnings
└─ Return stats

DELETE /logs
├─ Delete all logs
└─ Return count
```

## Database Schema

### MongoDB Collections

#### Logs Collection

```javascript
db.logs.insertOne({
  time: "2026-03-23T10:30:00Z", // From Splunk
  host: "server-01", // From Splunk
  source: "/var/log/app.log", // From Splunk
  log: "ERROR: Connection timeout", // From Splunk
  query: "index=main ERROR", // Original search query
  createdAt: ISODate("2026-03-23T10:30:15Z"), // Auto timestamp
});

// Index for deduplication check
db.logs.createIndex({ time: 1, host: 1, log: 1 });
```

#### SearchHistory Collection

```javascript
db.searchhistories.insertOne({
  query: "index=main ERROR", // Search query
  timestamp: ISODate("2026-03-23T10:30:15Z"), // Auto timestamp
});

// Index for fast retrieval
db.searchhistories.createIndex({ timestamp: -1 });
```

## Technology Stack

```
┌─────────────────────────┐
│   PRESENTATION LAYER    │
├─────────────────────────┤
│ React 18                │ Frontend UI
│ Vite                    │ Build tool
│ Axios                   │ HTTP client
│ CSS3                    │ Styling
└─────────────────────────┘

┌─────────────────────────┐
│   BUSINESS LOGIC LAYER  │
├─────────────────────────┤
│ Express.js              │ REST API
│ Node.js                 │ Runtime
│ Crypto                  │ Hashing
│ CORS                    │ Security
└─────────────────────────┘

┌─────────────────────────┐
│   DATA ACCESS LAYER     │
├─────────────────────────┤
│ Mongoose                │ ODM/ORM
│ MongoDB                 │ Database
│ Axios/HTTPS             │ External APIs
└─────────────────────────┘

┌─────────────────────────┐
│   EXTERNAL SYSTEMS      │
├─────────────────────────┤
│ Splunk                  │ Logs source
│ MongoDB Atlas           │ Cloud database
└─────────────────────────┘
```

## Deduplication Strategy

```
When storing logs:

1. Generate hash for incoming log
   hash = MD5(time + host + log_message)

2. Query existing logs in MongoDB
   existingHashes = Set of all existing hashes

3. Check if hash exists
   if hash in existingHashes:
     → Skip (duplicate)
   else:
     → Store (new log)

4. Count metrics
   - New logs stored
   - Duplicates skipped
   - Total efficiency
```

## Error Handling Flow

```
┌──────────────────────┐
│   API Request        │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐     ✅
│   Validation Pass?   ├─────→ Process
└──────┬───────────────┘
       │ ❌
       ▼
┌──────────────────────┐
│   Error Handling     │
├──────────────────────┤
│ • Log error          │
│ • Return error code  │
│ • User message       │
│ • No system crash    │
└──────────────────────┘
```

## Scalability Considerations

### Current (Single Backend + MongoDB)

- Good for: Team dashboards, internal monitoring
- Handles: ~1000 concurrent users
- Storage: Based on MongoDB quota

### Future Improvements

- **Horizontal scaling:** Load balancer → multiple backend servers
- **Caching:** Redis for frequently accessed logs
- **Queue:** Message broker for async processing
- **Sharding:** MongoDB sharding for large datasets
- **CDN:** Static content delivery
- **Real-time:** WebSocket for live log streaming

## Security Architecture

```
┌─────────────────┐
│   FRONTEND      │
├─────────────────┤
│ • HTTPS only    │ Production
│ • Auth token    │ (JWT/OAuth)
│ • CORS enabled  │
│ • Input sanitize│
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   BACKEND       │
├─────────────────┤
│ • Validate input│
│ • Rate limit    │
│ • Error logging │
│ • Session mgmt  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   SPLUNK        │
├─────────────────┤
│ • HTTPS :8089   │
│ • Auth token    │
│ • Permission    │
│   check         │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   MONGODB       │
├─────────────────┤
│ • Auth enabled  │
│ • Encryption    │
│ • Backup        │
└─────────────────┘
```

---

**This architecture ensures:**

- ✅ Fast dashboard loads (MongoDB cache)
- ✅ Reliable data persistence
- ✅ No duplicate logs
- ✅ History tracking
- ✅ Error handling
- ✅ Scalable design
