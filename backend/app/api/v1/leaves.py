from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.leave import LeaveApplySchema, LeaveActionSchema
from app.services.leave_service import LeaveService
from app.core.security import get_current_user, decode_attachment_token  # JWT decoders
# All email notifications are dispatched internally by LeaveService (leave_tasks workers)
from app.models.leave import LeaveApplication
from app.models.user import Student
from fastapi_limiter.depends import FastAPILimiter
from fastapi.responses import FileResponse, Response
from fpdf import FPDF
from datetime import date
from supabase import create_client, Client
import os
import uuid

router = APIRouter(tags=["Leaves Dashboard"])

class QuickActionPayload(BaseModel):
    token: str
    action: str
    remarks: str = ""

@router.post("/quick-action")
def quick_process_application(payload: QuickActionPayload, db: Session = Depends(get_db)):
    """Receives the secure token from the React Email landing page"""
    return LeaveService.process_quick_action(db, payload.token, payload.action, payload.remarks)

async def safe_rate_limiter(request: Request):
    """Custom Rate Limiter to bypass the fastapi-limiter _IncludedRouter bug"""
    redis_client = FastAPILimiter.redis
    if not redis_client: 
        return
    
    key = f"rate_limit:apply_leave:{request.client.host}"
    requests = await redis_client.incr(key)
    if requests == 1:
        await redis_client.expire(key, 10) # 10 seconds cooldown
        
    if requests > 1:
        raise HTTPException(status_code=429, detail="Please wait 10 seconds before submitting another request.")

# --- STUDENT ROUTES ---

# --- Setup Supabase Client for Storage ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "your-supabase-project-url")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-supabase-service-role-key")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@router.post("/apply", dependencies=[Depends(safe_rate_limiter)])
async def apply_permission(
    leave_type: str = Form(...),
    subject: str = Form(...),
    description: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    parent_letter: UploadFile = File(...),
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    # Validate the uploaded file
    if parent_letter.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed for the parent's letter.")
    
    contents = await parent_letter.read()
    if len(contents) > 5 * 1024 * 1024:  # 5 MB limit
        raise HTTPException(status_code=400, detail="File size must not exceed 5 MB.")
    
    # Validate form fields using the existing Pydantic schema.
    # NOTE: We catch ValidationError explicitly here because FastAPI only
    # auto-handles it for *request-body* models, not manual instantiations.
    try:
        schema = LeaveApplySchema(
            leave_type=leave_type,
            subject=subject,
            description=description,
            from_date=from_date,
            to_date=to_date
        )
    except ValidationError as exc:
        # Extract the first meaningful error message from the Pydantic errors list
        errors = exc.errors()
        messages = []
        for e in errors:
            field = e["loc"][-1] if e.get("loc") else None
            msg = e.get("msg", "Validation error")
            # Strip pydantic's "Value error, " prefix if present
            msg = msg.replace("Value error, ", "")
            if field and field not in ("__root__", "__all__"):
                field_label = {
                    "leave_type": "Leave Type",
                    "subject": "Subject",
                    "description": "Description",
                    "from_date": "Start Date",
                    "to_date": "End Date",
                }.get(str(field), str(field).replace("_", " ").title())
                messages.append(f"{field_label}: {msg}")
            else:
                messages.append(msg)
        raise HTTPException(status_code=400, detail=" | ".join(messages) if messages else "Invalid application data.")
    
    # Save the PDF file to Supabase Storage
    unique_filename = f"{current_user['sub']}_{uuid.uuid4().hex[:8]}_{parent_letter.filename}"
    supabase.storage.from_("parent_letters").upload(
        file=contents,
        path=unique_filename,
        file_options={"content-type": "application/pdf"}
    )
    
    return LeaveService.apply_leave(db, current_user["sub"], schema, attachment_filename=unique_filename)


@router.get("/attachment/view")
def view_attachment_via_token(
    token: str,
    db: Session = Depends(get_db)
):
    """
    PUBLIC endpoint — no Bearer token required.
    Validates the short-lived attachment_token embedded in faculty emails
    and streams the parent's handwritten letter PDF directly to the browser.
    The token is purpose-scoped ('attachment_link') and expires in 3 days,
    so it cannot be reused for any approval/rejection action.
    """
    payload = decode_attachment_token(token)  # raises 400 if invalid/expired
    app_id = payload["app_id"]

    app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not app.attachment_filename:
        raise HTTPException(status_code=404, detail="No parent letter was attached to this application.")

    try:
        file_data = supabase.storage.from_("parent_letters").download(app.attachment_filename)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Attachment file not found on server.")
        
    return Response(
        content=file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Parent_Letter_APP_{app_id}.pdf"'}
    )


@router.get("/{app_id}/attachment")
def get_parent_letter_attachment(
    app_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Serves the uploaded parent's handwritten letter PDF for viewing/downloading."""
    app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if not app.attachment_filename:
        raise HTTPException(status_code=404, detail="No parent letter attached to this application.")
    
    try:
        file_data = supabase.storage.from_("parent_letters").download(app.attachment_filename)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Attachment file not found on server.")
    
    return Response(
        content=file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Parent_Letter_APP_{app_id}.pdf"'}
    )

@router.get("/student/history")
def get_student_history(
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    return LeaveService.get_student_history(db, current_user["sub"])


# --- STAFF ROUTES ---

@router.get("/pending")
def get_pending_applications(
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    # current_user["role"] will be 'FACULTY' (Proctor), 'HOD', or 'WARDEN'
    return LeaveService.get_pending_queue(db, current_user["role"], current_user["sub"])

@router.put("/{app_id}/action")
def process_application(
    app_id: int, 
    action_data: LeaveActionSchema,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    # LeaveService.process_application handles ALL email notifications internally:
    # - Faculty (Proctor) receives actionable email on new submission
    # - HOD receives actionable email after faculty approves
    # - Student receives final status notification on APPROVED or REJECTED
    result = LeaveService.process_application(
        db=db, 
        app_id=app_id, 
        staff_role=current_user["role"], 
        staff_emp_id=current_user["sub"],
        action_data=action_data
    )
    
    return result
    

@router.get("/reviewed")
def get_reviewed_applications(
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    return LeaveService.get_reviewed_history(db, current_user["sub"])


@router.put("/student/applications/{app_id}")
def update_student_application(
    app_id: int,
    schema: LeaveApplySchema,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    return LeaveService.update_application(db, app_id, current_user["sub"], schema)

@router.delete("/student/applications/{app_id}")
def delete_student_application(
    app_id: int,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    return LeaveService.delete_application(db, app_id, current_user["sub"])

@router.get("/{id}/download")
def download_approval_letter(id: int, db: Session = Depends(get_db)):
    # 1. Fetch the application from the database
    app = db.query(LeaveApplication, Student).join(Student).filter(LeaveApplication.application_id == id).first()
    leave_app = app[0]
    student = app[1]

    if not leave_app:
        raise HTTPException(status_code=404, detail="Application not found")
        
    if leave_app.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Cannot download letter for unapproved application")

    # 2. Ensure a directory exists to store the generated letters
    directory = "generated_letters"
    if not os.path.exists(directory):
        os.makedirs(directory)

    file_path = f"{directory}/APP_{id}_Approval.pdf"

    # --- ASSET PATHS ---
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(BASE_DIR, "assets", "university_logo.png")
    stamp_path = os.path.join(BASE_DIR, "assets", "university_stamp.png")

    # 3. Generate compact single-page Official Aditya University Permission Letter
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_margins(18, 8, 18)
    pdf.set_auto_page_break(auto=False)  # We control layout manually for single page

    # =========================================================
    # HEADER â€” [Logo] [ADITYA UNIVERSITY] side by side, centered
    # =========================================================
    header_y = 8  # Start near top
    logo_w = 16
    logo_h = 16
    # Center the logo+text block: logo(16) + gap(2) + text(~78) = ~96mm total
    # Center start = (210 - 96) / 2 â‰ˆ 57
    block_start_x = 57
    text_start_x = block_start_x + logo_w + 2

    if os.path.exists(logo_path):
        pdf.image(logo_path, x=block_start_x, y=header_y, w=logo_w, h=logo_h)

    pdf.set_xy(text_start_x, header_y + 1)
    pdf.set_font("Arial", style="B", size=22)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(80, 14, txt="ADITYA UNIVERSITY", align="L", ln=0)
    pdf.set_y(header_y + logo_h + 2)  # Move below header block

    # Double horizontal rule
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.4)
    r1y = pdf.get_y()
    pdf.line(18, r1y, 192, r1y)
    pdf.ln(0.8)
    pdf.set_line_width(1.0)
    r2y = pdf.get_y()
    pdf.line(18, r2y, 192, r2y)
    pdf.set_line_width(0.3)
    pdf.ln(3)

    # =========================================================
    # DATE (right) + TITLE (center) on compact rows
    # =========================================================
    current_date = date.today().strftime("%d-%m-%Y")
    pdf.set_font("Arial", size=9)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 5, txt=f"Date: {current_date}", align="R", ln=1)
    pdf.ln(1)

    pdf.set_font("Arial", style="BU", size=13)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 6, txt="PERMISSION APPROVAL LETTER", align="C", ln=1)
    pdf.ln(1)

    pdf.set_font("Arial", size=9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, txt=f"Ref. No.: APP-{leave_app.application_id}", ln=1)
    pdf.ln(1)

    # Opening paragraph (single compact line)
    pdf.set_font("Arial", size=9)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(
        0, 5,
        txt=(
            "This is to certify that the following student of Aditya University has been granted permission "
            "as per the details below, duly verified by the respective faculty authority."
        ),
        align="J"
    )
    pdf.ln(10)

    # =========================================================
    # Helper: compact detail row
    # =========================================================
    def detail_row(label, value):
        pdf.set_font("Arial", style="B", size=8.5)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(50, 6, txt=label, ln=0)
        pdf.set_font("Arial", size=8.5)
        pdf.set_text_color(60, 60, 60)
        pdf.cell(4, 6, txt=":", ln=0)
        pdf.multi_cell(0, 6, txt=f" {value}")

    def section_header(title):
        pdf.set_fill_color(15, 23, 42)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", style="B", size=9)
        pdf.cell(0, 7, txt=f"  {title}", ln=1, fill=True)
        pdf.ln(2)

    # =========================================================
    # SECTION 1 â€” STUDENT DETAILS (2-column layout for compactness)
    # =========================================================
    section_header("STUDENT DETAILS")

    # Left column fields
    col_w = 87   # Half of 174mm usable
    col2_x = 18 + col_w

    row_y = pdf.get_y()
    # Left column
    pdf.set_xy(18, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(28, 6, txt="Student Name", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(col_w - 32, 6, txt=f" {student.student_name}", ln=0)

    # Right column
    pdf.set_xy(col2_x, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(22, 6, txt="Roll Number", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(0, 6, txt=f" {leave_app.student_roll_no}", ln=1)

    row_y = pdf.get_y()
    # Left column
    pdf.set_xy(18, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(28, 6, txt="Department", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(col_w - 32, 6, txt=f" {student.department}", ln=0)

    # Right column
    pdf.set_xy(col2_x, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(22, 6, txt="Year / Status", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(0, 6, txt=f" Year {student.year}  |  {'Hosteller' if student.is_hosteller else 'Day Scholar'}", ln=1)

    pdf.ln(10)

    # =========================================================
    # SECTION 2 â€” APPLICATION DETAILS (2-column)
    # =========================================================
    section_header("APPLICATION DETAILS")

    from_str = leave_app.from_date.strftime("%d-%m-%Y") if hasattr(leave_app.from_date, 'strftime') else str(leave_app.from_date)
    to_str = leave_app.to_date.strftime("%d-%m-%Y") if hasattr(leave_app.to_date, 'strftime') else str(leave_app.to_date)

    row_y = pdf.get_y()
    pdf.set_xy(18, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(28, 6, txt="Application ID", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(col_w - 32, 6, txt=f" APP-{leave_app.application_id}", ln=0)

    pdf.set_xy(col2_x, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(22, 6, txt="Type", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(0, 6, txt=f" {leave_app.leave_type}", ln=1)

    row_y = pdf.get_y()
    pdf.set_xy(18, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(28, 6, txt="From Date", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(col_w - 32, 6, txt=f" {from_str}", ln=0)

    pdf.set_xy(col2_x, row_y)
    pdf.set_font("Arial", style="B", size=8.5); pdf.set_text_color(30, 30, 30)
    pdf.cell(22, 6, txt="To Date", ln=0)
    pdf.set_font("Arial", size=8.5); pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.cell(0, 6, txt=f" {to_str}", ln=1)

    detail_row("Subject", leave_app.subject)

    # Description â€” truncate at 120 chars to stay on one page
    desc = leave_app.description
    if len(desc) > 120:
        desc = desc[:117] + "..."
    pdf.set_font("Arial", style="B", size=8.5)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(50, 6, txt="Reason / Description", ln=0)
    pdf.set_font("Arial", size=8.5)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(4, 6, txt=":", ln=0)
    pdf.multi_cell(0, 6, txt=f" {desc}")
    pdf.ln(10)

    # =========================================================
    # SECTION 3 â€” AUTHORITY REMARKS
    # =========================================================
    section_header("AUTHORITY REMARKS")

    proctor_remark = leave_app.proctor_remarks if leave_app.proctor_remarks else "No remarks provided."
    hod_remark = leave_app.hod_remarks if leave_app.hod_remarks else "No remarks provided."
    # Truncate long remarks to keep single page
    if len(proctor_remark) > 110: proctor_remark = proctor_remark[:107] + "..."
    if len(hod_remark) > 110: hod_remark = hod_remark[:107] + "..."

    detail_row("Proctor / Faculty Remarks", proctor_remark)
    detail_row("HOD Remarks", hod_remark)
    pdf.ln(10)

    # =========================================================
    # APPROVAL STATUS BANNER
    # =========================================================
    pdf.set_fill_color(16, 185, 129)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Arial", style="B", size=11)
    pdf.cell(0, 8, txt="STATUS: APPROVED", align="C", ln=1, fill=True)
    pdf.ln(4)

    # =========================================================
    # SIGNATURE + STAMP BLOCK — anchored near bottom of page
    # =========================================================
    pdf.set_y(218)

    sig_y = pdf.get_y()
    stamp_w = 32

    # Stamp on left
    if os.path.exists(stamp_path):
        pdf.image(stamp_path, x=22, y=sig_y, w=stamp_w, h=stamp_w)

    # --- SIGNATURE IMAGE above the underline ---
    sig_path = os.path.join(BASE_DIR, "assets", "hod_signature.png")
    sig_block_x = 120   # left edge of the signature column
    sig_block_w = 68    # width of the signature block

    if os.path.exists(sig_path):
        # Place signature image (auto-height to preserve aspect ratio)
        pdf.image(sig_path, x=sig_block_x + 4, y=sig_y, w=sig_block_w - 8, h=14)

    # Underline beneath the signature image
    sig_line_y = sig_y + 16
    pdf.set_draw_color(30, 30, 30)
    pdf.set_line_width(0.5)
    pdf.line(sig_block_x, sig_line_y, sig_block_x + sig_block_w, sig_line_y)

    # Labels below underline
    pdf.set_xy(sig_block_x, sig_line_y + 2)
    pdf.set_font("Arial", style="B", size=10)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(sig_block_w, 5.5, txt="Head of Department", align="C", ln=1)

    pdf.set_xy(sig_block_x, pdf.get_y())
    pdf.set_font("Arial", size=9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(sig_block_w, 5, txt="Aditya University", align="C", ln=1)

    pdf.set_xy(sig_block_x, pdf.get_y())
    pdf.cell(sig_block_w, 5, txt=f"Dept. of {student.department}", align="C", ln=1)

    # =========================================================
    # FOOTER — anchored to y=275mm (near bottom of A4)
    # =========================================================
    pdf.set_y(275)
    pdf.set_line_width(0.3)
    pdf.set_draw_color(180, 180, 180)
    pdf.line(18, pdf.get_y(), 192, pdf.get_y())
    pdf.ln(1.5)
    pdf.set_font("Arial", style="I", size=7.5)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(
        0, 4,
        txt="System-generated official letter  |  Aditya University Permission Management System  |  Alterations render this document invalid.",
        align="C", ln=1
    )

    # Save the file to disk
    pdf.output(file_path)

    # 4. Return the file to the frontend
    return FileResponse(
        path=file_path,
        filename=f"APP_{id}_Aditya_University_Permission_Letter.pdf",
        media_type='application/pdf'
    )
