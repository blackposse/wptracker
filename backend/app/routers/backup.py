from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, date
from typing import Any
from pydantic import BaseModel

from app.database import get_db
from app.models.models import Employer, Site, QuotaSlot, Employee, AuditLog, User, InvoiceRecord
from app.auth import get_current_user

router = APIRouter(prefix="/backup", tags=["Backup"])


async def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _d(val) -> str | None:
    """Serialize a date/datetime to ISO string."""
    if val is None:
        return None
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    return str(val)


@router.get("/export")
async def export_backup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),   # any authenticated user can download
):
    employers    = (await db.execute(select(Employer))).scalars().all()
    sites        = (await db.execute(select(Site))).scalars().all()
    quota_slots  = (await db.execute(select(QuotaSlot))).scalars().all()
    employees    = (await db.execute(select(Employee))).scalars().all()
    audit_logs   = (await db.execute(select(AuditLog))).scalars().all()
    users        = (await db.execute(select(User))).scalars().all()
    inv_records  = (await db.execute(select(InvoiceRecord))).scalars().all()

    return {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "employers": [
            {
                "id": e.id, "name": e.name,
                "registration_number": e.registration_number,
                "contact_name": e.contact_name,
                "contact_email": e.contact_email,
                "contact_phone": e.contact_phone,
                "is_active": e.is_active,
            }
            for e in employers
        ],
        "sites": [
            {
                "id": s.id, "employer_id": s.employer_id,
                "site_name": s.site_name,
                "total_quota_slots": s.total_quota_slots,
            }
            for s in sites
        ],
        "quota_slots": [
            {
                "id": q.id, "site_id": q.site_id,
                "slot_number": q.slot_number,
                "expiry_date": _d(q.expiry_date),
            }
            for q in quota_slots
        ],
        "employees": [
            {
                "id": emp.id, "employer_id": emp.employer_id, "site_id": emp.site_id,
                "full_name": emp.full_name, "employee_number": emp.employee_number,
                "passport_number": emp.passport_number,
                "work_permit_number": emp.work_permit_number,
                "nationality": emp.nationality, "job_title": emp.job_title,
                "passport_expiry": _d(emp.passport_expiry),
                "visa_stamp_expiry": _d(emp.visa_stamp_expiry),
                "insurance_expiry": _d(emp.insurance_expiry),
                "work_permit_fee_expiry": _d(emp.work_permit_fee_expiry),
                "medical_expiry": _d(emp.medical_expiry),
                "quota_slot_id": emp.quota_slot_id,
                "resigned": emp.resigned,
            }
            for emp in employees
        ],
        "users": [
            {
                "id": u.id, "username": u.username,
                "hashed_password": u.hashed_password,
                "is_admin": u.is_admin, "is_active": u.is_active,
            }
            for u in users
        ],
        "audit_logs": [
            {
                "id": a.id, "employee_id": a.employee_id,
                "field_name": a.field_name,
                "old_value": a.old_value, "new_value": a.new_value,
                "note": a.note, "changed_by": a.changed_by,
                "changed_at": _d(a.changed_at),
            }
            for a in audit_logs
        ],
        "invoice_records": [
            {
                "id": r.id, "number": r.number, "date": r.date,
                "employer_name": r.employer_name, "invoice_type": r.invoice_type,
                "employee_count": r.employee_count, "grand_total": r.grand_total,
                "status": r.status, "combine_wpf": r.combine_wpf,
                "combine_insurance": r.combine_insurance, "combine_quota": r.combine_quota,
                "notes": r.notes, "employees_snapshot": r.employees_snapshot,
                "config_json": r.config_json, "created_by": r.created_by,
                "created_at": _d(r.created_at),
            }
            for r in inv_records
        ],
    }


class BackupPayload(BaseModel):
    version: int
    employers:       list[dict[str, Any]] = []
    sites:           list[dict[str, Any]] = []
    quota_slots:     list[dict[str, Any]] = []
    employees:       list[dict[str, Any]] = []
    users:           list[dict[str, Any]] = []
    audit_logs:      list[dict[str, Any]] = []
    invoice_records: list[dict[str, Any]] = []


@router.post("/restore")
async def restore_backup(
    payload: BackupPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    """Wipe all data and restore from backup. Admin only."""
    if payload.version != 1:
        raise HTTPException(status_code=400, detail=f"Unsupported backup version: {payload.version}")

    # ── 1. Wipe in FK-safe order ──────────────────────────
    await db.execute(text(
        "TRUNCATE invoice_records, audit_logs, employees, quota_slots, sites, employers, users RESTART IDENTITY CASCADE"
    ))
    await db.commit()

    def parse_date(val):
        if not val:
            return None
        try:
            return date.fromisoformat(val[:10])
        except Exception:
            return None

    # ── 2. Re-insert in FK order ──────────────────────────

    for r in payload.employers:
        db.add(Employer(
            id=r["id"], name=r["name"],
            registration_number=r["registration_number"],
            contact_name=r.get("contact_name"),
            contact_email=r.get("contact_email"),
            contact_phone=r.get("contact_phone"),
            is_active=r.get("is_active", True),
        ))
    await db.flush()

    for r in payload.sites:
        db.add(Site(
            id=r["id"], employer_id=r["employer_id"],
            site_name=r["site_name"],
            total_quota_slots=r["total_quota_slots"],
        ))
    await db.flush()

    for r in payload.quota_slots:
        db.add(QuotaSlot(
            id=r["id"], site_id=r["site_id"],
            slot_number=r["slot_number"],
            expiry_date=parse_date(r.get("expiry_date")),
        ))
    await db.flush()

    for r in payload.employees:
        db.add(Employee(
            id=r["id"], employer_id=r["employer_id"], site_id=r["site_id"],
            full_name=r["full_name"], employee_number=r["employee_number"],
            passport_number=r.get("passport_number"),
            work_permit_number=r.get("work_permit_number"),
            nationality=r.get("nationality"), job_title=r.get("job_title"),
            passport_expiry=parse_date(r.get("passport_expiry")),
            visa_stamp_expiry=parse_date(r.get("visa_stamp_expiry")),
            insurance_expiry=parse_date(r.get("insurance_expiry")),
            work_permit_fee_expiry=parse_date(r.get("work_permit_fee_expiry")),
            medical_expiry=parse_date(r.get("medical_expiry")),
            quota_slot_id=r.get("quota_slot_id"),
            resigned=r.get("resigned", False),
        ))
    await db.flush()

    for r in payload.users:
        db.add(User(
            id=r["id"], username=r["username"],
            hashed_password=r["hashed_password"],
            is_admin=r.get("is_admin", False),
            is_active=r.get("is_active", True),
        ))
    await db.flush()

    for r in payload.audit_logs:
        db.add(AuditLog(
            id=r["id"], employee_id=r["employee_id"],
            field_name=r["field_name"],
            old_value=r.get("old_value"), new_value=r.get("new_value"),
            note=r.get("note"), changed_by=r.get("changed_by"),
        ))
    await db.flush()

    await db.commit()

    # ── 3. Reset sequences so new inserts don't collide ──
    for r in payload.invoice_records:
        db.add(InvoiceRecord(
            id=r["id"], number=r["number"], date=r["date"],
            employer_name=r.get("employer_name"), invoice_type=r["invoice_type"],
            employee_count=r.get("employee_count", 0), grand_total=r.get("grand_total", 0.0),
            status=r.get("status", "pending"),
            combine_wpf=r.get("combine_wpf", False),
            combine_insurance=r.get("combine_insurance", False),
            combine_quota=r.get("combine_quota", False),
            notes=r.get("notes"), employees_snapshot=r.get("employees_snapshot"),
            config_json=r.get("config_json"), created_by=r.get("created_by"),
        ))
    await db.flush()
    await db.commit()

    for table, col in [
        ("employers",       "employers_id_seq"),
        ("sites",           "sites_id_seq"),
        ("quota_slots",     "quota_slots_id_seq"),
        ("employees",       "employees_id_seq"),
        ("users",           "users_id_seq"),
        ("audit_logs",      "audit_logs_id_seq"),
        ("invoice_records", "invoice_records_id_seq"),
    ]:
        await db.execute(text(
            f"SELECT setval('{col}', COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
        ))
    await db.commit()

    return {
        "message": "Restore complete.",
        "employers":   len(payload.employers),
        "sites":       len(payload.sites),
        "quota_slots": len(payload.quota_slots),
        "employees":   len(payload.employees),
        "users":       len(payload.users),
        "audit_logs":  len(payload.audit_logs),
    }
