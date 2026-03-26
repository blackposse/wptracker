from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.models import BrandingSetting, User
from app.auth import get_current_user

router = APIRouter(prefix="/branding", tags=["Branding"])


class BrandingOut(BaseModel):
    co_name: str = ""
    co_address: str = ""
    co_phone: str = ""
    co_email: str = ""
    co_reg: str = ""
    co_logo: str = ""
    logo_w: float = 28.0
    logo_h: float = 20.0
    stamp: str = ""
    stamp_w: float = 30.0
    stamp_h: float = 30.0
    sig: str = ""

    model_config = {"from_attributes": True}


class BrandingIn(BaseModel):
    co_name: Optional[str] = None
    co_address: Optional[str] = None
    co_phone: Optional[str] = None
    co_email: Optional[str] = None
    co_reg: Optional[str] = None
    co_logo: Optional[str] = None
    logo_w: Optional[float] = None
    logo_h: Optional[float] = None
    stamp: Optional[str] = None
    stamp_w: Optional[float] = None
    stamp_h: Optional[float] = None
    sig: Optional[str] = None


async def _get_or_create(db: AsyncSession) -> BrandingSetting:
    row = (await db.execute(select(BrandingSetting).where(BrandingSetting.id == 1))).scalar_one_or_none()
    if not row:
        row = BrandingSetting(id=1)
        db.add(row)
        await db.flush()
    return row


@router.get("/", response_model=BrandingOut)
async def get_branding(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _get_or_create(db)


@router.patch("/", response_model=BrandingOut)
async def update_branding(payload: BrandingIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    row = await _get_or_create(db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row
