from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import Student, Faculty
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/student")
def get_student_dashboard(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.roll_no == user_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile records missing.")
        
    return {
        "student_name": student.student_name,
        "is_hosteller": student.is_hosteller,
        "ui_schema": "HOSTEL_LAYOUT" if student.is_hosteller else "DAY_SCHOLAR_LAYOUT"
    }

@router.get("/faculty")
def get_faculty_dashboard(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.emp_id == user_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty record profile missing.")

    dashboard_payload = {
        "name": faculty.faculty_name,
        "department": faculty.department,
        "assigned_role": faculty.role,
        "permitted_actions": []
    }

    # Industry Rule: Dynamically inject schema metadata depending on role context
    if faculty.role == "FACULTY":
        dashboard_payload["ui_schema"] = "PROCTOR_DASHBOARD"
        dashboard_payload["permitted_actions"] = ["view_proctor_students", "approve_stage_1"]
        
    elif faculty.role == "HOD":
        dashboard_payload["ui_schema"] = "HOD_DASHBOARD"
        dashboard_payload["permitted_actions"] = ["view_department_analytics", "override_approvals", "broadcast_announcements"]
        
    elif faculty.role == "WARDEN":
        dashboard_payload["ui_schema"] = "WARDEN_DASHBOARD"
        dashboard_payload["permitted_actions"] = ["manage_hostel_leaves", "track_gate_logs", "emergency_outpass"]
        
    elif faculty.role == "PRINCIPAL":
        dashboard_payload["ui_schema"] = "PRINCIPAL_ADMIN_DASHBOARD"
        dashboard_payload["permitted_actions"] = ["college_wide_analytics", "system_configurations", "final_escalations"]

    return dashboard_payload