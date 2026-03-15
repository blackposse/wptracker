from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from datetime import date, timedelta

from app.database import get_db
from app.models.models import Employer, Site, Employee
from app.schemas.schemas import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    today = date.today()

    total_employers = (await db.execute(select(func.count()).select_from(Employer))).scalar()
    total_sites = (await db.execute(select(func.count()).select_from(Site))).scalar()
    total_employees = (await db.execute(select(func.count()).select_from(Employee))).scalar()

    critical_threshold = today + timedelta(days=30)
    warning_threshold = today + timedelta(days=90)

    def any_expiry_in(threshold):
        return or_(
            and_(Employee.passport_expiry.isnot(None), Employee.passport_expiry <= threshold),
            and_(Employee.visa_stamp_expiry.isnot(None), Employee.visa_stamp_expiry <= threshold),
            and_(Employee.insurance_expiry.isnot(None), Employee.insurance_expiry <= threshold),
            and_(Employee.work_permit_fee_expiry.isnot(None), Employee.work_permit_fee_expiry <= threshold),
        )

    def any_expiry_between(lo, hi):
        def between(col):
            return and_(col.isnot(None), col > lo, col <= hi)
        return or_(
            between(Employee.passport_expiry),
            between(Employee.visa_stamp_expiry),
            between(Employee.insurance_expiry),
            between(Employee.work_permit_fee_expiry),
        )

    expired_count = (await db.execute(
        select(func.count()).select_from(Employee).where(any_expiry_in(today))
    )).scalar()

    critical_count = (await db.execute(
        select(func.count()).select_from(Employee).where(any_expiry_between(today, critical_threshold))
    )).scalar()

    warning_count = (await db.execute(
        select(func.count()).select_from(Employee).where(any_expiry_between(critical_threshold, warning_threshold))
    )).scalar()

    # Sites where used_slots >= total_quota_slots
    sites_result = await db.execute(select(Site))
    sites = sites_result.scalars().all()
    sites_at_capacity = 0
    for site in sites:
        used = (await db.execute(
            select(func.count()).where(Employee.site_id == site.id)
        )).scalar()
        if used >= site.total_quota_slots:
            sites_at_capacity += 1

    return DashboardStats(
        total_employers=total_employers,
        total_sites=total_sites,
        total_employees=total_employees,
        total_alerts_critical=critical_count,
        total_alerts_warning=warning_count,
        total_alerts_expired=expired_count,
        sites_at_capacity=sites_at_capacity,
    )
