from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import date, timedelta
from typing import Optional

from app.database import get_db
from app.models.models import Employee, Site, Employer, User
from app.schemas.schemas import AlertsResponse, ExpiryAlert, ExpiryStatus, MissingDocAlert, MissingDocResponse
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS
from app.auth import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/expiring", response_model=AlertsResponse)
async def get_expiring_alerts(
    days: int = Query(60, ge=1, le=365, description="Look-ahead window in days"),
    employer_id: Optional[int] = Query(None, description="When set, return all employees for this employer regardless of expiry window"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    horizon = today + timedelta(days=days)

    q = (
        select(Employee, Site, Employer)
        .join(Site, Employee.site_id == Site.id)
        .join(Employer, Employee.employer_id == Employer.id)
        .where(Employer.is_active == True)
    )

    if employer_id is not None:
        # Show all employees for this employer (including those with valid docs)
        q = q.where(Employee.employer_id == employer_id)
    else:
        # Default: only employees with at least one document expiring within the window
        q = q.where(
            or_(
                and_(Employee.passport_expiry.isnot(None),        Employee.passport_expiry <= horizon),
                and_(Employee.visa_stamp_expiry.isnot(None),      Employee.visa_stamp_expiry <= horizon),
                and_(Employee.insurance_expiry.isnot(None),       Employee.insurance_expiry <= horizon),
                and_(Employee.work_permit_fee_expiry.isnot(None), Employee.work_permit_fee_expiry <= horizon),
                and_(Employee.medical_expiry.isnot(None),         Employee.medical_expiry <= horizon),
            )
        )

    rows = (await db.execute(q)).all()

    alerts: list[ExpiryAlert] = []
    for emp, site, employer in rows:
        for field_name, label, critical_days, warning_days in EXPIRY_FIELDS:
            expiry_date = getattr(emp, field_name)
            if expiry_date is None:
                continue
            detail = calculate_expiry_status(expiry_date, critical_days=critical_days, warning_days=warning_days)
            if detail and (employer_id is not None or detail.status != ExpiryStatus.VALID):
                alerts.append(
                    ExpiryAlert(
                        employee_id=emp.id,
                        employee_number=emp.employee_number,
                        full_name=emp.full_name,
                        employer_name=employer.name,
                        site_name=site.site_name,
                        expiry_type=label,
                        expiry_date=expiry_date,
                        days_remaining=detail.days_remaining,
                        status=detail.status,
                    )
                )

    alerts.sort(key=lambda a: a.days_remaining)

    return AlertsResponse(
        total=len(alerts),
        critical=sum(1 for a in alerts if a.status == ExpiryStatus.CRITICAL),
        warning=sum(1 for a in alerts if a.status == ExpiryStatus.WARNING),
        expired=sum(1 for a in alerts if a.status == ExpiryStatus.EXPIRED),
        alerts=alerts,
    )


# Field name → display label mapping for missing-doc alerts
_MISSING_FIELDS = [
    ("passport_expiry",        "Passport"),
    ("visa_stamp_expiry",      "Visa Stamp"),
    ("insurance_expiry",       "Insurance"),
    ("work_permit_fee_expiry", "Work Permit Fee"),
    ("medical_expiry",         "Medical"),
]


@router.get("/missing", response_model=MissingDocResponse)
async def get_missing_alerts(
    employer_id: Optional[int] = Query(None, description="Filter by employer"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return employees that have at least one expiry date not set."""
    q = (
        select(Employee, Site, Employer)
        .join(Site, Employee.site_id == Site.id)
        .join(Employer, Employee.employer_id == Employer.id)
        .where(Employer.is_active == True)
        .where(
            or_(
                Employee.passport_expiry.is_(None),
                Employee.visa_stamp_expiry.is_(None),
                Employee.insurance_expiry.is_(None),
                Employee.work_permit_fee_expiry.is_(None),
                Employee.medical_expiry.is_(None),
            )
        )
    )
    if employer_id is not None:
        q = q.where(Employee.employer_id == employer_id)

    rows = (await db.execute(q)).all()

    result: list[MissingDocAlert] = []
    for emp, site, employer in rows:
        missing = [label for field, label in _MISSING_FIELDS if getattr(emp, field) is None]
        result.append(MissingDocAlert(
            employee_id=emp.id,
            employee_number=emp.employee_number,
            full_name=emp.full_name,
            employer_name=employer.name,
            site_name=site.site_name,
            missing_fields=missing,
        ))

    result.sort(key=lambda r: len(r.missing_fields), reverse=True)
    return MissingDocResponse(total=len(result), alerts=result)
