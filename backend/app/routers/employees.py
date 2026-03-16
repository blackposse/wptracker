from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from datetime import date, timedelta
from typing import List, Optional
import csv
import io

from app.database import get_db
from app.models.models import Employee, Site, Employer, AuditLog, User
from app.schemas.schemas import (
    EmployeeCreate, EmployeeRead, EmployeeUpdate,
    AlertsResponse, ExpiryAlert, ExpiryStatus, AuditLogRead,
    BulkUpdateResult, BulkCreateResult,
)
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS
from app.auth import get_current_user

router = APIRouter(prefix="/employees", tags=["Employees"])

# field_name -> (critical_days, warning_days)
FIELD_THRESHOLDS = {f[0]: (f[2], f[3]) for f in EXPIRY_FIELDS}


def _enrich(emp: Employee) -> EmployeeRead:
    data = EmployeeRead.model_validate(emp)
    data.passport_status        = calculate_expiry_status(emp.passport_expiry,        *FIELD_THRESHOLDS["passport_expiry"])
    data.visa_stamp_status      = calculate_expiry_status(emp.visa_stamp_expiry,      *FIELD_THRESHOLDS["visa_stamp_expiry"])
    data.insurance_status       = calculate_expiry_status(emp.insurance_expiry,       *FIELD_THRESHOLDS["insurance_expiry"])
    data.work_permit_fee_status = calculate_expiry_status(emp.work_permit_fee_expiry, *FIELD_THRESHOLDS["work_permit_fee_expiry"])
    data.medical_status         = calculate_expiry_status(emp.medical_expiry,         *FIELD_THRESHOLDS["medical_expiry"])
    return data


@router.post("/", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
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

    if payload.passport_number:
        dup = (await db.execute(select(Employee).where(Employee.passport_number == payload.passport_number))).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail=f"Passport number '{payload.passport_number}' already exists (Employee: {dup.full_name})")

    # Auto-generate employee number if not provided
    if not payload.employee_number:
        max_result = await db.execute(select(func.max(Employee.id)))
        max_id = max_result.scalar() or 0
        payload.employee_number = f"EMP-{100 + max_id}"
        # Ensure uniqueness in case of races
        while (await db.execute(select(Employee).where(Employee.employee_number == payload.employee_number))).scalar_one_or_none():
            max_id += 1
            payload.employee_number = f"EMP-{100 + max_id}"

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
    current_user: User = Depends(get_current_user),
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
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _enrich(emp)


@router.get("/{employee_id}/logs", response_model=List[AuditLogRead])
async def get_employee_logs(employee_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.employee_id == employee_id)
        .order_by(AuditLog.changed_at.desc())
    )
    return result.scalars().all()


@router.patch("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: int, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    note = payload.note
    changes = payload.model_dump(exclude_unset=True, exclude={"note"})

    FIELD_LABELS = {
        "full_name": "Full Name",
        "passport_number": "Passport Number",
        "work_permit_number": "Work Permit Number",
        "nationality": "Nationality",
        "job_title": "Job Title",
        "passport_expiry": "Passport Expiry",
        "visa_stamp_expiry": "Visa Stamp Expiry",
        "insurance_expiry": "Insurance Expiry",
        "work_permit_fee_expiry": "Work Permit Fee Expiry",
        "medical_expiry": "Medical Expiry",
        "resigned": "Resigned",
    }

    # Treat empty string passport_number as None
    if "passport_number" in changes and changes["passport_number"] == "":
        changes["passport_number"] = None

    # Check passport number uniqueness on update
    if "passport_number" in changes and changes["passport_number"]:
        dup = (await db.execute(
            select(Employee).where(Employee.passport_number == changes["passport_number"], Employee.id != employee_id)
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail=f"Passport number '{changes['passport_number']}' already exists (Employee: {dup.full_name})")

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
                    changed_by=current_user.username,
                )
                db.add(log)
            await db.commit()
        except Exception:
            await db.rollback()

    return _enrich(emp)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(emp)
    await db.commit()


DATE_FIELDS = {"passport_expiry", "visa_stamp_expiry", "insurance_expiry", "work_permit_fee_expiry", "medical_expiry"}
UPDATABLE_FIELDS = {"full_name", "passport_number", "work_permit_number", "nationality", "job_title"} | DATE_FIELDS

FIELD_LABELS = {
    "full_name": "Full Name",
    "passport_number": "Passport Number",
    "work_permit_number": "Work Permit Number",
    "nationality": "Nationality",
    "job_title": "Job Title",
    "passport_expiry": "Passport Expiry",
    "visa_stamp_expiry": "Visa Stamp Expiry",
    "insurance_expiry": "Insurance Expiry",
    "work_permit_fee_expiry": "Work Permit Fee Expiry",
    "medical_expiry": "Medical Expiry",
}


@router.post("/bulk-update", response_model=BulkUpdateResult)
async def bulk_update_employees(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Excel
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "employee_number" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must have an 'employee_number' column")

    updated, not_found, errors = 0, [], []

    for i, row in enumerate(reader, start=2):
        emp_num = (row.get("employee_number") or "").strip()
        if not emp_num:
            continue

        result = await db.execute(select(Employee).where(Employee.employee_number == emp_num))
        emp = result.scalar_one_or_none()
        if not emp:
            not_found.append(emp_num)
            continue

        changes = []
        for field in UPDATABLE_FIELDS:
            raw = row.get(field, "").strip()
            if raw == "":
                continue
            try:
                if field in DATE_FIELDS:
                    value = date.fromisoformat(raw) if raw.lower() != "null" else None
                else:
                    value = raw if raw.lower() != "null" else None
                old_val = str(getattr(emp, field)) if getattr(emp, field) is not None else None
                new_val = str(value) if value is not None else None
                if old_val != new_val:
                    changes.append((field, old_val, new_val))
                    setattr(emp, field, value)
            except ValueError:
                errors.append(f"Row {i} ({emp_num}): invalid value '{raw}' for '{field}'")

        if changes:
            await db.commit()
            await db.refresh(emp)
            try:
                for field, old_val, new_val in changes:
                    db.add(AuditLog(
                        employee_id=emp.id,
                        field_name=FIELD_LABELS.get(field, field),
                        old_value=old_val,
                        new_value=new_val,
                        note="Bulk CSV import",
                        changed_by=current_user.username,
                    ))
                await db.commit()
            except Exception:
                await db.rollback()
            updated += 1

    return BulkUpdateResult(updated=updated, not_found=not_found, errors=errors)


@router.post("/bulk-create", response_model=BulkCreateResult)
async def bulk_create_employees(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")

    reader = csv.DictReader(io.StringIO(text))
    required = {"full_name", "employer_name", "site_name"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=400, detail="CSV must have columns: full_name, employer_name, site_name")

    created, skipped, errors = 0, 0, []

    for i, row in enumerate(reader, start=2):
        full_name = (row.get("full_name") or "").strip()
        if not full_name:
            continue

        employer_name = (row.get("employer_name") or "").strip()
        site_name     = (row.get("site_name") or "").strip()

        # Look up employer (case-insensitive)
        employer = (await db.execute(
            select(Employer).where(func.lower(Employer.name) == employer_name.lower())
        )).scalar_one_or_none()
        if not employer:
            errors.append(f"Row {i} ({full_name}): employer '{employer_name}' not found")
            continue

        # Look up site within that employer (case-insensitive)
        site = (await db.execute(
            select(Site).where(
                func.lower(Site.site_name) == site_name.lower(),
                Site.employer_id == employer.id,
            )
        )).scalar_one_or_none()
        if not site:
            errors.append(f"Row {i} ({full_name}): site '{site_name}' not found under '{employer_name}'")
            continue

        # Quota check
        used = (await db.execute(select(func.count()).where(Employee.site_id == site.id))).scalar()
        if used >= site.total_quota_slots:
            errors.append(f"Row {i} ({full_name}): site '{site_name}' is at full quota ({site.total_quota_slots})")
            skipped += 1
            continue

        # Passport number uniqueness
        passport_number = (row.get("passport_number") or "").strip() or None
        if passport_number:
            dup = (await db.execute(
                select(Employee).where(Employee.passport_number == passport_number)
            )).scalar_one_or_none()
            if dup:
                errors.append(f"Row {i} ({full_name}): passport '{passport_number}' already exists (Employee: {dup.full_name})")
                skipped += 1
                continue

        # Auto-generate employee number
        max_id = (await db.execute(select(func.max(Employee.id)))).scalar() or 0
        emp_number = f"EMP-{100 + max_id}"
        while (await db.execute(select(Employee).where(Employee.employee_number == emp_number))).scalar_one_or_none():
            max_id += 1
            emp_number = f"EMP-{100 + max_id}"

        # Parse optional date fields
        def parse_date(val):
            v = (val or "").strip()
            if not v or v.lower() == "null":
                return None
            try:
                return date.fromisoformat(v)
            except ValueError:
                return None

        emp = Employee(
            employer_id=employer.id,
            site_id=site.id,
            full_name=full_name,
            employee_number=emp_number,
            passport_number=passport_number,
            work_permit_number=(row.get("work_permit_number") or "").strip() or None,
            nationality=(row.get("nationality") or "").strip() or None,
            job_title=(row.get("job_title") or "").strip() or None,
            passport_expiry=parse_date(row.get("passport_expiry")),
            visa_stamp_expiry=parse_date(row.get("visa_stamp_expiry")),
            insurance_expiry=parse_date(row.get("insurance_expiry")),
            work_permit_fee_expiry=parse_date(row.get("work_permit_fee_expiry")),
            medical_expiry=parse_date(row.get("medical_expiry")),
        )
        db.add(emp)
        try:
            await db.commit()
            created += 1
        except Exception as e:
            await db.rollback()
            errors.append(f"Row {i} ({full_name}): {str(e)}")

    return BulkCreateResult(created=created, skipped=skipped, errors=errors)
