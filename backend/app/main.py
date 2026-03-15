from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import date, timedelta
import random

from app.database import init_db, AsyncSessionLocal
from app.models.models import Employer, Site, Employee, AuditLog
from app.routers import employees, employers, sites, alerts, dashboard
from sqlalchemy import select, func


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_demo_data()
    yield


app = FastAPI(
    title="Work Permit & Expiry Tracker",
    version="1.0.0",
    description="Manage expatriate work permits, visa expirations, and site quotas.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employers.router)
app.include_router(sites.router)
app.include_router(employees.router)
app.include_router(alerts.router)
app.include_router(dashboard.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
