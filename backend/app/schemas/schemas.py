from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


# ── Auth ──────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    is_active: bool
    is_admin: bool


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    password: Optional[str] = None


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
    is_active: bool = True


# ── Site ──────────────────────────────────────────────────
class SiteBase(BaseModel):
    site_name: str
    total_quota_slots: int = Field(gt=0)


class SiteCreate(SiteBase):
    employer_id: int


class SiteUpdate(BaseModel):
    site_name: Optional[str] = None
    total_quota_slots: Optional[int] = Field(None, gt=0)


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employer_id: int
    used_slots: int
    available_slots: int
    quota_utilisation_pct: float


# ── Quota Slot ────────────────────────────────────────────
class QuotaSlotCreate(BaseModel):
    site_id: int
    slot_number: str
    expiry_date: Optional[date] = None


class QuotaSlotUpdate(BaseModel):
    slot_number: Optional[str] = None
    expiry_date: Optional[date] = None


class QuotaSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    site_id: int
    slot_number: str
    expiry_date: Optional[date] = None
    assigned_employee_id: Optional[int] = None
    assigned_employee_name: Optional[str] = None
    is_expired: bool = False


# ── Employee ──────────────────────────────────────────────
class EmployeeBase(BaseModel):
    full_name: str
    employee_number: str
    passport_number: Optional[str] = None
    work_permit_number: Optional[str] = None
    nationality: Optional[str] = None

    job_title: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_stamp_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    work_permit_fee_expiry: Optional[date] = None
    medical_expiry: Optional[date] = None
    resigned: bool = False


class EmployeeCreate(EmployeeBase):
    employer_id: int
    site_id: int
    employee_number: Optional[str] = None  # auto-generated if not provided
    quota_slot_id: Optional[int] = None


class BulkUpdateRow(BaseModel):
    employee_number: str
    full_name: Optional[str] = None
    passport_number: Optional[str] = None
    nationality: Optional[str] = None
    job_title: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_stamp_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    work_permit_fee_expiry: Optional[date] = None
    medical_expiry: Optional[date] = None


class BulkUpdateResult(BaseModel):
    updated: int
    not_found: List[str]
    errors: List[str]


class BulkCreateResult(BaseModel):
    created: int
    skipped: int
    errors: List[str]


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    passport_number: Optional[str] = None
    work_permit_number: Optional[str] = None
    nationality: Optional[str] = None
    job_title: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_stamp_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    work_permit_fee_expiry: Optional[date] = None
    medical_expiry: Optional[date] = None
    resigned: Optional[bool] = None
    quota_slot_id: Optional[int] = None
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
    quota_slot_id: Optional[int] = None
    quota_slot_number: Optional[str] = None
    quota_slot_expiry: Optional[date] = None
    quota_slot_expired: bool = False
    passport_status: Optional[ExpiryDetail] = None
    visa_stamp_status: Optional[ExpiryDetail] = None
    insurance_status: Optional[ExpiryDetail] = None
    work_permit_fee_status: Optional[ExpiryDetail] = None
    medical_status: Optional[ExpiryDetail] = None


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
    changed_by: Optional[str] = None


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


# ── Missing Docs ──────────────────────────────────────────
class MissingDocAlert(BaseModel):
    employee_id: int
    employee_number: str
    full_name: str
    employer_name: str
    site_name: str
    missing_fields: List[str]


class MissingDocResponse(BaseModel):
    total: int
    alerts: List[MissingDocAlert]


# ── Dashboard Stats ───────────────────────────────────────
class DashboardStats(BaseModel):
    total_employers: int
    total_sites: int
    total_employees: int
    total_alerts_critical: int
    total_alerts_warning: int
    total_alerts_expired: int
    sites_at_capacity: int
    total_missing_docs: int
