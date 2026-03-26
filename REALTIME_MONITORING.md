# 🔴 Real-Time Log Monitoring with DashLogix

Complete guide to set up real-time log monitoring using Splunk's `_internal` index with DashLogix.

## What is Real-Time Monitoring?

Real-time monitoring streams logs from Splunk to your browser in real-time using WebSocket connections. Instead of waiting for periodic polling, logs appear instantly as they're created in Splunk.

**Key Features:**
- 📡 **WebSocket Streaming**: Live log delivery via persistent WebSocket connections
- 🎯 **Index Selection**: Monitor any Splunk index (default: `_internal`)
- ⚡ **Sub-second Latency**: Logs appear in your browser with minimal delay
- 📊 **Automatic Ingestion**: New logs automatically stored in MongoDB
- 🎨 **Modern UI**: Beautiful, responsive real-time monitoring interface

## Prerequisites

1. **Splunk Instance** with:
   - REST API enabled (default: port 8089)
   - Valid admin/user credentials
   - Network access from your machine

2. **MongoDB** (for storing logs):
   - Local or MongoDB Atlas
   - Connection string ready

3. **Node.js 16+** and npm

## Step 1: Backend Configuration

### 1a. Install Dependencies

```bash
cd dashlogix-backend
npm install
```

This installs the `ws` library for WebSocket support.

### 1b. Create `.env` File

Create `dashlogix-backend/.env`:

```env
# Splunk Configuration - REQUIRED
SPLUNK_HOST=your-splunk-server.example.com
SPLUNK_PORT=8089
SPLUNK_SCHEME=https
SPLUNK_USERNAME=admin
SPLUNK_PASSWORD=your-splunk-password
SPLUNK_INDEX=_internal

# MongoDB Configuration - REQUIRED
MONGO_URI=mongodb://localhost:27017/dashlogix
# OR for MongoDB Atlas:
# MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/dashlogix

# Optional Settings
PORT=5001
COLLECT_INTERVAL_MS=5000
SPLUNK_COLLECT_LIMIT=200
NODE_ENV=development
```

### 1c. Start Backend Server

```bash
node server.js
```

Expected output:
```
🔍 Splunk API base: https://your-splunk-server.example.com:8089
MongoDB connected 😎
Server running on port 5001 🚀
📡 WebSocket available at ws://localhost:5001
```

✅ Backend ready at `http://localhost:5001`

## Step 2: Frontend Setup

### 2a. Install Dependencies

```bash
cd dashlogix-frontend
npm install
```

### 2b. Create/Update `.env.local` (if needed)

```env
VITE_API_URL=http://localhost:5001
VITE_WS_PORT=5001
```

### 2c. Start Development Server

```bash
npm run dev
```

Expected output:
```
VITE v5.0.0  ready in 123 ms
➜  Local:   http://localhost:3000/
```

✅ Frontend ready at `http://localhost:3000`

## Step 3: Using Real-Time Monitoring

### 3a. Access the Feature

1. Open http://localhost:3000 in your browser
2. Click the **🔴 Real-Time Monitoring** button in the top right
3. The real-time monitoring panel opens

### 3b. Start Monitoring

1. **Splunk Index**: Set to `_internal` (default) or another index
2. **Limit**: Set max number of logs (1-1000, default 100)
3. Click **🚀 Start Monitoring**

### 3c. Monitor Logs

- ✅ Connection indicator shows when connected (🟢 Connected / 🔴 Disconnected)
- 📊 Monitoring badge shows when actively streaming
- Logs appear in real-time as they're created in Splunk
- Scroll through the log feed or let it auto-scroll
- Click **📡 Ping** to test the connection
- Click **⛔ Stop Monitoring** to close the real-time stream

## API Endpoints

### Start Real-Time Monitoring

```bash
POST /api/realtime-start
Content-Type: application/json

{
  "index": "_internal",
  "limit": 100
}

Response:
{
  "ok": true,
  "message": "Real-time monitoring started",
  "jobSid": "1234567890.123456",
  "index": "_internal",
  "wsUrl": "ws://localhost:5001"
}
```

### Check Real-Time Status

```bash
GET /api/realtime-status

Response:
{
  "ok": true,
  "wsConnected": 2,
  "wsUrl": "ws://localhost:5001",
  "features": [
    "Real-time log streaming",
    "WebSocket support",
    "Internal index monitoring"
  ]
}
```

## WebSocket Protocol

The backend WebSocket server implements a simple JSON message protocol:

### Client Messages

**Start Real-Time Search:**
```json
{
  "type": "startRealtime",
  "index": "_internal",
  "limit": 100
}
```

**Health Check (Ping):**
```json
{
  "type": "ping"
}
```

### Server Messages

**Log Event (received logs):**
```json
{
  "type": "logEvent",
  "data": {
    "time": "2024-03-25T10:30:45.123Z",
    "host": "splunk-server",
    "source": "_internal",
    "log": "[INFO] Log message content"
  },
  "timestamp": "2024-03-25T10:30:45.456Z"
}
```

**Real-Time Search Started:**
```json
{
  "type": "realtimeStarted",
  "jobSid": "1234567890.123456",
  "message": "Real-time monitoring started"
}
```

**Search Complete:**
```json
{
  "type": "searchComplete",
  "message": "Real-time monitoring ended"
}
```

**Pong Response:**
```json
{
  "type": "pong",
  "timestamp": "2024-03-25T10:30:45.789Z"
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Monitoring Different Splunk Indexes

The `_internal` index is Splunk's default for internal logs. You can monitor other indexes:

### Common Splunk Indexes

| Index | Purpose |
|-------|---------|
| `_internal` | Splunk internal operations logs |
| `main` | Default index for external data |
| `_audit` | Audit and access logs |
| `_introspection` | System introspection data |
| `_telemetry` | Telemetry data |

### Monitor a Custom Index

1. In the Real-Time Monitoring panel
2. Change "Splunk Index" field from `_internal` to your index name
3. Click **🚀 Start Monitoring**

## Performance Considerations

### For Optimal Performance

- **WebSocket Connections**: Keep to under 100 concurrent connections
- **Log Limit**: Use 100-500 for most cases; increase for high-volume analysis
- **Polling Interval**: Default 1 second; adjust based on your needs
- **MongoDB**: Ensure sufficient storage for ingested logs

### Scaling

For production use:

1. **Load Balancing**: Use a reverse proxy (nginx) for multiple backend instances
2. **Database**: Use MongoDB Atlas for horizontal scaling
3. **Caching**: Implement Redis for frequently accessed logs
4. **Archival**: Archive old logs to reduce storage

## Troubleshooting

### WebSocket Connection Fails

**Problem**: Shows 🔴 Disconnected

**Solutions**:
1. Check backend is running: `node server.js`
2. Verify port 5001 is not blocked by firewall
3. Check browser console for error messages
4. Ensure CORS is enabled (default in DashLogix)

### No Logs Appearing

**Problem**: Real-time is connected but no logs show

**Solutions**:
1. Verify Splunk credentials in `.env`
2. Check the index exists: `| search index=_internal`
3. Verify logs are being generated: Check Splunk Web UI manually
4. Check backend logs for errors: Look at console output

### Splunk Connection Fails

**Problem**: "Failed to start real-time search"

**Solutions**:
1. Verify `SPLUNK_HOST` and `SPLUNK_PORT` in `.env`
2. Test Splunk connectivity:
   ```bash
   curl -k https://your-splunk-host:8089/services/auth/login \
     -d "username=admin&password=your-password"
   ```
3. Check Splunk is running and REST API is enabled
4. For HTTPS with self-signed certs, ensure `SPLUNK_SCHEME=https`

### MongoDB Connection Issues

**Problem**: "MongoDB is not connected"

**Solutions**:
1. Verify MongoDB is running
2. Check `MONGO_URI` format:
   - Local: `mongodb://localhost:27017/dashlogix`
   - Atlas: `mongodb+srv://user:password@cluster.mongodb.net/dashlogix`
3. For MongoDB Atlas:
   - Whitelist your IP in Network Access
   - Use correct username/password
   - Check cluster connection string

## Advanced Configuration

### Environment Variables

```env
# Splunk
SPLUNK_HOST              # Splunk server hostname/IP
SPLUNK_PORT              # Splunk REST API port (default: 8089)
SPLUNK_SCHEME            # https or http (default: https)
SPLUNK_USERNAME          # Splunk username
SPLUNK_PASSWORD          # Splunk password
SPLUNK_INDEX             # Default index (default: _internal)
SPLUNK_COLLECT_LIMIT     # Max logs per query (default: 200, max: 1000)
SPLUNK_EARLIEST          # Time window (-15m, -1h, -7d, etc.)

# Backend
PORT                     # Server port (default: 5001)
COLLECT_INTERVAL_MS      # Poll interval in ms (default: 5000)
NODE_ENV                 # development or production

# MongoDB
MONGO_URI                # MongoDB connection string

# Frontend
VITE_API_URL             # Backend API URL (proxy handled by Vite)
VITE_WS_PORT             # WebSocket port (usually same as backend PORT)
```

## Security Best Practices

1. **Never commit `.env`**: Add to `.gitignore`
2. **Use strong passwords**: Splunk admin password should be strong
3. **HTTPS validation**: In production, use proper SSL certificates
4. **MongoDB Authentication**: Always use credentials, even for local dev
5. **Firewall**: Restrict Splunk API access to necessary machines
6. **API Rate Limiting**: Implement rate limiting in production

## Performance Monitoring

### Check System Status

```bash
curl http://localhost:5001/api/health
```

Response includes MongoDB connection state and Splunk configuration.

### Monitor Sync Status

```bash
curl http://localhost:5001/api/sync-status
```

Shows:
- Last sync timestamp
- Number of logs fetched/ingested
- Active collection status
- Current time window
- Any errors

## Example Workflow

1. **Start backend** with `.env` configured
2. **Start frontend** with `npm run dev`
3. **Open browser** to http://localhost:3000
4. **Click** 🔴 Real-Time Monitoring button
5. **Verify** connection shows 🟢 Connected
6. **Configure** index (e.g., `_internal`) and limit
7. **Click** 🚀 Start Monitoring
8. **Watch** logs stream in real-time
9. **Analyze** logs in the responsive interface
10. **Stop** with ⛔ Stop Monitoring when done

## Support & Resources

- **Splunk Documentation**: https://docs.splunk.com
- **Splunk REST API**: https://docs.splunk.com/Documentation/Splunk/latest/RESTAPI/RESToverview
- **MongoDB Documentation**: https://docs.mongodb.com
- **WebSocket Standard**: https://tools.ietf.org/html/rfc6455

## Next Steps

- Customize log filtering and search queries
- Set up automated alerts for specific log patterns
- Export logs to external systems
- Integrate with your monitoring infrastructure
