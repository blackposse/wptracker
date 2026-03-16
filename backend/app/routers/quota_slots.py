from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.models import QuotaSlot, Site, Employee, User
from app.schemas.schemas import QuotaSlotCreate, QuotaSlotRead, QuotaSlotUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/quota-slots", tags=["Quota Slots"])


def _enrich_slot(slot: QuotaSlot, assigned_emp: Optional[Employee] = None) -> QuotaSlotRead:
    return QuotaSlotRead(
        id=slot.id,
        site_id=slot.site_id,
        slot_number=slot.slot_number,
        expiry_date=slot.expiry_date,
        assigned_employee_id=assigned_emp.id if assigned_emp else None,
        assigned_employee_name=assigned_emp.full_name if assigned_emp else None,
        is_expired=slot.expiry_date is not None and slot.expiry_date < date.today(),
    )


@router.post("/", response_model=QuotaSlotRead, status_code=status.HTTP_201_CREATED)
async def create_quota_slot(
    payload: QuotaSlotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = (await db.execute(select(Site).where(Site.id == payload.site_id))).scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    dup = (await db.execute(
        select(QuotaSlot).where(QuotaSlot.slot_number == payload.slot_number)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail=f"Slot number '{payload.slot_number}' already exists")

    slot = QuotaSlot(**payload.model_dump())
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return _enrich_slot(slot)


@router.get("/", response_model=List[QuotaSlotRead])
async def list_quota_slots(
    site_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(QuotaSlot)
    if site_id is not None:
        q = q.where(QuotaSlot.site_id == site_id)
    slots = (await db.execute(q)).scalars().all()

    result = []
    for slot in slots:
        emp = (await db.execute(
            select(Employee).where(Employee.quota_slot_id == slot.id)
        )).scalar_one_or_none()
        result.append(_enrich_slot(slot, emp))
    return result


@router.get("/{slot_id}", response_model=QuotaSlotRead)
async def get_quota_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = (await db.execute(select(QuotaSlot).where(QuotaSlot.id == slot_id))).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Quota slot not found")
    emp = (await db.execute(
        select(Employee).where(Employee.quota_slot_id == slot.id)
    )).scalar_one_or_none()
    return _enrich_slot(slot, emp)


@router.patch("/{slot_id}", response_model=QuotaSlotRead)
async def update_quota_slot(
    slot_id: int,
    payload: QuotaSlotUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = (await db.execute(select(QuotaSlot).where(QuotaSlot.id == slot_id))).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Quota slot not found")

    changes = payload.model_dump(exclude_unset=True)

    if "slot_number" in changes and changes["slot_number"] != slot.slot_number:
        dup = (await db.execute(
            select(QuotaSlot).where(
                QuotaSlot.slot_number == changes["slot_number"],
                QuotaSlot.id != slot_id,
            )
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail=f"Slot number '{changes['slot_number']}' already exists")

    for field, value in changes.items():
        setattr(slot, field, value)

    await db.commit()
    await db.refresh(slot)
    emp = (await db.execute(
        select(Employee).where(Employee.quota_slot_id == slot.id)
    )).scalar_one_or_none()
    return _enrich_slot(slot, emp)


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quota_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = (await db.execute(select(QuotaSlot).where(QuotaSlot.id == slot_id))).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Quota slot not found")
    # Unassign any employee using this slot before deleting
    emp = (await db.execute(
        select(Employee).where(Employee.quota_slot_id == slot_id)
    )).scalar_one_or_none()
    if emp:
        emp.quota_slot_id = None
        await db.commit()
    await db.delete(slot)
    await db.commit()
