import datetime
import pandas as pd
from io import StringIO
from sqlalchemy.orm import Session
from fastapi import HTTPException

# Models
from app.models.leave import LeaveApplication, LeaveApproval
from app.models.user import Student, Faculty, AuthUser
from app.models.models import Announcement, AnnouncementRead
import redis
# Workers & Security
from app.workers.leave_tasks import send_leave_notification
from app.core.security import get_password_hash

class AdminService:
    
    # ====================================================================
    # PILLAR 1: IDENTITY & ACCESS MANAGEMENT (IAM)
    # ====================================================================
    
    @staticmethod
    def get_all_users(db: Session):
        """Fetches all users and matches Students to their Proctors"""
        students = db.query(Student).all()
        staff = db.query(Faculty).all()
        
        users_list = []
        
        for s in students:
            proctor_emp_id = None
            if s.proctor_id:
                proctor = db.query(Faculty).filter(Faculty.faculty_id == s.proctor_id).first()
                if proctor:
                    proctor_emp_id = proctor.emp_id

            users_list.append({
                "id": s.roll_no, 
                "name": s.student_name, 
                "role": "STUDENT", 
                "department": s.department, 
                "email": s.email,
                "proctor_id": proctor_emp_id,
                "year": s.year
            })
            
        for f in staff:
            users_list.append({
                "id": f.emp_id, 
                "name": f.faculty_name, 
                "role": f.role, 
                "department": f.department, 
                "email": f.email
            })
            
        return {"total_students": len(students), "total_staff": len(staff), "users": users_list}

    @staticmethod
    def provision_identity(db: Session, payload: dict):
        user_id = payload.get("id").upper().strip()
        role = payload.get("role").upper()
        
        if db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first():
            raise HTTPException(status_code=400, detail=f"Identifier {user_id} is already provisioned.")
            
        default_password = "Aditya@123"
        new_auth = AuthUser(
            user_identifier=user_id, 
            password=get_password_hash(default_password), 
            role=role
        )
        db.add(new_auth)
        
        if role == "STUDENT":
            db.add(Student(roll_no=user_id, student_name=payload.get("name"), department=payload.get("department"), email=payload.get("email"), year=int(payload.get("year", 1))))
        else:
            db.add(Faculty(emp_id=user_id, faculty_name=payload.get("name"), department=payload.get("department"), email=payload.get("email"), role=role))
            
        db.commit()
        return {"message": f"Account {user_id} Created successfully.", "temporary_password": default_password}

    @staticmethod
    def update_user_profile(db: Session, user_id: str, payload: dict):
        auth_user = db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first()
        if not auth_user:
            raise HTTPException(status_code=404, detail="User not found.")

        if auth_user.role == "STUDENT":
            student = db.query(Student).filter(Student.roll_no == user_id).first()
            student.department = payload.get("department", student.department)
            frontend_proctor_id = payload.get("proctor_id")
            if frontend_proctor_id:
                proctor = db.query(Faculty).filter(Faculty.emp_id == frontend_proctor_id).first()
                student.proctor_id = proctor.faculty_id if proctor else None
            else:
                student.proctor_id = None
        else:
            faculty = db.query(Faculty).filter(Faculty.emp_id == user_id).first()
            
            new_role = payload.get("role", faculty.role)
            new_dept = payload.get("department", faculty.department)
            
            # --- NEW SMART RBAC LOGIC FOR HOD PROMOTIONS ---
            if new_role == "HOD":
                # 1. Demote the CURRENT HOD of this department back to FACULTY
                current_hod = db.query(Faculty).filter(
                    Faculty.department == new_dept, 
                    Faculty.role == "HOD",
                    Faculty.emp_id != user_id # Don't demote themselves
                ).first()
                
                if current_hod:
                    current_hod.role = "FACULTY"
                    current_hod_auth = db.query(AuthUser).filter(AuthUser.user_identifier == current_hod.emp_id).first()
                    if current_hod_auth:
                        current_hod_auth.role = "FACULTY"
                        
                # 2. Strip proctor assignments from the newly promoted HOD
                proctored_students = db.query(Student).filter(Student.proctor_id == faculty.faculty_id).all()
                for student in proctored_students:
                    student.proctor_id = None # Forces them into "Unassigned" status
            # -----------------------------------------------

            faculty.department = new_dept
            faculty.role = new_role
            auth_user.role = new_role 

        db.commit()
        return {"message": "Profile updated successfully"}

    @staticmethod
    def cryptographic_reset(db: Session, user_id: str):
        """Forces a password reset to a default key"""
        auth_user = db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first()
        if not auth_user:
            raise HTTPException(status_code=404, detail="User not found.")

        new_temp_password = "Aditya@123"
        auth_user.password = get_password_hash(new_temp_password)
        auth_user.password_changed_at = datetime.datetime.utcnow()
        db.commit()
        return {"message": "Reset successful", "new_password": new_temp_password}

    # ====================================================================
    # BULLETPROOF CASCADING DELETION METHODS (SUBQUERIES)
    # ====================================================================

    @staticmethod
    def delete_user(db: Session, user_id: str):
        """Completely purges a single user and their footprint using PostgreSQL Subqueries"""
        auth_user = db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first()
        if not auth_user:
            raise HTTPException(status_code=404, detail="User not found.")

        try:
            # 1. Clear minor connected records
            db.query(AnnouncementRead).filter(AnnouncementRead.user_identifier == user_id).delete(synchronize_session=False)
            
            # 2. Handle Students (Clear Application Approvals, then Applications, then Profile)
            student_apps_subq = db.query(LeaveApplication.application_id).filter(LeaveApplication.student_roll_no == user_id)
            db.query(LeaveApproval).filter(LeaveApproval.application_id.in_(student_apps_subq)).delete(synchronize_session=False)
            db.query(LeaveApplication).filter(LeaveApplication.student_roll_no == user_id).delete(synchronize_session=False)
            db.query(Student).filter(Student.roll_no == user_id).delete(synchronize_session=False)

            # 3. Handle Faculty (Unassign Students, Clear Audit Logs, then Profile)
            faculty_subq = db.query(Faculty.faculty_id).filter(Faculty.emp_id == user_id)
            db.query(Student).filter(Student.proctor_id.in_(faculty_subq)).update({"proctor_id": None}, synchronize_session=False)
            db.query(LeaveApproval).filter(LeaveApproval.approver_emp_id == user_id).delete(synchronize_session=False)
            db.query(Faculty).filter(Faculty.emp_id == user_id).delete(synchronize_session=False)
                
            # 4. Delete the Core Authentication Record
            db.query(AuthUser).filter(AuthUser.user_identifier == user_id).delete(synchronize_session=False)
            
            db.commit()
            return {"message": f"User {user_id} and all associated data purged successfully."}
            
        except Exception as e:
            db.rollback()
            print(f"Deletion Error: {str(e)}")
            # We pass the exact DB error string to React so it is visible in the Toast UI if it ever fails
            raise HTTPException(
                status_code=400, 
                detail=f"Database Integrity Blocked Deletion: {str(e)}"
            )

    @staticmethod
    def bulk_delete_users(db: Session, user_ids: list[str]):
        """Enterprise Bulk Deletion: Deletes multiple users and their footprints safely"""
        try:
            # 1. Clear minor connected records
            db.query(AnnouncementRead).filter(AnnouncementRead.user_identifier.in_(user_ids)).delete(synchronize_session=False)
            
            # 2. Handle Students (Clear Applications & App Approvals)
            app_ids = [app.application_id for app in db.query(LeaveApplication.application_id).filter(LeaveApplication.student_roll_no.in_(user_ids)).all()]
            if app_ids:
                db.query(LeaveApproval).filter(LeaveApproval.application_id.in_(app_ids)).delete(synchronize_session=False)
            db.query(LeaveApplication).filter(LeaveApplication.student_roll_no.in_(user_ids)).delete(synchronize_session=False)
            
            # 3. Handle Faculty (Clear Audit Logs & Unassign Mentorships)
            faculty_ids = [f.faculty_id for f in db.query(Faculty.faculty_id).filter(Faculty.emp_id.in_(user_ids)).all()]
            if faculty_ids:
                db.query(Student).filter(Student.proctor_id.in_(faculty_ids)).update({"proctor_id": None}, synchronize_session=False)
            db.query(LeaveApproval).filter(LeaveApproval.approver_emp_id.in_(user_ids)).delete(synchronize_session=False)

            # 4. Delete from Profile tables
            db.query(Student).filter(Student.roll_no.in_(user_ids)).delete(synchronize_session=False)
            db.query(Faculty).filter(Faculty.emp_id.in_(user_ids)).delete(synchronize_session=False)
            
            # 5. Delete from Auth table
            db.query(AuthUser).filter(AuthUser.user_identifier.in_(user_ids)).delete(synchronize_session=False)
            
            db.commit()
            return {"message": f"Successfully purged {len(user_ids)} identities and their associated records."}
        except Exception as e:
            db.rollback()
            print(f"Bulk Deletion Error: {str(e)}")
            raise HTTPException(
                status_code=400, 
                detail="Cannot bulk delete. A database integrity error prevented deletion."
            )

    @staticmethod
    def bulk_provision_users(db: Session, file_contents: bytes):
        """Processes a CSV upload to create bulk accounts"""
        df = pd.read_csv(StringIO(file_contents.decode('utf-8')))
        success_count = 0
        
        for _, row in df.iterrows():
            user_id = str(row['id']).strip().upper()
            
            if db.query(AuthUser).filter(AuthUser.user_identifier == user_id).first():
                continue
                
            role = str(row['role']).strip().upper()
            new_auth = AuthUser(user_identifier=user_id, password=get_password_hash("Welcome@123"), role=role)
            db.add(new_auth)
            
            if role == "STUDENT":
                year_val = int(row['year']) if 'year' in df.columns and pd.notna(row['year']) else 1
                db.add(Student(
                    roll_no=user_id, 
                    student_name=row['name'], 
                    department=row['department'], 
                    email=row['email'],
                    year=year_val
                ))
            else:
                db.add(Faculty(
                    emp_id=user_id, 
                    faculty_name=row['name'], 
                    department=row['department'], 
                    email=row['email'], 
                    role=role
                ))
                
            success_count += 1
            
        db.commit()
        return {"message": f"Successfully imported {success_count} user's details."}

    # ====================================================================
    # PILLAR 3: GLOBAL APPLICATION MATRIX
    # ====================================================================
    
    @staticmethod
    def get_all_applications(db: Session, department: str):
        """CQRS Read Model: Fetches all applications with bulletproof error handling"""
        try:
            # We explicitly query the columns, including ALL fields needed by the React modal
            query = db.query(
                LeaveApplication.application_id,
                LeaveApplication.student_roll_no,
                LeaveApplication.leave_type,
                LeaveApplication.subject,
                LeaveApplication.description,
                LeaveApplication.from_date,
                LeaveApplication.to_date,
                LeaveApplication.status,
                LeaveApplication.current_approval_stage,
                LeaveApplication.applied_at,
                LeaveApplication.proctor_remarks,
                LeaveApplication.hod_remarks,
                LeaveApplication.is_emergency,
                Student.student_name,
                Student.department,
                Student.year
            ).join(Student, LeaveApplication.student_roll_no == Student.roll_no)
            
            if department and department != "ALL":
                query = query.filter(Student.department == department)
                
            results = query.order_by(LeaveApplication.application_id.desc()).all()
            
            # Format identical to how the frontend expects it
            applications = [
                {
                    "application_id": row.application_id,
                    "roll_no": row.student_roll_no,
                    "student_name": row.student_name,
                    "department": row.department,
                    "year": row.year,
                    "leave_type": row.leave_type,
                    "subject": row.subject,
                    "description": row.description,
                    "from_date": str(row.from_date),
                    "to_date": str(row.to_date),
                    "status": row.status,
                    "current_stage": row.current_approval_stage,
                    "applied_at": str(row.applied_at) if row.applied_at else None,
                    "proctor_remarks": row.proctor_remarks,
                    "hod_remarks": row.hod_remarks,
                    "is_emergency": row.is_emergency
                } for row in results
            ]
            
            return {"applications": applications}
            
        except Exception as e:
            # If the database fails, print the exact reason to the terminal!
            print(f"🛑 CRITICAL DB ERROR IN ADMIN GET_ALL_APPS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database Fetch Error: {str(e)}")

    @staticmethod
    def override_application(db: Session, app_id: int, payload):
        """Force Admin Override using exact column names"""
        app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id).first()
        
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
            
        # Pydantic safety extraction
        new_status = payload.status
        admin_remarks = payload.admin_remarks
        
        app.status = new_status
        app.current_approval_stage = "ADMIN_OVERRIDE"
        app.description = f"{app.description}\n\n[ADMIN OVERRIDE]: {admin_remarks}"
        
        db.commit()
        
        # Attempt to flush Redis caches
        try:
            r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            for key in r.scan_iter("dashboard:queue:*"):
                r.delete(key)
        except Exception:
            pass

        student = db.query(Student).filter(Student.roll_no == app.student_roll_no).first()
        if student:
            try:
                send_leave_notification.delay(
                    student_email=student.email,
                    student_name=student.student_name,
                    status=new_status,
                    app_id=app_id
                )
            except Exception:
                pass

        return {"status": "success", "message": f"Application forcefully marked as {new_status}."}
    
    @staticmethod
    def export_applications_csv(db: Session, department: str):
        """Generates a raw CSV audit report of all applications with Excel-safe formatting"""
        matrix_data = AdminService.get_all_applications(db, department)
        applications = matrix_data.get("applications", [])
        
        if not applications:
            raise HTTPException(status_code=404, detail="No applications found to export.")

        df = pd.DataFrame(applications)
        
        df = df[["application_id", "roll_no", "student_name", "department", "leave_type", "from_date", "to_date", "status", "current_stage"]]
        df.columns = ["App ID", "Roll Number", "Student Name", "Department", "Type", "Start Date", "End Date", "Status", "Current Stage"]
        
        # Convert to 'DD-MMM-YYYY' and append an invisible trailing space to prevent Excel error
        df["Start Date"] = pd.to_datetime(df["Start Date"]).dt.strftime('%d-%b-%Y') + " "
        df["End Date"] = pd.to_datetime(df["End Date"]).dt.strftime('%d-%b-%Y') + " "
        
        stream = StringIO()
        df.to_csv(stream, index=False)
        return stream.getvalue()

    # ====================================================================
    # PILLAR 2: GLOBAL COMMUNICATIONS OVERRIDE
    # ====================================================================

    @staticmethod
    def get_all_announcements_for_moderation(db: Session):
        """Fetches every announcement across the campus for the Admin Kill Switch feed"""
        announcements = db.query(Announcement).order_by(Announcement.created_at.desc()).all()
        result = []
        for ann in announcements:
            result.append({
                "announcement_id": ann.announcement_id,
                "title": ann.title,
                "description": ann.description,
                "posted_by": ann.posted_by,
                "posted_role": ann.posted_role,
                "target_role": ann.target_role,
                "target_dept": ann.target_dept,
                "priority_level": ann.priority_level,
                "status": ann.status,
                "created_at": str(ann.created_at)
            })
        return {"announcements": result}

    @staticmethod
    def deploy_master_broadcast(db: Session, payload: dict, admin_identifier: str):
        """Deploys a System-Level Emergency Broadcast"""
        new_broadcast = Announcement(
            title=payload.get("title", "SYSTEM OVERRIDE"),
            description=payload.get("description", "Emergency broadcast initiated by System Admin."),
            posted_by=admin_identifier,
            posted_role="ADMIN",
            target_role="ALL",
            target_dept="ALL",
            priority_level="EMERGENCY",
            status="PUBLISHED"
        )
        db.add(new_broadcast)
        db.commit()
        db.refresh(new_broadcast)
        
        return {
            "status": "success", 
            "message": "Emergency broadcast deployed to all active terminals.", 
            "announcement_id": new_broadcast.announcement_id
        }

    @staticmethod
    def kill_announcement(db: Session, announcement_id: int):
        """The Kill Switch: Instantly deletes an announcement and clears caches"""
        ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
        if not ann:
            raise HTTPException(status_code=404, detail="Announcement not found")
        
        db.delete(ann)
        db.commit()
        
        try:
            r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            for key in r.scan_iter("announcements:*"):
                r.delete(key)
        except Exception:
            pass 
            
        return {"status": "success", "message": "Broadcast permanently purged from the network."}

    # ====================================================================
    # PILLAR 4: SYSTEM CONFIGURATION & TELEMETRY
    # ====================================================================

    @staticmethod
    def get_system_telemetry(db: Session):
        """Fetches live administrative and business metrics from the PostgreSQL Database"""
        total_students_db = db.query(Student).count()
        registered_students = db.query(AuthUser).filter(AuthUser.role == "STUDENT").count()
        total_apps = db.query(LeaveApplication).count()
        approved_apps = db.query(LeaveApplication).filter(LeaveApplication.status == "APPROVED").count()
        rejected_apps = db.query(LeaveApplication).filter(LeaveApplication.status == "REJECTED").count()
        
        return {
            "status": "OPERATIONAL",
            "total_students_db": total_students_db,
            "registered_students": registered_students,
            "total_applications": total_apps,
            "approved_applications": approved_apps,
            "rejected_applications": rejected_apps
        }

    @staticmethod
    def add_system_department(db: Session, department_name: str):
        department_name = department_name.upper().strip()
        if len(department_name) < 2:
            raise HTTPException(status_code=400, detail="Department name is too short.")
            
        return {
            "status": "success", 
            "message": f"Department '{department_name}' has been successfully registered to the network registry."
        }