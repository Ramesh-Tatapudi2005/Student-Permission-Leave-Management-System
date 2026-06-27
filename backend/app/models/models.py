from sqlalchemy import Column, Integer, String, Text, Date, ForeignKey, DateTime, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.session import Base

class Announcement(Base):
    __tablename__ = "announcements"
    
    announcement_id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    
    # Note: attachment_url and attachment_type are removed from here
    # because they are now handled safely in the AnnouncementAttachment table below.
    
    posted_by = Column(String(20), nullable=False)
    
    # UPDATED: Added CheckConstraint to allow ADMINs to be the sender
    posted_role = Column(
        String(20), 
        CheckConstraint("posted_role IN ('FACULTY', 'HOD', 'WARDEN', 'ADMIN')", name="announcements_posted_role_check"),
        nullable=False
    )
    
    target_role = Column(
        String, 
        CheckConstraint("target_role IN ('ALL', 'STUDENT', 'FACULTY', 'HOD', 'ALL_STAFF', 'PROCTORED_STUDENTS')", name="announcements_target_role_check"),
        default="ALL",
        nullable=False
    )
    target_dept = Column(String(20), default="ALL")
    target_year = Column(Integer, nullable=True)
    priority_level = Column(String(20), default="STANDARD")
    status = Column(String(20), default="DRAFT")
    expiry_date = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # FIX: Changed backref="announcement" to back_populates="announcement"
    attachments = relationship(
        "AnnouncementAttachment", 
        back_populates="announcement", 
        cascade="all, delete-orphan"
    )


class AnnouncementAttachment(Base):
    __tablename__ = "announcement_attachments"
    
    attachment_id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.announcement_id"), nullable=False)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(20), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # FIX: Safely points back using back_populates="attachments"
    announcement = relationship("Announcement", back_populates="attachments")


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"
    
    read_id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.announcement_id"), nullable=False)
    user_identifier = Column(String, ForeignKey("auth_users.user_identifier"), nullable=False)
    read_at = Column(DateTime, server_default=func.now())