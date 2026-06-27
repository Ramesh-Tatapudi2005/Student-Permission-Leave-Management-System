import os
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, status, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.sql import func
from app.utils.sockets import manager
from app.utils.redis_pubsub import redis_pubsub
from app.db.session import get_db
from app.models.user import Student, Faculty, AuthUser
from app.models.models import Announcement, AnnouncementRead, AnnouncementAttachment
from app.schemas.schemas import AnnouncementCreate
from datetime import datetime
from supabase import create_client, Client
from app.core.celery_app import celery_app

announcements_router = APIRouter()

# --- Setup Supabase Client for Storage ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "your-supabase-project-url")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-supabase-service-role-key")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MAX_FILE_SIZE_MB = 5 * 1024 * 1024  # 5 MB limit

def determine_file_category(content_type: str) -> str:
    """Maps HTTP content types to your database ENUMs."""
    if content_type.startswith("image/"): return "IMAGE"
    if content_type.startswith("video/"): return "VIDEO"
    if content_type == "application/pdf": return "PDF"
    if content_type in [
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain", "application/vnd.ms-excel"
    ]: return "DOCUMENT"
    return "UNKNOWN"

# ==========================================
# HELPER — Resolve email recipients
# ==========================================
def _target_label(ann: Announcement) -> str:
    """Human-readable audience description for the email body."""
    parts = []
    role_map = {
        "ALL": "Everyone",
        "STUDENT": "Students",
        "FACULTY": "Faculty",
        "HOD": "HODs",
        "ALL_STAFF": "All Staff",
        "PROCTORED_STUDENTS": "Your Proctored Students",
    }
    parts.append(role_map.get(ann.target_role, ann.target_role))
    if ann.target_dept and ann.target_dept != "ALL":
        parts.append(f"— {ann.target_dept} Dept")
    if ann.target_year:
        parts.append(f"Year {ann.target_year}")
    return " ".join(parts)


def _resolve_email_recipients(db: Session, ann: Announcement) -> list[dict]:
    """
    Mirror the exact feed-filter logic and return a deduplicated list of
    {"name": str, "email": str} dicts for every user who would see this announcement.
    """
    target_role = ann.target_role
    target_dept = ann.target_dept or "ALL"
    target_year = ann.target_year
    posted_by = ann.posted_by     # emp_id of the poster

    seen_emails: set[str] = set()
    recipients: list[dict] = []

    def _add(name: str, email: str):
        if email and email not in seen_emails:
            seen_emails.add(email)
            recipients.append({"name": name, "email": email})

    def _students_base():
        q = db.query(Student)
        if target_dept != "ALL":
            q = q.filter(Student.department == target_dept)
        if target_year:
            q = q.filter(Student.year == target_year)
        return q.all()

    def _faculty_by_role(role_filter):
        q = db.query(Faculty).filter(Faculty.role == role_filter)
        if target_dept != "ALL":
            q = q.filter(Faculty.department == target_dept)
        return q.all()

    if target_role == "ALL":
        for s in db.query(Student).all():
            _add(s.student_name, s.email)
        for f in db.query(Faculty).all():
            _add(f.faculty_name, f.email)

    elif target_role == "STUDENT":
        for s in _students_base():
            _add(s.student_name, s.email)

    elif target_role == "PROCTORED_STUDENTS":
        # posted_by is the faculty emp_id; get their proctored students
        poster = db.query(Faculty).filter(Faculty.emp_id == posted_by).first()
        if poster:
            proctored = db.query(Student).filter(
                Student.proctor_id == poster.faculty_id
            ).all()
            for s in proctored:
                _add(s.student_name, s.email)

    elif target_role == "FACULTY":
        for f in _faculty_by_role("FACULTY"):
            _add(f.faculty_name, f.email)

    elif target_role == "HOD":
        for f in _faculty_by_role("HOD"):
            _add(f.faculty_name, f.email)

    elif target_role == "ALL_STAFF":
        for f in db.query(Faculty).all():
            _add(f.faculty_name, f.email)

    return recipients


# ==========================================
# 1. REAL-TIME WEBSOCKET PIPELINE
# ==========================================
@announcements_router.websocket("/ws/announcements/{roll_no}")
async def websocket_endpoint(websocket: WebSocket, roll_no: str):
    # 1. Manually open a database session
    db_gen = get_db()
    db = next(db_gen)
    
    user_proctor_id = None 
    
    try:
        # 2. Quickly query the user's routing metadata
        student = db.query(Student).filter(Student.roll_no == roll_no).first()
        if not student:
            faculty = db.query(Faculty).filter(Faculty.emp_id == roll_no).first()
            if not faculty:
                await websocket.close(code=1008)
                return
            
            # Save faculty data to variables
            user_id = faculty.emp_id
            user_role = faculty.role
            user_dept = faculty.department
            user_year = None
        else:
            # Save student data to variables
            user_id = student.roll_no
            user_role = "STUDENT"
            user_dept = student.department
            user_year = student.year
            # Grab the proctor_id so we know who is allowed to message them privately
            user_proctor_id = getattr(student, 'proctor_id', None) 
            
    finally:
        # 3. CRITICAL: Close the DB connection immediately so others can use it!
        db.close()

    # 4. NOW connect them to the matrix (The DB is completely free)
    await manager.connect(
        websocket=websocket, 
        user_id=user_id, 
        role=user_role, 
        dept=user_dept, 
        year=user_year,
        proctor_id=user_proctor_id
    )

    try:
        # 5. Keep the socket open infinitely (Requires 0 database power)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(roll_no)

# ==========================================
# 2. ANNOUNCEMENT MANAGEMENT
# ==========================================
@announcements_router.post("/announcements", status_code=status.HTTP_201_CREATED)
async def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db)):
    # 1. Extract and save the main announcement (excluding the attachments list)
    announcement_data = payload.model_dump(exclude={'attachments'})
    db_announcement = Announcement(**announcement_data)
    db.add(db_announcement)
    db.commit()
    db.refresh(db_announcement)
    
    # 2. Handle attachments safely (Limit to 3)
    attached_files_for_broadcast = []
    if payload.attachments:
        for attachment in payload.attachments[:3]:
            new_attachment = AnnouncementAttachment(
                announcement_id=db_announcement.announcement_id,
                file_url=attachment.file_url,
                file_type=attachment.file_type
            )
            db.add(new_attachment)
            attached_files_for_broadcast.append({
                "file_url": attachment.file_url,
                "file_type": attachment.file_type
            })
        db.commit()
        db.refresh(db_announcement)
    
    # 3. Format the real-time broadcast payload to include the attachments
    if db_announcement.status == "PUBLISHED":
        broadcast_payload = {
            "announcement_id": db_announcement.announcement_id,
            "title": db_announcement.title,
            "description": db_announcement.description,
            "posted_by": db_announcement.posted_by,
            "posted_role": db_announcement.posted_role,
            "target_role": db_announcement.target_role,
            "target_dept": db_announcement.target_dept,
            "target_year": db_announcement.target_year,
            "priority_level": db_announcement.priority_level,
            "created_at": str(db_announcement.created_at),
            "attachments": attached_files_for_broadcast
        }
        await redis_pubsub.publish_announcement(broadcast_payload)

        # 4. Resolve recipient emails and dispatch the Celery email task
        recipients = _resolve_email_recipients(db, db_announcement)

        if recipients:
            # Fetch the poster's display name for the email
            poster_faculty = db.query(Faculty).filter(
                Faculty.emp_id == db_announcement.posted_by
            ).first()
            poster_name = poster_faculty.faculty_name if poster_faculty else db_announcement.posted_by

            celery_app.send_task(
                "send_announcement_emails",
                kwargs=dict(
                    recipients=recipients,
                    title=db_announcement.title,
                    description=db_announcement.description,
                    posted_by_name=poster_name,
                    posted_role=db_announcement.posted_role,
                    priority_level=db_announcement.priority_level or "STANDARD",
                    target_label=_target_label(db_announcement),
                    attachments=attached_files_for_broadcast,  # full list with file_url + file_type
                ),
            )
            print(f"[ANNOUNCE] Queued email task for {len(recipients)} recipient(s).")

    return {"message": "Broadcasted", "id": db_announcement.announcement_id}

# ==========================================
# 3. FEED & UNREAD COUNTER (WITH EXPIRY)
# ==========================================
@announcements_router.get("/announcements/feed/{user_id}")
async def get_announcement_feed(user_id: str, db: Session = Depends(get_db)):
    user = db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first()
    student = db.query(Student).filter(Student.roll_no == user_id).first()
    faculty = db.query(Faculty).filter(Faculty.emp_id == user_id).first()
    
    if not user: raise HTTPException(status_code=404, detail="User not found")

    # Use selectinload to eagerly fetch attachments
    query = db.query(Announcement).options(selectinload(Announcement.attachments)).filter(
        Announcement.status == "PUBLISHED",
        (Announcement.expiry_date >= func.current_date()) | (Announcement.expiry_date.is_(None))
    )
    
    if student:
        proctor_id = getattr(student, 'proctor_id', None)
        
        # Student SQL Filter Matrix
        query = query.filter(
            (Announcement.target_role == "ALL") |
            (
                (Announcement.target_role == "STUDENT") & 
                (Announcement.target_dept.in_(["ALL", student.department])) & 
                ((Announcement.target_year == student.year) | (Announcement.target_year.is_(None)))
            ) |
            (
                (Announcement.target_role == "PROCTORED_STUDENTS") & 
                (Announcement.posted_by == str(proctor_id))
            )
        )
    elif faculty: 
        role = faculty.role.upper()
        dept = faculty.department
        
        # HOD SQL Filter Matrix
        if role == "HOD":
            query = query.filter(
                (Announcement.target_role.in_(["ALL", "ALL_STAFF"])) |
                ((Announcement.target_role == "FACULTY") & (Announcement.target_dept.in_(["ALL", dept]))) |
                ((Announcement.target_role == "HOD") & (Announcement.target_dept.in_(["ALL", dept])))
            )
        # Faculty SQL Filter Matrix
        else:
            query = query.filter(
                (Announcement.target_role.in_(["ALL", "ALL_STAFF"])) |
                ((Announcement.target_role == "FACULTY") & (Announcement.target_dept.in_(["ALL", dept])))
            )
    
    feed = query.order_by(Announcement.created_at.desc()).limit(50).all()
    
    # Format the data cleanly for React
    result = []
    for ann in feed:
        result.append({
            "announcement_id": ann.announcement_id,
            "title": ann.title,
            "description": ann.description,
            "posted_by": ann.posted_by,
            "posted_role": ann.posted_role,
            "target_dept": ann.target_dept,
            "target_year": ann.target_year,
            "priority_level": ann.priority_level,
            "status": ann.status,
            "created_at": str(ann.created_at), 
            "attachments": [
                {"file_url": att.file_url, "file_type": att.file_type} 
                for att in ann.attachments
            ]
        })
    
    # Update timestamp
    user.last_announcements_check = func.now()
    db.commit()
    return result

# ==========================================
# 4. READ RECEIPTS
# ==========================================
@announcements_router.post("/announcements/acknowledge")
async def acknowledge_announcement(announcement_id: int, user_identifier: str, db: Session = Depends(get_db)):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    stmt = (
        pg_insert(AnnouncementRead)
        .values(announcement_id=announcement_id, user_identifier=user_identifier)
        .on_conflict_do_nothing(constraint="unique_user_announcement_read")
    )
    db.execute(stmt)
    db.commit()
    return {"status": "acknowledged"}

# ==========================================
# 5. SECURE FILE UPLOAD
# ==========================================
@announcements_router.post("/announcements/upload")
async def upload_attachment(file: UploadFile = File(...)):
    # 1. Validate File Type
    file_category = determine_file_category(file.content_type)
    if file_category == "UNKNOWN":
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file type. Please upload an Image, Video, PDF, or Document."
        )

    # 2. Validate File Size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=413, detail="File size exceeds the 5MB limit.")
    
    # 3. Generate a Unique Filename
    file_extension = file.filename.split(".")[-1] if "." in file.filename else ""
    unique_filename = f"{uuid.uuid4()}.{file_extension}"

    # 4. Upload to Supabase Storage Bucket
    try:
        supabase.storage.from_("announcement_attachments").upload(
            path=unique_filename,
            file=file_bytes,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload to cloud: {str(e)}")

    # 5. Get the Public URL
    public_url = supabase.storage.from_("announcement_attachments").get_public_url(unique_filename)

    return {
        "file_url": public_url,
        "file_type": file_category
    }

# ==========================================
# 6. STAFF ANALYTICS & HISTORY
# ==========================================
@announcements_router.get("/announcements/staff/{emp_id}")
async def get_staff_announcements(emp_id: str, db: Session = Depends(get_db)):
    staff_announcements = db.query(Announcement)\
        .options(selectinload(Announcement.attachments))\
        .filter(Announcement.posted_by == emp_id)\
        .order_by(Announcement.created_at.desc())\
        .all()
    
    result = []
    for ann in staff_announcements:
        view_count = db.query(AnnouncementRead)\
            .filter(AnnouncementRead.announcement_id == ann.announcement_id)\
            .count()
            
        ann_data = {
            "announcement_id": ann.announcement_id,
            "title": ann.title,
            "description": ann.description,
            "posted_role": ann.posted_role,
            "target_dept": ann.target_dept,
            "target_year": ann.target_year,
            "priority_level": ann.priority_level,
            "status": ann.status,
            "created_at": str(ann.created_at),
            "total_views": view_count,
            "attachments": [
                {"file_url": att.file_url, "file_type": att.file_type} 
                for att in ann.attachments
            ]
        }
        result.append(ann_data)
        
    return result