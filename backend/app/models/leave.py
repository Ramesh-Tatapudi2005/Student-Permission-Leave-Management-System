from sqlalchemy import Column, String, Integer, Date, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.session import Base

# CRITICAL FIX: This forces SQLAlchemy to load the Student and Faculty tables FIRST
from app.models.user import Student, Faculty

class LeaveApplication(Base):
    __tablename__ = "leave_applications"

    application_id = Column(Integer, primary_key=True, index=True)
    student_roll_no = Column(String, ForeignKey("students.roll_no"), nullable=False)
    
    leave_type = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    
    status = Column(String, default="PENDING") 
    current_approval_stage = Column(String, default="PROCTOR")
    is_override_approval = Column(Boolean, default=False)
    applied_at = Column(DateTime, server_default=func.now())

    # --- NEW COLUMNS ADDED HERE ---
    proctor_remarks = Column(Text, nullable=True)
    hod_remarks = Column(Text, nullable=True)
    is_emergency = Column(Boolean, default=False)
    attachment_filename = Column(String, nullable=True)  # Parent's handwritten letter PDF
    # ------------------------------

    # Relationship to audit trail
    approvals = relationship("LeaveApproval", back_populates="application")


class LeaveApproval(Base):
    __tablename__ = "leave_approvals"

    approval_id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("leave_applications.application_id"), nullable=False)
    
    # Note: Links to the UNIQUE emp_id, just like your raw SQL schema specified!
    approver_emp_id = Column(String, ForeignKey("faculty.emp_id"), nullable=False)
    approver_role = Column(String, nullable=False)
    action = Column(String, nullable=False)
    remarks = Column(Text, nullable=True)
    action_time = Column(DateTime, server_default=func.now())

    application = relationship("LeaveApplication", back_populates="approvals")