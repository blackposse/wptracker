from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, case
from datetime import date, timedelta

from app.database import get_db
from app.models.models import Employer, Site, Employee, User, QuotaSlot
from app.schemas.schemas import DashboardStats
from app.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()

    total_employers = (await db.execute(select(func.count()).select_from(Employer).where(Employer.is_active == True))).scalar()
    total_sites = (await db.execute(
        select(func.count()).select_from(Site).join(Employer, Site.employer_id == Employer.id).where(Employer.is_active == True)
    )).scalar()
    total_employees = (await db.execute(
        select(func.count()).select_from(Employee).join(Employer, Employee.employer_id == Employer.id).where(Employer.is_active == True).where(Employee.resigned == False)
    )).scalar()

    critical_threshold = today + timedelta(days=30)
    warning_threshold = today + timedelta(days=90)

    def active_employee_base():
        return select(func.count()).select_from(Employee).join(Employer, Employee.employer_id == Employer.id).where(Employer.is_active == True).where(Employee.resigned == False)

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
        active_employee_base().where(any_expiry_in(today))
    )).scalar()

    critical_count = (await db.execute(
        active_employee_base().where(any_expiry_between(today, critical_threshold))
    )).scalar()

    warning_count = (await db.execute(
        active_employee_base().where(any_expiry_between(critical_threshold, warning_threshold))
    )).scalar()

    # Sites where used_slots >= total_quota_slots (only active employer sites)
    sites_result = await db.execute(
        select(Site).join(Employer, Site.employer_id == Employer.id).where(Employer.is_active == True)
    )
    sites = sites_result.scalars().all()
    sites_at_capacity = 0
    for site in sites:
        used = (await db.execute(
            select(func.count()).where(Employee.site_id == site.id).where(Employee.resigned == False)
        )).scalar()
        if used >= site.total_quota_slots:
            sites_at_capacity += 1

    missing_docs_count = (await db.execute(
        active_employee_base().where(
            or_(
                Employee.passport_expiry.is_(None),
                Employee.visa_stamp_expiry.is_(None),
                Employee.insurance_expiry.is_(None),
                Employee.work_permit_fee_expiry.is_(None),
                Employee.medical_expiry.is_(None),
            )
        )
    )).scalar()

    quota_expired_count = (await db.execute(
        select(func.count()).select_from(Employee)
        .join(Employer, Employee.employer_id == Employer.id)
        .join(QuotaSlot, Employee.quota_slot_id == QuotaSlot.id)
        .where(Employer.is_active == True)
        .where(Employee.resigned == False)
        .where(QuotaSlot.expiry_date.isnot(None))
        .where(QuotaSlot.expiry_date < today)
    )).scalar()

    quota_expiring_count = (await db.execute(
        select(func.count()).select_from(Employee)
        .join(Employer, Employee.employer_id == Employer.id)
        .join(QuotaSlot, Employee.quota_slot_id == QuotaSlot.id)
        .where(Employer.is_active == True)
        .where(Employee.resigned == False)
        .where(QuotaSlot.expiry_date.isnot(None))
        .where(QuotaSlot.expiry_date >= today)
        .where(QuotaSlot.expiry_date <= critical_threshold)
    )).scalar()

    return DashboardStats(
        total_employers=total_employers,
        total_sites=total_sites,
        total_employees=total_employees,
        total_alerts_critical=critical_count,
        total_alerts_warning=warning_count,
        total_alerts_expired=expired_count,
        sites_at_capacity=sites_at_capacity,
        total_missing_docs=missing_docs_count,
        total_quota_slots_expired=quota_expired_count,
        total_quota_slots_expiring=quota_expiring_count,
    )
