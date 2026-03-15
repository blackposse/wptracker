from datetime import date
from typing import Optional
from app.schemas.schemas import ExpiryStatus, ExpiryDetail


def calculate_expiry_status(
    expiry_date: Optional[date],
    critical_days: int = 30,
    warning_days: int = 90,
) -> Optional[ExpiryDetail]:
    if expiry_date is None:
        return None

    today = date.today()
    delta = (expiry_date - today).days

    if delta < 0:
        status = ExpiryStatus.EXPIRED
    elif delta < critical_days:
        status = ExpiryStatus.CRITICAL
    elif delta <= warning_days:
        status = ExpiryStatus.WARNING
    else:
        status = ExpiryStatus.VALID

    return ExpiryDetail(date=expiry_date, days_remaining=delta, status=status)


EXPIRY_FIELDS = [
    ("passport_expiry",        "Passport",        30, 90),
    ("visa_stamp_expiry",      "Visa Stamp",       30, 90),
    ("insurance_expiry",       "Insurance",        30, 90),
    ("work_permit_fee_expiry", "Work Permit Fee",  15, 30),
    ("medical_expiry",         "Medical",          30, 60),
]
