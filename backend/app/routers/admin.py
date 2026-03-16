from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import date, timedelta
import random

from app.database import get_db
from app.models.models import Employer, Site, Employee, AuditLog, User
from app.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


async def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db), _: User = Depends(_require_admin)):
    employers   = (await db.execute(select(func.count()).select_from(Employer))).scalar()
    sites       = (await db.execute(select(func.count()).select_from(Site))).scalar()
    employees   = (await db.execute(select(func.count()).select_from(Employee))).scalar()
    audit_logs  = (await db.execute(select(func.count()).select_from(AuditLog))).scalar()
    users       = (await db.execute(select(func.count()).select_from(User))).scalar()
    return {
        "employers":  employers,
        "sites":      sites,
        "employees":  employees,
        "audit_logs": audit_logs,
        "users":      users,
    }


@router.post("/wipe")
async def wipe_data(db: AsyncSession = Depends(get_db), _: User = Depends(_require_admin)):
    """Truncate all operational data (employers, sites, employees, audit logs). Users are preserved."""
    await db.execute(text("TRUNCATE audit_logs, employees, sites, employers RESTART IDENTITY CASCADE"))
    await db.commit()
    return {"message": "All data wiped successfully."}


@router.post("/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db), _: User = Depends(_require_admin)):
    """Load demo data. Returns 409 if data already exists."""
    count = (await db.execute(select(func.count()).select_from(Employer))).scalar()
    if count > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Data already exists. Wipe first before seeding.")

    companies = [
        ("Gulf Construction LLC",  "CR-2024-001", "Ahmed Al-Rashid",   "ahmed@gulfconstruction.ae"),
        ("Horizon Engineering",    "CR-2024-002", "Sarah Mitchell",     "sarah@horizoneng.com"),
        ("Al Noor Facilities",     "CR-2024-003", "Mohammed Al-Farsi",  "m.alfarsi@alnoor.ae"),
    ]
    employers_created = []
    for name, reg, contact, email in companies:
        e = Employer(name=name, registration_number=reg, contact_name=contact, contact_email=email, contact_phone="+971-4-000-0000")
        db.add(e)
        employers_created.append(e)
    await db.flush()

    site_defs = [
        (employers_created[0].id, "Dubai Marina Site",      15),
        (employers_created[0].id, "Abu Dhabi HQ",           10),
        (employers_created[1].id, "Sharjah Industrial Zone", 20),
        (employers_created[2].id, "Al Quoz Workshop",        8),
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
        for _ in range(fill_count):
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
    return {"message": "Demo data loaded successfully."}
