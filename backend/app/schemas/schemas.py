from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


class ExpiryStatus(str, Enum):
    VALID = "Valid"
    WARNING = "Warning"
    CRITICAL = "Critical"
    EXPIRED = "Expired"


# ── Employer ──────────────────────────────────────────────
class EmployerBase(BaseModel):
    name: str
    registration_number: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class EmployerCreate(EmployerBase):
    pass


class EmployerRead(EmployerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ── Site ──────────────────────────────────────────────────
class SiteBase(BaseModel):
    site_name: str
    total_quota_slots: int = Field(gt=0)


class SiteCreate(SiteBase):
    employer_id: int


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employer_id: int
    used_slots: int
    available_slots: int
    quota_utilisation_pct: float


# ── Employee ──────────────────────────────────────────────
class EmployeeBase(BaseModel):
    full_name: str
    employee_number: str
    nationality: Optional[str] = None
    job_title: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_stamp_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    work_permit_fee_expiry: Optional[date] = None


class EmployeeCreate(EmployeeBase):
    employer_id: int
    site_id: int


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    nationality: Optional[str] = None
    job_title: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_stamp_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    work_permit_fee_expiry: Optional[date] = None
    note: Optional[str] = None  # optional note for audit log


class ExpiryDetail(BaseModel):
    date: Optional[date]
    days_remaining: Optional[int]
    status: Optional[ExpiryStatus]


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employer_id: int
    site_id: int
    passport_status: Optional[ExpiryDetail] = None
    visa_stamp_status: Optional[ExpiryDetail] = None
    insurance_status: Optional[ExpiryDetail] = None
    work_permit_fee_status: Optional[ExpiryDetail] = None


# ── Audit Log ─────────────────────────────────────────────
class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int
    changed_at: datetime
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None


# ── Alerts ────────────────────────────────────────────────
class ExpiryAlert(BaseModel):
    employee_id: int
    employee_number: str
    full_name: str
    employer_name: str
    site_name: str
    expiry_type: str
    expiry_date: date
    days_remaining: int
    status: ExpiryStatus


class AlertsResponse(BaseModel):
    total: int
    critical: int
    warning: int
    expired: int
    alerts: List[ExpiryAlert]


# ── Dashboard Stats ───────────────────────────────────────
class DashboardStats(BaseModel):
    total_employers: int
    total_sites: int
    total_employees: int
    total_alerts_critical: int
    total_alerts_warning: int
    total_alerts_expired: int
    sites_at_capacity: int
