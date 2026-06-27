import secrets
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_current_user, verify_password, get_password_hash
from app.models.user import Student, Faculty, AuthUser, PasswordOTP
from app.schemas.auth import PasswordChangeRequest, OTPVerifyRequest
from app.utils.email import send_otp_email

router = APIRouter(tags=["User Profiles"])

# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------

@router.get("/student/profile")
def get_student_profile(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    student = db.query(Student).filter(Student.roll_no == current_user["sub"]).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    proctor_name = "Not Assigned"
    if student.proctor_id:
        proctor = db.query(Faculty).filter(Faculty.faculty_id == student.proctor_id).first()
        if proctor:
            proctor_name = proctor.faculty_name if hasattr(proctor, 'faculty_name') else proctor_name

    return {
        "name": student.student_name,
        "roll_no": student.roll_no,
        "department": student.department,
        "year": student.year,
        "type": "Hosteller" if student.is_hosteller else "Day Scholar",
        "proctor_name": proctor_name,
    }


@router.get("/staff/profile")
def get_staff_profile(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    staff = db.query(Faculty).filter(Faculty.emp_id == current_user["sub"]).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff profile not found")

    return {
        "name": staff.faculty_name,
        "emp_id": staff.emp_id,
        "department": staff.department,
        "role": staff.role,
    }


# ---------------------------------------------------------------------------
# Password change with OTP verification
# ---------------------------------------------------------------------------

def _get_user_email(db: Session, user_identifier: str, role: str) -> tuple[str, str]:
    """Return (email, display_name) for a given user. Raises 404 if not found."""
    if role == "STUDENT":
        student = db.query(Student).filter(Student.roll_no == user_identifier).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found")
        return student.email, student.student_name
    else:
        faculty = db.query(Faculty).filter(Faculty.emp_id == user_identifier).first()
        if not faculty:
            raise HTTPException(status_code=404, detail="Faculty record not found")
        return faculty.email, faculty.faculty_name


def _mask_email(email: str) -> str:
    """Mask email for display: r***@gmail.com"""
    local, domain = email.split("@", 1)
    return local[0] + "***@" + domain


@router.post("/user/change-password/request-otp")
def request_password_change_otp(
    body: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_identifier = current_user["sub"]
    role = current_user["role"]

    # 1. Verify current password against AuthUser
    auth_user = db.query(AuthUser).filter(AuthUser.user_identifier == user_identifier).first()
    if not auth_user:
        raise HTTPException(status_code=404, detail="Account not found")

    if not verify_password(body.current_password, auth_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # 2. Look up the user's registered email
    email, name = _get_user_email(db, user_identifier, role)

    # 3. Generate a cryptographically secure 6-digit OTP
    otp_code = str(secrets.randbelow(900000) + 100000)  # range 100000–999999
    new_hash = get_password_hash(body.new_password)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)

    # 4. Invalidate any previous OTPs for this user
    db.query(PasswordOTP).filter(
        PasswordOTP.user_identifier == user_identifier,
        PasswordOTP.is_used == False,
    ).delete(synchronize_session=False)

    # 5. Persist the new OTP record (stores the hashed new password for later commit)
    db.add(PasswordOTP(
        user_identifier=user_identifier,
        otp_code=otp_code,
        new_password_hash=new_hash,
        expires_at=expires_at,
    ))
    db.commit()

    # 6. Send OTP email (synchronous — so we can surface delivery errors immediately)
    try:
        send_otp_email(to_email=email, recipient_name=name, otp_code=otp_code)
    except Exception as exc:
        # Roll back the OTP row so the user can retry cleanly
        db.query(PasswordOTP).filter(
            PasswordOTP.user_identifier == user_identifier,
            PasswordOTP.otp_code == otp_code,
        ).delete()
        db.commit()
        raise HTTPException(
            status_code=503,
            detail=f"Failed to send OTP email. Please try again later. ({exc})",
        )

    return {
        "message": "OTP sent to your registered email address",
        "email_hint": _mask_email(email),
    }


@router.post("/user/change-password/verify-otp")
def verify_password_change_otp(
    body: OTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_identifier = current_user["sub"]

    otp_record = (
        db.query(PasswordOTP)
        .filter(
            PasswordOTP.user_identifier == user_identifier,
            PasswordOTP.otp_code == body.otp_code,
            PasswordOTP.is_used == False,
        )
        .first()
    )

    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please check the code and try again.")

    if datetime.datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    # Commit the new password
    auth_user = db.query(AuthUser).filter(AuthUser.user_identifier == user_identifier).first()
    if not auth_user:
        raise HTTPException(status_code=404, detail="Account not found")

    auth_user.password = otp_record.new_password_hash
    auth_user.password_changed_at = datetime.datetime.utcnow()
    otp_record.is_used = True
    db.commit()

    return {"message": "Password changed successfully"}
