from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from datetime import date, timedelta
from typing import List, Optional

from app.database import get_db
from app.models.models import Employee, Site, Employer, AuditLog
from app.schemas.schemas import (
    EmployeeCreate, EmployeeRead, EmployeeUpdate,
    AlertsResponse, ExpiryAlert, ExpiryStatus, AuditLogRead,
)
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS

router = APIRouter(prefix="/employees", tags=["Employees"])

# field_name -> (critical_days, warning_days)
FIELD_THRESHOLDS = {f[0]: (f[2], f[3]) for f in EXPIRY_FIELDS}


def _enrich(emp: Employee) -> EmployeeRead:
    data = EmployeeRead.model_validate(emp)
    data.passport_status        = calculate_expiry_status(emp.passport_expiry,        *FIELD_THRESHOLDS["passport_expiry"])
    data.visa_stamp_status      = calculate_expiry_status(emp.visa_stamp_expiry,      *FIELD_THRESHOLDS["visa_stamp_expiry"])
    data.insurance_status       = calculate_expiry_status(emp.insurance_expiry,       *FIELD_THRESHOLDS["insurance_expiry"])
    data.work_permit_fee_status = calculate_expiry_status(emp.work_permit_fee_expiry, *FIELD_THRESHOLDS["work_permit_fee_expiry"])
    return data


@router.post("/", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site).where(Site.id == payload.site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    count_result = await db.execute(
        select(func.count()).where(Employee.site_id == payload.site_id)
    )
    used_slots = count_result.scalar()

    if used_slots >= site.total_quota_slots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Quota Limit Reached",
                "message": (
                    f"Site '{site.site_name}' has reached its maximum quota of "
                    f"{site.total_quota_slots} employees. "
                    f"Cannot add a new employee until a slot is freed."
                ),
                "site_id": site.id,
                "total_quota": site.total_quota_slots,
                "used_slots": used_slots,
            },
        )

    data = payload.model_dump(exclude={"note"})
    emp = Employee(**data)
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return _enrich(emp)


@router.get("/", response_model=List[EmployeeRead])
async def list_employees(
    site_id: Optional[int] = None,
    employer_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(Employee)
    if site_id:
        q = q.where(Employee.site_id == site_id)
    if employer_id:
        q = q.where(Employee.employer_id == employer_id)
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    return [_enrich(e) for e in result.scalars().all()]


@router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _enrich(emp)


@router.get("/{employee_id}/logs", response_model=List[AuditLogRead])
async def get_employee_logs(employee_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.employee_id == employee_id)
        .order_by(AuditLog.changed_at.desc())
    )
    return result.scalars().all()


@router.patch("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: int, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    note = payload.note
    changes = payload.model_dump(exclude_unset=True, exclude={"note"})

    FIELD_LABELS = {
        "full_name": "Full Name",
        "nationality": "Nationality",
        "job_title": "Job Title",
        "passport_expiry": "Passport Expiry",
        "visa_stamp_expiry": "Visa Stamp Expiry",
        "insurance_expiry": "Insurance Expiry",
        "work_permit_fee_expiry": "Work Permit Fee Expiry",
    }

    # Collect audit entries before updating
    audit_entries = []
    for field, value in changes.items():
        old_raw = getattr(emp, field)
        old_val = str(old_raw) if old_raw is not None else None
        new_val = str(value) if value is not None else None
        if old_val != new_val:
            audit_entries.append((field, old_val, new_val))
        setattr(emp, field, value)

    # Commit employee data first — guaranteed to save
    await db.commit()
    await db.refresh(emp)

    # Attempt audit log creation separately — fails silently if table missing
    if audit_entries:
        try:
            for field, old_val, new_val in audit_entries:
                log = AuditLog(
                    employee_id=emp.id,
                    field_name=FIELD_LABELS.get(field, field),
                    old_value=old_val,
                    new_value=new_val,
                    note=note,
                )
                db.add(log)
            await db.commit()
        except Exception:
            await db.rollback()

    return _enrich(emp)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(emp)
    await db.commit()
