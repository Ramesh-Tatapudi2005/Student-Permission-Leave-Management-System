from pydantic import BaseModel, Field
from datetime import date
from typing import Optional, List, Literal

class AttachmentCreate(BaseModel):
    file_url: str
    file_type: str = Field(..., description="PDF, IMAGE, VIDEO, or DOCUMENT")

    class Config:
        from_attributes = True

class AnnouncementCreate(BaseModel):
    title: str = Field(..., max_length=255)
    description: str
    posted_by: str = Field(..., max_length=20)
    
    # SECURITY UPGRADE: Strictly enforce the sender roles at the API level
    posted_role: Literal["FACULTY", "HOD", "WARDEN", "ADMIN"]
    
    # Target roles already updated
    target_role: Literal["ALL", "STUDENT", "FACULTY", "HOD", "ALL_STAFF", "PROCTORED_STUDENTS"]
    
    target_dept: Optional[str] = "ALL"
    target_year: Optional[int] = None
    priority_level: Optional[str] = "STANDARD"
    status: Optional[str] = "DRAFT"
    expiry_date: Optional[date] = None
    
    # Updated to support up to 3 attachments
    attachments: Optional[List[AttachmentCreate]] = []

    class Config:
        from_attributes = True # Updated from orm_mode (Pydantic V2)

class OverridePayload(BaseModel):
    status: str  # e.g., "APPROVED" or "REJECTED"
    admin_remarks: str

class BulkDeletePayload(BaseModel):
    user_ids: list[str]