from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from datetime import date, timedelta
from typing import List, Optional
import csv
import io

from app.database import get_db
from app.models.models import Employee, Site, Employer, AuditLog, User, QuotaSlot
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
    if emp.quota_slot:
        data.quota_slot_number = emp.quota_slot.slot_number
        data.quota_slot_expiry = emp.quota_slot.expiry_date
        data.quota_slot_expired = (
            emp.quota_slot.expiry_date is not None and emp.quota_slot.expiry_date < date.today()
        )
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
    result2 = await db.execute(select(Employee).options(selectinload(Employee.quota_slot)).where(Employee.id == emp.id))
    emp = result2.scalar_one()
    return _enrich(emp)


@router.get("/", response_model=List[EmployeeRead])
async def list_employees(
    site_id: Optional[int] = None,
    employer_id: Optional[int] = None,
    resigned: Optional[bool] = Query(None, description="Filter by resigned status; omit for all"),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Employee).options(selectinload(Employee.quota_slot))
    if site_id:
        q = q.where(Employee.site_id == site_id)
    if employer_id:
        q = q.where(Employee.employer_id == employer_id)
    if resigned is not None:
        q = q.where(Employee.resigned == resigned)
    if skip:
        q = q.offset(skip)
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    return [_enrich(e) for e in result.scalars().all()]


@router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employee).options(selectinload(Employee.quota_slot)).where(Employee.id == employee_id))
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
    result = await db.execute(select(Employee).options(selectinload(Employee.quota_slot)).where(Employee.id == employee_id))
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
        "quota_slot_id": "Quota Slot",
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

    # Block work_permit_fee_expiry update if quota slot is expired
    if "work_permit_fee_expiry" in changes and changes["work_permit_fee_expiry"] is not None:
        if emp.quota_slot_id:
            slot_result = await db.execute(select(QuotaSlot).where(QuotaSlot.id == emp.quota_slot_id))
            slot = slot_result.scalar_one_or_none()
            if slot and slot.expiry_date and slot.expiry_date < date.today():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "Quota Slot Expired",
                        "message": (
                            f"Quota slot '{slot.slot_number}' expired on {slot.expiry_date}. "
                            f"Work Permit Fee cannot be renewed until the quota slot expiry is updated."
                        ),
                        "slot_number": slot.slot_number,
                        "slot_expiry": str(slot.expiry_date),
                    },
                )

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

    # Reload with quota_slot relationship
    fresh = (await db.execute(select(Employee).options(selectinload(Employee.quota_slot)).where(Employee.id == emp.id))).scalar_one()
    return _enrich(fresh)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(emp)
    await db.commit()


DATE_FIELDS = {"passport_expiry", "insurance_expiry", "work_permit_fee_expiry", "medical_expiry"}
UPDATABLE_FIELDS = {"full_name", "passport_number", "work_permit_number", "nationality", "job_title"} | DATE_FIELDS

import re as _re

_MONTH_MAP = {
    "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
    "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,
}

def _parse_date_flexible(val):
    """Parse dates in YYYY-MM-DD, DD-MMM-YY, DD-MMM-YYYY, DD-MM-YY, DD-MM-YYYY formats."""
    v = (val or "").strip().strip(".")
    if not v or v.lower() == "null":
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        pass
    m = _re.match(r"^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$", v)
    if m:
        d, mon, y = int(m.group(1)), m.group(2).lower()[:3], int(m.group(3))
        mo = _MONTH_MAP.get(mon)
        if mo:
            if y < 100:
                y += 2000 if y <= 50 else 1900
            try:
                return date(y, mo, d)
            except ValueError:
                pass
    m = _re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$", v)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y <= 50 else 1900
        try:
            return date(y, mo, d)
        except ValueError:
            pass
    return None

def _extract_slot_number(val):
    """Extract QS slot number from values like 'QP00003731 (QS00022960)'."""
    v = (val or "").strip()
    if not v:
        return None
    m = _re.search(r"\(?\s*(QS\w+)\s*\)?", v, _re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return _re.sub(r"[() ]", "", v) or None

FIELD_LABELS = {
    "full_name": "Full Name",
    "passport_number": "Passport Number",
    "work_permit_number": "Work Permit Number",
    "nationality": "Nationality",
    "job_title": "Job Title / Occupation",
    "passport_expiry": "Passport Expiry",
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
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
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

        # Allow "occupation" as an alias for "job_title"
        if "occupation" in row and "job_title" not in row:
            row["job_title"] = row["occupation"]

        changes = []
        for field in UPDATABLE_FIELDS:
            raw = row.get(field, "").strip()
            if raw == "":
                continue
            try:
                if field in DATE_FIELDS:
                    value = _parse_date_flexible(raw) if raw.lower() != "null" else None
                else:
                    value = raw if raw.lower() != "null" else None
                old_val = str(getattr(emp, field)) if getattr(emp, field) is not None else None
                new_val = str(value) if value is not None else None
                if old_val != new_val:
                    changes.append((field, old_val, new_val))
                    setattr(emp, field, value)
            except ValueError:
                errors.append(f"Row {i} ({emp_num}): invalid value '{raw}' for '{field}'")

        # Handle quota_slot_number — assigns employee to a slot by slot number
        raw_slot_number = _extract_slot_number(row.get("quota_slot_number"))
        if raw_slot_number:
            if raw_slot_number.lower() == "null":
                old_slot_id = str(emp.quota_slot_id) if emp.quota_slot_id else None
                emp.quota_slot_id = None
                changes.append(("quota_slot_id", old_slot_id, None))
            else:
                slot = (await db.execute(select(QuotaSlot).where(QuotaSlot.slot_number == raw_slot_number))).scalar_one_or_none()
                if not slot:
                    errors.append(f"Row {i} ({emp_num}): quota slot '{raw_slot_number}' not found")
                elif slot.site_id != emp.site_id:
                    errors.append(f"Row {i} ({emp_num}): quota slot '{raw_slot_number}' does not belong to this employee's site")
                else:
                    old_slot_id = str(emp.quota_slot_id) if emp.quota_slot_id else None
                    emp.quota_slot_id = slot.id
                    changes.append(("quota_slot_id", old_slot_id, raw_slot_number))

        # Handle quota_slot_expiry — updates the expiry of the employee's assigned slot
        raw_slot_expiry = row.get("quota_slot_expiry", "").strip()
        if raw_slot_expiry:
            if not emp.quota_slot_id:
                errors.append(f"Row {i} ({emp_num}): quota_slot_expiry provided but employee has no assigned quota slot")
            else:
                try:
                    new_slot_expiry = _parse_date_flexible(raw_slot_expiry) if raw_slot_expiry.lower() != "null" else None
                    slot = (await db.execute(select(QuotaSlot).where(QuotaSlot.id == emp.quota_slot_id))).scalar_one_or_none()
                    if slot:
                        old_slot_expiry = str(slot.expiry_date) if slot.expiry_date else None
                        slot.expiry_date = new_slot_expiry
                        changes.append(("quota_slot_expiry", old_slot_expiry, str(new_slot_expiry) if new_slot_expiry else None))
                except ValueError:
                    errors.append(f"Row {i} ({emp_num}): invalid date '{raw_slot_expiry}' for 'quota_slot_expiry'")

        if changes:
            await db.commit()
            await db.refresh(emp)
            try:
                for field, old_val, new_val in changes:
                    db.add(AuditLog(
                        employee_id=emp.id,
                        field_name=FIELD_LABELS.get(field, field) if field != "quota_slot_expiry" else "Quota Slot Expiry",
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
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")

    reader = csv.DictReader(io.StringIO(text))
    required = {"full_name", "employer_name", "site_name"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=400, detail="CSV must have columns: full_name, employer_name, site_name")

    # ── Site cache to avoid re-creating within this import ──
    _site_cache: dict = {}

    async def get_or_create_site(employer_id, site_name_key):
        cache_key = (employer_id, site_name_key.lower())
        if cache_key in _site_cache:
            return _site_cache[cache_key]
        site = (await db.execute(
            select(Site).where(
                func.lower(Site.site_name) == site_name_key.lower(),
                Site.employer_id == employer_id,
            )
        )).scalar_one_or_none()
        if not site:
            site = Site(employer_id=employer_id, site_name=site_name_key, total_quota_slots=999)
            db.add(site)
            await db.flush()
        _site_cache[cache_key] = site
        return site

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

        # Look up or auto-create site
        site = await get_or_create_site(employer.id, site_name)

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

        # occupation is an alias for job_title
        if "occupation" in row and "job_title" not in row:
            row["job_title"] = row["occupation"]

        # Resolve optional quota slot (extract QS number from composite values)
        quota_slot_id = None
        slot_number_raw = _extract_slot_number(row.get("quota_slot_number"))
        slot_expiry_raw = (row.get("quota_slot_expiry") or "").strip()
        if slot_number_raw:
            slot = (await db.execute(
                select(QuotaSlot).where(QuotaSlot.slot_number == slot_number_raw)
            )).scalar_one_or_none()
            if not slot:
                # Auto-create the quota slot under this site
                slot = QuotaSlot(site_id=site.id, slot_number=slot_number_raw,
                                 expiry_date=_parse_date_flexible(slot_expiry_raw))
                db.add(slot)
                await db.flush()
            elif slot.site_id != site.id:
                errors.append(f"Row {i} ({full_name}): quota slot '{slot_number_raw}' belongs to a different site")
                skipped += 1
                continue
            quota_slot_id = slot.id
            if slot_expiry_raw and slot.expiry_date != _parse_date_flexible(slot_expiry_raw):
                slot.expiry_date = _parse_date_flexible(slot_expiry_raw)

        emp = Employee(
            employer_id=employer.id,
            site_id=site.id,
            full_name=full_name,
            employee_number=emp_number,
            passport_number=passport_number,
            work_permit_number=(row.get("work_permit_number") or "").strip() or None,
            nationality=(row.get("nationality") or "").strip() or None,
            job_title=(row.get("job_title") or "").strip() or None,
            passport_expiry=_parse_date_flexible(row.get("passport_expiry")),
            insurance_expiry=_parse_date_flexible(row.get("insurance_expiry")),
            work_permit_fee_expiry=_parse_date_flexible(row.get("work_permit_fee_expiry")),
            medical_expiry=_parse_date_flexible(row.get("medical_expiry")),
            quota_slot_id=quota_slot_id,
        )
        db.add(emp)
        try:
            await db.commit()
            created += 1
        except Exception as e:
            await db.rollback()
            errors.append(f"Row {i} ({full_name}): {str(e)}")

    return BulkCreateResult(created=created, skipped=skipped, errors=errors)
