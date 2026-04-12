# DashLogix Testing Guide

This project currently includes manual testing documentation, but it does not yet include an automated test suite in the repository.

Use this guide to document how DashLogix should be tested during development, demos, and submission reviews.

## Current Status

- Backend automated tests: not implemented yet
- Frontend automated tests: not implemented yet
- Manual API verification: supported
- Manual UI verification: supported

## Test Environment

Before testing, make sure the following services are available:

- MongoDB is running and reachable through `MONGO_URI`
- Splunk is reachable with valid credentials
- Backend is running on `http://localhost:5001`
- Frontend is running on the Vite dev server

## Basic Startup Checks

1. Start the backend from `dashlogix-backend`.
2. Start the frontend from `dashlogix-frontend`.
3. Open the application in the browser.
4. Confirm the backend health route responds.
5. Confirm the frontend loads without console or network errors.

## Manual Backend Test Cases

### 1. Health and Connectivity

- `GET /` returns a running message
- `GET /health` returns `ok: true`
- `GET /sync-status` returns sync state data
- When MongoDB is disconnected, protected data routes return `503`

### 2. Authentication

- Register with valid name, email, and password
- Reject registration when password is shorter than 6 characters
- Reject registration when email already exists
- Login succeeds with valid credentials
- Login fails with invalid credentials
- `GET /auth/me` returns current user for a valid token
- `GET /auth/me` returns `401` for a missing or invalid token
- `PATCH /auth/profile` updates allowed profile fields

### 3. Search and Query Translation

- `GET /query-to-spl?q=errors last 1h` returns a translated SPL query
- `GET /search` returns cached MongoDB results in non-live mode
- `GET /search` returns Splunk-backed results in live mode
- Search history is created for authenticated users
- Search result count matches returned logs
- `limit` is clamped into the supported range
- `live=1` switches mode correctly

### 4. Logs and Dashboard Data

- `GET /stored-logs` returns recent logs
- `GET /logs` returns recent stored logs
- `DELETE /logs` clears stored log data
- `GET /stats` returns total, error, warning, and info counts
- `GET /stats/charts` returns chart-ready severity and source data
- `GET /stats/timeseries` returns bucketed log counts
- `GET /dashboard/my-summary` returns authenticated user summary data

### 5. Alerts

- `GET /alerts/rules` returns only the logged-in user's rules
- `POST /alerts/rules` creates a rule with valid data
- `PATCH /alerts/rules/:id` updates rule status and thresholds
- `DELETE /alerts/rules/:id` removes a rule
- `POST /alerts/run-now/:id` evaluates a rule immediately
- `GET /alerts/events` returns recent alert events
- Alert routes reject unauthenticated users with `401`

### 6. Realtime Monitoring

- `POST /realtime-start` starts realtime polling
- `POST /realtime-stop` stops realtime polling
- `GET /realtime-status` returns current realtime state
- WebSocket clients receive `realtimeStarted`
- WebSocket clients receive `realtimeStopped`
- WebSocket clients receive `logEvent` payloads
- Sending invalid WebSocket JSON returns an error message

## Manual Frontend Test Cases

### 1. Routing and Navigation

- Public routes load correctly
- Protected routes redirect unauthenticated users to login
- Unknown routes show the not found page

### 2. Authentication UI

- User can register from the register page
- User can sign in from the login page
- Failed login shows an error message
- Auth token persists in local storage
- Refreshing the page restores session state when token is valid
- Logging out clears user state and token

### 3. Dashboard

- Dashboard loads logs, stats, charts, and time-series data
- Refresh button reloads dashboard data
- Error banner appears when API requests fail
- Severity filter changes visible rows in the logs table

### 4. Search Page

- Search input sends query to the backend
- Preset buttons populate the query field
- Live mode changes request behavior
- Max results value is sent with the request
- Search summary shows mode, count, and SPL query
- Search errors are shown to the user

### 5. Alerts Page

- Create alert form submits correctly
- Rules list updates after create, patch, and delete actions
- Enable/disable rule works
- Enable/disable auto email works
- Run now action shows success or failure notice
- Event list displays recent alert activity

### 6. Realtime Monitor

- Start Monitoring opens realtime session
- Stop Monitoring closes realtime session
- Connection status changes from disconnected to connected
- Incoming log items render in the live log list
- Ping works when the WebSocket is connected
- Realtime errors are displayed in the UI

## Recommended Automated Test Coverage

When automated testing is added, these should be the first priorities:

- Unit tests for `queryTranslator.js`
- API integration tests for auth, search, stats, alerts, and realtime endpoints
- Frontend component tests for auth flow, protected routes, search panel, dashboard, and realtime monitor
- End-to-end smoke tests for login, search, dashboard load, and alert creation

## Suggested Tools for Future Automation

- Backend: `Jest` or `Vitest` with `supertest`
- Frontend: `Vitest` with React Testing Library
- End-to-end: `Playwright`

## Example Manual API Checks

```bash
# Health
curl http://localhost:5001/health

# Query translation
curl "http://localhost:5001/query-to-spl?q=errors%20last%201h"

# Stored logs
curl "http://localhost:5001/stored-logs?limit=20"

# Stats
curl http://localhost:5001/stats

# Realtime status
curl http://localhost:5001/realtime-status
```

## Documentation Note

If this project is submitted or demonstrated, describe testing as:

"DashLogix currently supports structured manual testing for backend APIs, authentication, search, alerts, dashboard analytics, and realtime monitoring. The next improvement is adding automated unit, integration, and end-to-end tests."
