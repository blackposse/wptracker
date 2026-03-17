from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import date, timedelta
from typing import Optional

from app.database import get_db
from app.models.models import Employee, Site, Employer, User, QuotaSlot
from app.schemas.schemas import AlertsResponse, ExpiryAlert, ExpiryStatus, MissingDocAlert, MissingDocResponse
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS
from app.auth import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])

# doc_type slug → (field_name, label, critical_days, warning_days)
_DOC_TYPE_MAP = {f[0].replace("_expiry", ""): f for f in EXPIRY_FIELDS}
# e.g. "passport" → ("passport_expiry", "Passport", 30, 90)


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
        select(Employee, Site, Employer, QuotaSlot)
        .join(Site, Employee.site_id == Site.id)
        .join(Employer, Employee.employer_id == Employer.id)
        .outerjoin(QuotaSlot, Employee.quota_slot_id == QuotaSlot.id)
        .where(Employer.is_active == True)
        .where(Employee.resigned == False)
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
                and_(QuotaSlot.expiry_date.isnot(None),           QuotaSlot.expiry_date <= horizon),
            )
        )

    rows = (await db.execute(q)).all()

    alerts: list[ExpiryAlert] = []
    for emp, site, employer, slot in rows:
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
        # Quota slot expiry
        if slot and slot.expiry_date:
            detail = calculate_expiry_status(slot.expiry_date, critical_days=30, warning_days=90)
            if detail and (employer_id is not None or detail.status != ExpiryStatus.VALID):
                alerts.append(
                    ExpiryAlert(
                        employee_id=emp.id,
                        employee_number=emp.employee_number,
                        full_name=emp.full_name,
                        employer_name=employer.name,
                        site_name=site.site_name,
                        expiry_type="Quota Slot",
                        expiry_date=slot.expiry_date,
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


@router.get("/expiry-by-type", response_model=AlertsResponse)
async def get_expiry_by_type(
    employer_id: Optional[int] = Query(None),
    doc_type: str = Query("all", description="all|passport|visa_stamp|insurance|work_permit_fee|medical"),
    date_from: Optional[date] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[date] = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return expiry alerts filtered by document type and explicit date range."""
    today = date.today()
    d_from = date_from or today
    d_to   = date_to   or (today + timedelta(days=365))

    # Determine which fields to include
    if doc_type == "all":
        fields = list(EXPIRY_FIELDS)
    elif doc_type in _DOC_TYPE_MAP:
        fields = [_DOC_TYPE_MAP[doc_type]]
    else:
        fields = list(EXPIRY_FIELDS)

    # Build OR conditions so we only fetch employees that match at least one field
    conditions = [
        and_(
            getattr(Employee, field_name).isnot(None),
            getattr(Employee, field_name) >= d_from,
            getattr(Employee, field_name) <= d_to,
        )
        for field_name, *_ in fields
    ]

    # Handle quota_slot as a special doc_type
    if doc_type == "quota_slot":
        qs_q = (
            select(Employee, Site, Employer, QuotaSlot)
            .join(Site, Employee.site_id == Site.id)
            .join(Employer, Employee.employer_id == Employer.id)
            .join(QuotaSlot, Employee.quota_slot_id == QuotaSlot.id)
            .where(Employer.is_active == True)
            .where(Employee.resigned == False)
            .where(QuotaSlot.expiry_date.isnot(None))
            .where(QuotaSlot.expiry_date >= d_from)
            .where(QuotaSlot.expiry_date <= d_to)
        )
        if employer_id is not None:
            qs_q = qs_q.where(Employee.employer_id == employer_id)
        qs_rows = (await db.execute(qs_q)).all()
        alerts: list[ExpiryAlert] = []
        for emp, site, employer, slot in qs_rows:
            detail = calculate_expiry_status(slot.expiry_date, critical_days=30, warning_days=90)
            if detail:
                alerts.append(ExpiryAlert(
                    employee_id=emp.id,
                    employee_number=emp.employee_number,
                    full_name=emp.full_name,
                    employer_name=employer.name,
                    site_name=site.site_name,
                    expiry_type="Quota Slot",
                    expiry_date=slot.expiry_date,
                    days_remaining=detail.days_remaining,
                    status=detail.status,
                ))
        alerts.sort(key=lambda a: a.expiry_date)
        return AlertsResponse(
            total=len(alerts),
            critical=sum(1 for a in alerts if a.status == ExpiryStatus.CRITICAL),
            warning=sum(1 for a in alerts if a.status == ExpiryStatus.WARNING),
            expired=sum(1 for a in alerts if a.status == ExpiryStatus.EXPIRED),
            alerts=alerts,
        )

    q = (
        select(Employee, Site, Employer)
        .join(Site, Employee.site_id == Site.id)
        .join(Employer, Employee.employer_id == Employer.id)
        .where(Employer.is_active == True)
        .where(Employee.resigned == False)
        .where(or_(*conditions))
    )
    if employer_id is not None:
        q = q.where(Employee.employer_id == employer_id)

    rows = (await db.execute(q)).all()

    alerts: list[ExpiryAlert] = []
    for emp, site, employer in rows:
        for field_name, label, critical_days, warning_days in fields:
            expiry_date = getattr(emp, field_name)
            if expiry_date is None or not (d_from <= expiry_date <= d_to):
                continue
            detail = calculate_expiry_status(expiry_date, critical_days=critical_days, warning_days=warning_days)
            if detail:
                alerts.append(ExpiryAlert(
                    employee_id=emp.id,
                    employee_number=emp.employee_number,
                    full_name=emp.full_name,
                    employer_name=employer.name,
                    site_name=site.site_name,
                    expiry_type=label,
                    expiry_date=expiry_date,
                    days_remaining=detail.days_remaining,
                    status=detail.status,
                ))

    alerts.sort(key=lambda a: a.expiry_date)

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
        .where(Employee.resigned == False)
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
