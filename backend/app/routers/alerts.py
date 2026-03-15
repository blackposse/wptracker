from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import date, timedelta

from app.database import get_db
from app.models.models import Employee, Site, Employer
from app.schemas.schemas import AlertsResponse, ExpiryAlert, ExpiryStatus
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/expiring", response_model=AlertsResponse)
async def get_expiring_alerts(
    days: int = Query(60, ge=1, le=365, description="Look-ahead window in days"),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    horizon = today + timedelta(days=days)

    q = (
        select(Employee, Site, Employer)
        .join(Site, Employee.site_id == Site.id)
        .join(Employer, Employee.employer_id == Employer.id)
        .where(
            or_(
                and_(Employee.passport_expiry.isnot(None),        Employee.passport_expiry <= horizon),
                and_(Employee.visa_stamp_expiry.isnot(None),      Employee.visa_stamp_expiry <= horizon),
                and_(Employee.insurance_expiry.isnot(None),       Employee.insurance_expiry <= horizon),
                and_(Employee.work_permit_fee_expiry.isnot(None), Employee.work_permit_fee_expiry <= horizon),
            )
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
            if detail and detail.status != ExpiryStatus.VALID:
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
