from sqlalchemy import (
    Column, Integer, String, Date, DateTime, ForeignKey, UniqueConstraint,
    CheckConstraint, Index, func, Text, Boolean
)
from sqlalchemy.orm import relationship, column_property
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy import select

Base = declarative_base()


class Employer(Base):
    __tablename__ = "employers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    registration_number = Column(String(100), unique=True, nullable=False, index=True)
    contact_name = Column(String(255))
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    sites = relationship("Site", back_populates="employer", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="employer")


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    employer_id = Column(Integer, ForeignKey("employers.id", ondelete="CASCADE"), nullable=False, index=True)
    site_name = Column(String(255), nullable=False)
    total_quota_slots = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint("total_quota_slots > 0", name="check_quota_positive"),
        UniqueConstraint("employer_id", "site_name", name="uq_site_employer"),
    )

    employer = relationship("Employer", back_populates="sites")
    employees = relationship("Employee", back_populates="site")

    @hybrid_property
    def used_slots(self):
        return len(self.employees)


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employer_id = Column(Integer, ForeignKey("employers.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)

    full_name = Column(String(255), nullable=False)
    employee_number = Column(String(100), unique=True, nullable=False, index=True)
    passport_number     = Column(String(100), unique=True, nullable=True, index=True)
    work_permit_number  = Column(String(100), nullable=True, index=True)
    nationality = Column(String(100))
    job_title = Column(String(255))

    passport_expiry = Column(Date, nullable=True, index=True)
    visa_stamp_expiry = Column(Date, nullable=True, index=True)
    insurance_expiry = Column(Date, nullable=True, index=True)
    work_permit_fee_expiry = Column(Date, nullable=True, index=True)
    medical_expiry = Column(Date, nullable=True, index=True)
    resigned = Column(Boolean, nullable=False, default=False, server_default="false")

    __table_args__ = (
        Index("ix_passport_expiry", "passport_expiry"),
        Index("ix_visa_stamp_expiry", "visa_stamp_expiry"),
        Index("ix_insurance_expiry", "insurance_expiry"),
        Index("ix_work_permit_fee_expiry", "work_permit_fee_expiry"),
        Index("ix_medical_expiry", "medical_expiry"),
    )

    employer = relationship("Employer", back_populates="employees")
    site = relationship("Site", back_populates="employees")
    audit_logs = relationship("AuditLog", back_populates="employee", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    note = Column(Text)
    changed_by = Column(String(100), nullable=True)

    employee = relationship("Employee", back_populates="audit_logs")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False, server_default="false")
