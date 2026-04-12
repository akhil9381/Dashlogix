# DashLogix Class Diagram

This project is mostly built with functional React components and Mongoose models rather than traditional ES6 classes, so the diagram below is a UML-style structural view of the main domain entities, service modules, and UI components.

```mermaid
classDiagram
direction LR

class DashLogixServer {
  +auth/login()
  +auth/register()
  +auth/me()
  +auth/profile()
  +collect()
  +search()
  +storedLogs()
  +stats()
  +alertRules()
  +alertEvents()
  +realtimeStart()
  +realtimeStop()
}

class QueryTranslator {
  +parseSimpleQuery(q)
  +buildTimeRangeFilter(earliest)
  +classifyLogLevel(message)
  +extractExactCause(message, level)
  +describeLogForUsers(message, level)
  +resolveSearchOptions(query)
}

class User {
  +name: String
  +email: String
  +passwordHash: String
  +role: String
  +avatarUrl: String
  +bio: String
  +lastLoginAt: Date
}

class Log {
  +time: String
  +host: String
  +source: String
  +log: String
  +level: String
  +exactCause: String
  +description: String
  +query: String
  +createdAt: Date
}

class AlertRule {
  +userId: ObjectId
  +name: String
  +queryText: String
  +metricType: String
  +threshold: Number
  +errorThreshold: Number
  +warningThreshold: Number
  +windowMinutes: Number
  +checkEveryMinutes: Number
  +cooldownMinutes: Number
  +emailTo: String
  +autoEmail: Boolean
  +enabled: Boolean
  +lastCheckedAt: Date
  +lastTriggeredAt: Date
  +lastTriggeredCount: Number
}

class AlertEvent {
  +userId: ObjectId
  +ruleId: ObjectId
  +ruleName: String
  +queryText: String
  +threshold: Number
  +matchedCount: Number
  +errorCount: Number
  +warningCount: Number
  +triggerReasons: String[]
  +windowMinutes: Number
  +emailSent: Boolean
  +emailTo: String
  +error: String
}

class SearchHistory {
  +userId: ObjectId
  +queryText: String
  +splQuery: String
  +mode: String
  +resultCount: Number
  +filters: Object
}

class UserActivity {
  +userId: ObjectId
  +type: String
  +page: String
  +details: Object
}

class AuthProvider {
  +token: String
  +user: User
  +loading: Boolean
  +login(email, password)
  +register(payload)
  +updateProfile(payload)
  +logout()
}

class App {
  +routes()
}

class ProtectedRoute {
  +guard(children)
}

class AppShell {
  +topNavigation()
  +sessionActions()
}

class DashboardPage {
  +refresh()
}

class SearchPage
class AlertsPage
class RealtimePage
class HistoryPage
class ProfilePage

class SyncStatus {
  +fetchStatus()
  +handleSyncNow()
}

class StatsCards
class DashboardCharts
class LogsTable
class FilterButtons

class SearchPanel {
  +runSearch()
}

class AlertManager {
  +loadData()
  +createRule()
  +toggleRule()
  +toggleAutoEmail()
  +runNow()
  +removeRule()
}

class RealtimeMonitor {
  +connectWebSocket()
  +startRealtime()
  +stopRealtime()
  +sendPing()
}

DashLogixServer ..> QueryTranslator : uses
DashLogixServer ..> User : manages auth/profile
DashLogixServer ..> Log : ingests/queries
DashLogixServer ..> AlertRule : evaluates rules
DashLogixServer ..> AlertEvent : records triggers
DashLogixServer ..> SearchHistory : stores searches
DashLogixServer ..> UserActivity : stores activity

User "1" --> "0..*" AlertRule : owns
User "1" --> "0..*" AlertEvent : receives
User "1" --> "0..*" SearchHistory : performs
User "1" --> "0..*" UserActivity : generates
AlertRule "1" --> "0..*" AlertEvent : produces
AlertRule ..> Log : evaluates against
SearchHistory ..> QueryTranslator : generated from

App --> AuthProvider : wraps
App --> AppShell : uses
App --> ProtectedRoute : uses
ProtectedRoute ..> AuthProvider : checks auth
AppShell ..> AuthProvider : reads session

App --> DashboardPage
App --> SearchPage
App --> AlertsPage
App --> RealtimePage
App --> HistoryPage
App --> ProfilePage

DashboardPage --> SyncStatus
DashboardPage --> StatsCards
DashboardPage --> DashboardCharts
DashboardPage --> FilterButtons
DashboardPage --> LogsTable

SearchPage --> SearchPanel
SearchPage --> LogsTable

AlertsPage --> AlertManager
RealtimePage --> RealtimeMonitor
ProfilePage ..> AuthProvider : updates user
HistoryPage ..> SearchHistory : displays
HistoryPage ..> UserActivity : displays

SearchPanel ..> DashLogixServer : GET /search
AlertManager ..> DashLogixServer : rules/events APIs
RealtimeMonitor ..> DashLogixServer : realtime APIs + WebSocket
SyncStatus ..> DashLogixServer : sync-status/collect APIs
```

## Source Basis

- Backend models: `dashlogix-backend/models/*.js`
- Backend orchestration and APIs: `dashlogix-backend/server.js`
- Query parsing utilities: `dashlogix-backend/utils/queryTranslator.js`
- Frontend routing and auth shell: `dashlogix-frontend/src/App.jsx`, `dashlogix-frontend/src/context/AuthContext.jsx`, `dashlogix-frontend/src/components/layout/AppShell.jsx`
- Main feature pages/components: `dashlogix-frontend/src/pages/*.jsx`, `dashlogix-frontend/src/components/*.jsx`
