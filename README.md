# Work Permit Tracker

A web application for managing expatriate employee compliance — tracking passport, visa stamp, insurance, and work permit fee expiry dates across multiple employers and sites.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Backend | FastAPI + SQLAlchemy (async) |
| Database | PostgreSQL 16 |
| Container | Docker + Docker Compose |

---

## Prerequisites

Make sure the following are installed before you begin:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Node.js 20+](https://nodejs.org/) (only needed for local dev mode)
- [Git](https://git-scm.com/)

---

## Option 1 — Run with Docker (Recommended)

This runs the full stack (frontend + backend + database) with a single command.

### 1. Clone the repository

```bash
git clone https://github.com/blackposse/wptracker.git
cd wptracker
```

### 2. Start all services

```bash
docker-compose up --build
```

> On the first run this will download base images and build containers. Subsequent starts are faster.

### 3. Open the app

| Service | URL |
|---|---|
| Frontend (Nginx) | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API Docs (Swagger) | http://localhost:8001/docs |

### 4. Stop the app

Press `Ctrl + C` in the terminal, then run:

```bash
docker-compose down
```

To also delete the database volume (wipes all data):

```bash
docker-compose down -v
```

---

## Option 2 — Run in Development Mode (Hot Reload)

Use this if you want live reload while editing frontend code.

### 1. Start the backend and database via Docker

```bash
docker-compose up db api
```

### 2. Install frontend dependencies

Open a new terminal:

```bash
npm install
```

### 3. Start the Vite dev server

```bash
npm run dev
```

### 4. Open the app

The terminal will show the local URL, typically:

```
http://localhost:5173
```

> If port 5173 is in use, Vite will try 5174, 5175, etc.

---

## First-Time Setup

The database tables are created automatically when the backend starts. No migrations need to be run manually.

To get started:

1. Go to the **Employers** tab and click **+ Add Employer**
2. Add at least one employer with a registration number
3. Under the employer, click **+ Add Site** and set a quota slot limit
4. Go to the **Employees** tab and click **+ Add Employee**
5. Select the employer and site, fill in expiry dates
6. The **Overview** dashboard will automatically show alerts

---

## Expiry Alert Thresholds

| Document | Expiring Soon | Warning |
|---|---|---|
| Passport | 30 days | 90 days |
| Visa Stamp | 30 days | 90 days |
| Insurance | 30 days | 90 days |
| Work Permit Fee | 15 days | 30 days |

---

## Project Structure

```
wptracker/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy database models
│   │   ├── routers/       # API route handlers
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic (expiry calculation)
│   │   ├── database.py    # DB engine and session setup
│   │   └── main.py        # FastAPI app entry point
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   └── App.jsx        # Main React application (Docker build)
│   ├── nginx.conf
│   └── Dockerfile
├── src/
│   └── App.jsx            # Main React application (dev server)
├── docker-compose.yml
└── package.json
```

---

## Environment Variables

The backend reads its database connection from the `DATABASE_URL` environment variable. The default is pre-configured in `docker-compose.yml`:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/workpermit
```

To use a different PostgreSQL instance, set this variable before running Docker Compose.

---

## Common Issues

**Port already in use**

If port 3000 or 8001 is occupied, edit `docker-compose.yml` and change the left-hand port numbers:

```yaml
ports:
  - "3001:80"   # change 3000 to any free port
```

**Database sequence conflict on restart**

If the API fails to start with a `duplicate key` error after a failed first run, connect to the database and clean up:

```bash
docker exec wptracker-main-db-1 psql -U postgres -d workpermit -c "DROP SEQUENCE IF EXISTS audit_logs_id_seq CASCADE;"
docker-compose restart api
```

**PowerShell does not support `&&`**

Run commands separately in PowerShell:

```powershell
docker-compose down
docker-compose up --build
```

---

## API Reference

Full interactive API documentation is available at **http://localhost:8001/docs** when the backend is running.

Key endpoints:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/employees/` | List all employees |
| POST | `/employees/` | Create an employee |
| PATCH | `/employees/{id}` | Update an employee |
| DELETE | `/employees/{id}` | Delete an employee |
| GET | `/employees/{id}/logs` | Get audit history |
| GET | `/alerts/expiring` | Get expiry alerts |
| GET | `/dashboard/stats` | Get dashboard summary |
| GET | `/employers/` | List employers |
| GET | `/sites/` | List sites |
