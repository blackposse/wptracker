from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from app.database import get_db
from app.models.models import Site, Employee, User
from app.schemas.schemas import SiteCreate, SiteRead
from app.auth import get_current_user

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
async def create_site(payload: SiteCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    site = Site(**payload.model_dump())
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return await _enrich_site(site, db)


@router.get("/", response_model=List[SiteRead])
async def list_sites(
    employer_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Site)
    if employer_id is not None:
        q = q.where(Site.employer_id == employer_id)
    result = await db.execute(q)
    return [await _enrich_site(s, db) for s in result.scalars().all()]


@router.get("/{site_id}", response_model=SiteRead)
async def get_site(site_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Site).where(Site.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return await _enrich_site(site, db)
