from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.models import Employer, Site, Employee, User
from app.schemas.schemas import EmployerCreate, EmployerRead, DashboardStats, ExpiryStatus
from app.services.expiry import calculate_expiry_status, EXPIRY_FIELDS
from app.auth import get_current_user
from datetime import date, timedelta
from typing import List

router = APIRouter(prefix="/employers", tags=["Employers"])


@router.post("/", response_model=EmployerRead, status_code=status.HTTP_201_CREATED)
async def create_employer(payload: EmployerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    employer = Employer(**payload.model_dump())
    db.add(employer)
    await db.commit()
    await db.refresh(employer)
    return employer


@router.get("/", response_model=List[EmployerRead])
async def list_employers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employer))
    return result.scalars().all()


@router.get("/{employer_id}", response_model=EmployerRead)
async def get_employer(employer_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employer).where(Employer.id == employer_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employer not found")
    return emp


@router.patch("/{employer_id}/toggle", response_model=EmployerRead)
async def toggle_employer_active(employer_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Employer).where(Employer.id == employer_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employer not found")
    emp.is_active = not emp.is_active
    await db.commit()
    await db.refresh(emp)
    return emp
