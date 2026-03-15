from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.database import get_db
from app.models.models import Site, Employee
from app.schemas.schemas import SiteCreate, SiteRead

router = APIRouter(prefix="/sites", tags=["Sites"])


async def _enrich_site(site: Site, db: AsyncSession) -> SiteRead:
    count = (await db.execute(
        select(func.count()).where(Employee.site_id == site.id)
    )).scalar()
    used = count or 0
    available = site.total_quota_slots - used
    pct = round((used / site.total_quota_slots) * 100, 1) if site.total_quota_slots else 0.0
    return SiteRead(
        id=site.id,
        employer_id=site.employer_id,
        site_name=site.site_name,
        total_quota_slots=site.total_quota_slots,
        used_slots=used,
        available_slots=available,
        quota_utilisation_pct=pct,
    )


@router.post("/", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
async def create_site(payload: SiteCreate, db: AsyncSession = Depends(get_db)):
    site = Site(**payload.model_dump())
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return await _enrich_site(site, db)


@router.get("/", response_model=List[SiteRead])
async def list_sites(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site))
    return [await _enrich_site(s, db) for s in result.scalars().all()]


@router.get("/{site_id}", response_model=SiteRead)
async def get_site(site_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site).where(Site.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return await _enrich_site(site, db)
