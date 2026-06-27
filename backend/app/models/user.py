from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey, DateTime, CheckConstraint
from sqlalchemy.sql import func
from app.db.session import Base
import datetime

class AuthUser(Base):
    __tablename__ = "auth_users"
    
    auth_id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String, unique=True, nullable=False)
    password = Column(Text, nullable=False)
    
    # UPDATED: Added CheckConstraint for ADMIN role
    role = Column(
        String, 
        CheckConstraint("role IN ('STUDENT', 'FACULTY', 'HOD', 'WARDEN', 'ADMIN')", name="auth_users_role_check"),
        nullable=False
    )
    
    created_at = Column(DateTime, server_default=func.now())
    last_announcements_check = Column(DateTime, server_default=func.now(), nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)

class Faculty(Base):
    __tablename__ = "faculty"
    
    faculty_id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, unique=True, nullable=False)
    faculty_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    
    # UPDATED: Added CheckConstraint for ADMIN role
    role = Column(
        String, 
        CheckConstraint("role IN ('FACULTY', 'HOD', 'WARDEN', 'ADMIN')", name="faculty_role_check"),
        nullable=False
    )
    
    # UPDATED: Added CheckConstraint to allow 'ALL' branches
    department = Column(
        String, 
        CheckConstraint("department IN ('CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'ALL')", name="faculty_department_check"),
        nullable=False
    )
    
    created_at = Column(DateTime, server_default=func.now())

class Student(Base):
    __tablename__ = "students"
    
    roll_no = Column(String, primary_key=True)
    student_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    year = Column(Integer, nullable=False)
    department = Column(String, nullable=False)
    is_hosteller = Column(Boolean, default=False)
    
    # Links to the Faculty table's Primary Key
    proctor_id = Column(Integer, ForeignKey("faculty.faculty_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    # last_announcements_check = Column(DateTime, server_default=func.now(), nullable=True)


class PasswordOTP(Base):
    __tablename__ = "password_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String, nullable=False, index=True)
    otp_code = Column(String(6), nullable=False)
    new_password_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())