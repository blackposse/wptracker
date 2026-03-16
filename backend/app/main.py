from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from contextlib import asynccontextmanager
from datetime import date, timedelta
import secrets
import random
import os

from app.database import init_db, engine, AsyncSessionLocal
from app.models.models import Employer, Site, Employee, AuditLog, User
from app.routers import employees, employers, sites, alerts, dashboard, admin
from app.routers import auth as auth_router
from app.auth import hash_password
from sqlalchemy import select, func, text


async def seed_demo_data():
    """Seed realistic demo data for immediate use."""
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count()).select_from(Employer))).scalar()
        if count > 0:
            return  # Already seeded

        companies = [
            ("Gulf Construction LLC", "CR-2024-001", "Ahmed Al-Rashid", "ahmed@gulfconstruction.ae"),
            ("Horizon Engineering", "CR-2024-002", "Sarah Mitchell", "sarah@horizoneng.com"),
            ("Al Noor Facilities", "CR-2024-003", "Mohammed Al-Farsi", "m.alfarsi@alnoor.ae"),
        ]
        employers_created = []
        for name, reg, contact, email in companies:
            e = Employer(name=name, registration_number=reg, contact_name=contact, contact_email=email, contact_phone="+971-4-000-0000")
            db.add(e)
            employers_created.append(e)
        await db.flush()

        site_defs = [
            (employers_created[0].id, "Dubai Marina Site", 15),
            (employers_created[0].id, "Abu Dhabi HQ", 10),
            (employers_created[1].id, "Sharjah Industrial Zone", 20),
            (employers_created[2].id, "Al Quoz Workshop", 8),
        ]
        sites_created = []
        for emp_id, sname, quota in site_defs:
            s = Site(employer_id=emp_id, site_name=sname, total_quota_slots=quota)
            db.add(s)
            sites_created.append(s)
        await db.flush()

        today = date.today()
        nationalities = ["Indian", "Pakistani", "Filipino", "Bangladeshi", "Egyptian", "Nepalese"]
        titles = ["Civil Engineer", "Site Supervisor", "Electrician", "Welder", "Foreman", "Technician", "Driver"]

        emp_num = 1000
        for site in sites_created:
            fill_count = site.total_quota_slots - random.randint(1, 3)
            for i in range(fill_count):
                emp_num += 1
                emp = Employee(
                    employer_id=site.employer_id,
                    site_id=site.id,
                    full_name=f"Employee {emp_num}",
                    employee_number=f"EMP-{emp_num}",
                    nationality=random.choice(nationalities),
                    job_title=random.choice(titles),
                    passport_expiry=today + timedelta(days=random.randint(-10, 400)),
                    visa_stamp_expiry=today + timedelta(days=random.randint(5, 300)),
                    insurance_expiry=today + timedelta(days=random.randint(-5, 200)),
                    work_permit_fee_expiry=today + timedelta(days=random.randint(10, 365)),
                )
                db.add(emp)

        await db.commit()
        print("✅ Demo data seeded successfully.")


async def seed_admin_user():
    """Create default admin user if no users exist."""
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if existing:
            return
        try:
            admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
            admin = User(
                username="admin",
                hashed_password=hash_password(admin_password),
                is_active=True,
                is_admin=True,
            )
            db.add(admin)
            await db.commit()
            print("✅ Default admin user created (username: admin)")
        except Exception:
            await db.rollback()  # another worker already inserted it


async def run_migrations():
    """Apply any schema changes not handled by create_all (existing databases)."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS resigned BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS medical_expiry DATE"
            ))
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_number VARCHAR(100)"
            ))
            await conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_employees_passport_number ON employees (passport_number) WHERE passport_number IS NOT NULL"
            ))
            # Add changed_by to audit_logs if missing
            await conn.execute(text(
                "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changed_by VARCHAR(100)"
            ))
            # Add is_admin to users if missing
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            # Add is_active to employers if missing
            await conn.execute(text(
                "ALTER TABLE employers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            # Add work_permit_number to employees if missing
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_permit_number VARCHAR(100)"
            ))
            # Ensure the admin user has is_admin = true
            await conn.execute(text(
                "UPDATE users SET is_admin = TRUE WHERE username = 'admin'"
            ))
            # Fix audit_logs id sequence — always ensure default is set correctly
            await conn.execute(text("""
                DO $$
                BEGIN
                    CREATE SEQUENCE IF NOT EXISTS audit_logs_id_seq;
                    ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT nextval('audit_logs_id_seq');
                    ALTER SEQUENCE audit_logs_id_seq OWNED BY audit_logs.id;
                    PERFORM setval('audit_logs_id_seq', COALESCE((SELECT MAX(id) FROM audit_logs), 0) + 1, false);
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;
            """))
    except Exception as e:
        print(f"Migration note (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await run_migrations()
    await seed_admin_user()
    yield


# ── Docs access control ───────────────────────────────────
# Docs are disabled by default. Set DOCS_ENABLED=true and DOCS_PASSWORD
# in environment to enable them, protected by HTTP Basic Auth.
DOCS_ENABLED  = os.getenv("DOCS_ENABLED",  "false").lower() == "true"
DOCS_USERNAME = os.getenv("DOCS_USERNAME", "admin")
DOCS_PASSWORD = os.getenv("DOCS_PASSWORD", "")  # empty string = docs stay disabled

_docs_security = HTTPBasic(auto_error=False)

def _verify_docs(credentials: HTTPBasicCredentials = Depends(_docs_security)):
    ok = (
        credentials is not None
        and secrets.compare_digest(credentials.username.encode(), DOCS_USERNAME.encode())
        and secrets.compare_digest(credentials.password.encode(), DOCS_PASSWORD.encode())
    )
    if not ok:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


app = FastAPI(
    title="DocGuard",
    version="1.0.0",
    description="Expatriate compliance management — work permits, visa expirations, and site quotas.",
    lifespan=lifespan,
    # Disable the built-in docs/schema routes — we re-mount them below with auth
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(auth_router.router)
app.include_router(employers.router)
app.include_router(sites.router)
app.include_router(employees.router)
app.include_router(alerts.router)
app.include_router(dashboard.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Protected docs (only mounted when DOCS_ENABLED=true + DOCS_PASSWORD set) ──
if DOCS_ENABLED and DOCS_PASSWORD:
    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema(_: None = Depends(_verify_docs)):
        return app.openapi()

    @app.get("/docs", include_in_schema=False)
    async def swagger_ui(_: None = Depends(_verify_docs)):
        return get_swagger_ui_html(openapi_url="/openapi.json", title="API Docs")

    @app.get("/redoc", include_in_schema=False)
    async def redoc_ui(_: None = Depends(_verify_docs)):
        return get_redoc_html(openapi_url="/openapi.json", title="API Docs")
