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
from app.models.models import Employer, Site, Employee, AuditLog, User, QuotaSlot
from app.routers import employees, employers, sites, alerts, dashboard, admin, quota_slots
from app.routers import auth as auth_router
from app.auth import hash_password
from sqlalchemy import select, func, text


async def seed_demo_data():
    """Seed realistic demo data for immediate use."""
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count()).select_from(Employer))).scalar()
        if count > 0:
            return  # Already seeded

        # ── Employers ────────────────────────────────────────
        companies = [
            ("Gulf Construction LLC",  "CR-2024-001", "Ahmed Al-Rashid",   "ahmed@gulfconstruction.ae",  "+971-4-123-4567"),
            ("Horizon Engineering",    "CR-2024-002", "Sarah Mitchell",     "sarah@horizoneng.com",       "+971-4-234-5678"),
            ("Al Noor Facilities",     "CR-2024-003", "Mohammed Al-Farsi",  "m.alfarsi@alnoor.ae",        "+971-4-345-6789"),
            ("Prime Steel Works",      "CR-2024-004", "Rajan Pillai",       "rajan@primesteelworks.ae",   "+971-4-456-7890"),
        ]
        employers_created = []
        for name, reg, contact, email, phone in companies:
            e = Employer(name=name, registration_number=reg, contact_name=contact,
                         contact_email=email, contact_phone=phone)
            db.add(e)
            employers_created.append(e)
        await db.flush()

        # ── Sites ────────────────────────────────────────────
        site_defs = [
            (employers_created[0].id, "Dubai Marina Site",      12),
            (employers_created[0].id, "Abu Dhabi HQ",            8),
            (employers_created[0].id, "Jebel Ali Depot",         6),
            (employers_created[1].id, "Sharjah Industrial Zone", 15),
            (employers_created[1].id, "Ajman Office",             5),
            (employers_created[2].id, "Al Quoz Workshop",        10),
            (employers_created[2].id, "Deira Branch",             7),
            (employers_created[3].id, "Mussafah Steel Yard",     14),
            (employers_created[3].id, "Dubai Investments Park",   9),
        ]
        sites_created = []
        for emp_id, sname, quota in site_defs:
            s = Site(employer_id=emp_id, site_name=sname, total_quota_slots=quota)
            db.add(s)
            sites_created.append(s)
        await db.flush()

        # ── Reference data ───────────────────────────────────
        today = date.today()

        FIRST_NAMES = [
            "Rahul", "Mohammed", "Suresh", "Ravi", "Anwar", "Jose", "Carlos", "Sanjay",
            "Ali", "Pradeep", "Ramesh", "Vijay", "Arjun", "Hassan", "Omar", "Deepak",
            "Tariq", "Nikhil", "Faisal", "Sherif", "Biju", "Manoj", "Salim", "Rajesh",
            "Naresh", "Harish", "Ganesh", "Prakash", "Imran", "Khalid",
        ]
        LAST_NAMES = [
            "Kumar", "Khan", "Sharma", "Patel", "Singh", "Ali", "Ahmed", "Nair",
            "Reddy", "Rao", "Fernandez", "Santos", "Hussain", "Hassan", "Malik",
            "Gupta", "Verma", "Joshi", "Pillai", "Menon", "Thomas", "George",
            "Mathew", "Philip", "Joseph", "Ibrahim", "Saleh", "Qureshi", "Ansari", "Sheikh",
        ]
        NATIONALITIES = [
            "Indian", "Pakistani", "Filipino", "Bangladeshi", "Egyptian",
            "Nepalese", "Sri Lankan", "Indonesian", "Yemeni", "Ethiopian",
        ]
        TITLES = [
            "Civil Engineer", "Site Supervisor", "Electrician", "Welder",
            "Foreman", "Technician", "Driver", "Mason", "Carpenter",
            "Plumber", "Steel Fixer", "Safety Officer", "Helper", "Crane Operator",
        ]

        slot_counter = 10000
        emp_num      = 2000
        passport_num = 50000
        wp_num       = 30000

        for site in sites_created:
            # ── Create quota slots for every slot in this site ──
            slots_for_site = []
            for slot_idx in range(site.total_quota_slots):
                slot_counter += 1
                # Some slots expire soon, some far away, a few already expired
                slot_days = random.choice([
                    random.randint(-30, -1),    # ~10% expired
                    random.randint(1,  60),     # ~20% critical/warning
                    random.randint(61, 365),    # ~40% valid
                    random.randint(366, 730),   # ~30% long validity
                ])
                qs = QuotaSlot(
                    site_id=site.id,
                    slot_number=f"QS{slot_counter:08d}",
                    expiry_date=today + timedelta(days=slot_days),
                )
                db.add(qs)
                slots_for_site.append(qs)
            await db.flush()

            # ── Fill most slots with employees (leave 1-2 vacant) ──
            vacant = random.randint(1, min(2, site.total_quota_slots))
            fill_count = site.total_quota_slots - vacant
            random.shuffle(slots_for_site)

            for i in range(fill_count):
                emp_num     += 1
                passport_num += 1
                wp_num       += 1
                slot = slots_for_site[i]

                name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                nat  = random.choice(NATIONALITIES)

                # Spread expiry dates realistically:
                # passport: mostly valid but a few expired/expiring
                pp_days  = random.choice([
                    random.randint(-20,  0),   # expired
                    random.randint(1,   30),   # critical
                    random.randint(31,  90),   # warning
                    random.randint(91, 730),   # valid
                    random.randint(91, 730),   # valid (weighted)
                    random.randint(91, 730),   # valid (weighted)
                ])
                vs_days  = random.choice([
                    random.randint(-10,  0),
                    random.randint(1,   30),
                    random.randint(31, 365),
                    random.randint(31, 365),
                ])
                ins_days = random.choice([
                    random.randint(-15,  0),
                    random.randint(1,   60),
                    random.randint(61, 365),
                    random.randint(61, 365),
                ])
                wpf_days = random.choice([
                    random.randint(-5,   0),
                    random.randint(1,   20),
                    random.randint(21, 180),
                    random.randint(21, 180),
                ])
                med_days = random.choice([
                    random.randint(-30,  0),
                    random.randint(1,   60),
                    random.randint(61, 365),
                    random.randint(61, 365),
                    random.randint(61, 365),
                ])

                # ~8% of employees are resigned
                is_resigned = random.random() < 0.08

                emp = Employee(
                    employer_id=site.employer_id,
                    site_id=site.id,
                    quota_slot_id=slot.id,
                    full_name=name,
                    employee_number=f"EMP-{emp_num}",
                    passport_number=f"P{passport_num:07d}",
                    work_permit_number=f"WP-{today.year}-{wp_num:05d}",
                    nationality=nat,
                    job_title=random.choice(TITLES),
                    passport_expiry=today + timedelta(days=pp_days),
                    visa_stamp_expiry=today + timedelta(days=vs_days),
                    insurance_expiry=today + timedelta(days=ins_days),
                    work_permit_fee_expiry=today + timedelta(days=wpf_days),
                    medical_expiry=today + timedelta(days=med_days),
                    resigned=is_resigned,
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
            # Create quota_slots table if missing
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS quota_slots (
                    id SERIAL PRIMARY KEY,
                    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
                    slot_number VARCHAR(100) UNIQUE NOT NULL,
                    expiry_date DATE
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_quota_slots_site_id ON quota_slots (site_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_quota_slots_slot_number ON quota_slots (slot_number)"
            ))
            # Add quota_slot_id to employees if missing
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS quota_slot_id INTEGER REFERENCES quota_slots(id) ON DELETE SET NULL"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_employees_quota_slot_id ON employees (quota_slot_id)"
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
app.include_router(quota_slots.router)


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
