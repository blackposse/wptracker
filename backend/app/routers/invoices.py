import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.models import InvoiceRecord, User
from app.auth import get_current_user

router = APIRouter(prefix="/invoices", tags=["Invoices"])


async def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _to_dict(inv: InvoiceRecord) -> dict:
    return {
        "id":              inv.id,
        "number":          inv.number,
        "date":            inv.date,
        "employerName":    inv.employer_name,
        "invoiceType":     inv.invoice_type,
        "employeeCount":   inv.employee_count,
        "grandTotal":      inv.grand_total,
        "status":          inv.status,
        "combineWpf":      inv.combine_wpf,
        "combineInsurance": inv.combine_insurance,
        "combineQuota":    inv.combine_quota,
        "notes":           inv.notes,
        "createdBy":       inv.created_by,
        "createdAt":       inv.created_at.isoformat() if inv.created_at else None,
        "employees":       json.loads(inv.employees_snapshot) if inv.employees_snapshot else [],
        "config":          json.loads(inv.config_json) if inv.config_json else {},
    }


# ── List ─────────────────────────────────────────────────────
@router.get("/")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(InvoiceRecord).order_by(desc(InvoiceRecord.created_at)))
    return [_to_dict(r) for r in result.scalars().all()]


# ── Create ───────────────────────────────────────────────────
class InvoiceCreate(BaseModel):
    number:        str
    date:          str
    employerName:  str
    invoiceType:   str
    employeeCount: int
    grandTotal:    float
    combineWpf:       bool = False
    combineInsurance: bool = False
    combineQuota:     bool = False
    notes:    str = ""
    employees: list = []
    config:    dict = {}


@router.post("/")
async def create_invoice(
    payload: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = InvoiceRecord(
        number         = payload.number,
        date           = payload.date,
        employer_name  = payload.employerName,
        invoice_type   = payload.invoiceType,
        employee_count = payload.employeeCount,
        grand_total    = payload.grandTotal,
        status         = "pending",
        combine_wpf       = payload.combineWpf,
        combine_insurance = payload.combineInsurance,
        combine_quota     = payload.combineQuota,
        notes              = payload.notes,
        employees_snapshot = json.dumps(payload.employees),
        config_json        = json.dumps(payload.config),
        created_by         = current_user.username,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return _to_dict(inv)


# ── Update status ─────────────────────────────────────────────
class InvoicePatch(BaseModel):
    status: Optional[str] = None


@router.patch("/{invoice_id}")
async def update_invoice(
    invoice_id: int,
    payload: InvoicePatch,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = (await db.execute(select(InvoiceRecord).where(InvoiceRecord.id == invoice_id))).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if payload.status is not None:
        if payload.status not in ("pending", "paid"):
            raise HTTPException(status_code=400, detail="status must be 'pending' or 'paid'")
        inv.status = payload.status
    await db.commit()
    await db.refresh(inv)
    return _to_dict(inv)


# ── Delete single ─────────────────────────────────────────────
@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = (await db.execute(select(InvoiceRecord).where(InvoiceRecord.id == invoice_id))).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    await db.delete(inv)
    await db.commit()
    return {"deleted": invoice_id}


# ── Clear all (admin) ─────────────────────────────────────────
@router.delete("/")
async def clear_all_invoices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    from sqlalchemy import text
    await db.execute(text("DELETE FROM invoice_records"))
    await db.commit()
    return {"message": "All invoice records cleared."}


# ── Next invoice number ───────────────────────────────────────
@router.get("/next-number")
async def next_invoice_number(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns the next invoice number for the current month."""
    from datetime import date
    ym = date.today().strftime("%Y%m")
    prefix = f"INV-{ym}-"
    count = (await db.execute(
        select(func.count()).select_from(InvoiceRecord)
        .where(InvoiceRecord.number.like(f"{prefix}%"))
    )).scalar() or 0
    next_num = f"{prefix}{str(count + 1).zfill(3)}"
    return {"number": next_num}
