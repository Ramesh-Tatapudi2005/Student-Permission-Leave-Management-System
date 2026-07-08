import json
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models.leave import LeaveApplication, LeaveApproval
from app.models.user import Student, Faculty
import redis

# --- NEW IMPORTS FOR EMAILS AND SECURITY ---
from app.workers.leave_tasks import send_leave_notification, send_faculty_action_email
from app.core.security import create_magic_token, decode_magic_token, create_attachment_token
# -------------------------------------------

redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

class LeaveService:
    
    @staticmethod
    def apply_leave(db: Session, student_roll_no: str, schema, attachment_filename: str = None):
        student = db.query(Student).filter(Student.roll_no == student_roll_no).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        initial_stage = "PROCTOR"
        if schema.leave_type == "Outpass" and student.is_hosteller:
            initial_stage = "WARDEN" 
            
        new_app = LeaveApplication(
            student_roll_no=student_roll_no,
            leave_type=schema.leave_type,
            subject=schema.subject,
            description=schema.description,
            from_date=schema.from_date,
            to_date=schema.to_date,
            current_approval_stage=initial_stage,
            status="PENDING",
            attachment_filename=attachment_filename
        )
        
        db.add(new_app)
        db.commit()

        # --- CACHE INVALIDATION ON CREATE ---
        try:
            if initial_stage == "PROCTOR" and student.proctor_id:
                proctor = db.query(Faculty).filter(Faculty.faculty_id == student.proctor_id).first()
                if proctor:
                    redis_client.delete(f"dashboard:queue:FACULTY:{proctor.emp_id}")
            elif initial_stage == "WARDEN":
                pass 
        except Exception as e:
            print(f"Cache invalidation failed, but DB succeeded: {e}")

        # ==========================================================
        # 📧 TRIGGER FACULTY ACTIONABLE EMAIL (MAGIC LINK)
        # ==========================================================
        try:
            if initial_stage == "PROCTOR" and student.proctor_id:
                proctor = db.query(Faculty).filter(Faculty.faculty_id == student.proctor_id).first()
                if proctor and proctor.email:
                    approve_token = create_magic_token({"app_id": new_app.application_id, "faculty_id": proctor.emp_id, "action": "APPROVED"})
                    reject_token  = create_magic_token({"app_id": new_app.application_id, "faculty_id": proctor.emp_id, "action": "REJECTED"})

                    # Build a secure, tokenised link so the proctor can view the PDF
                    # directly from their email client without needing to log in.
                    attachment_url = None
                    if new_app.attachment_filename:
                        import os
                        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
                        att_token = create_attachment_token(new_app.application_id)
                        attachment_url = f"{backend_url}/leaves/attachment/view?token={att_token}"

                    send_faculty_action_email.delay(
                        faculty_email=proctor.email,
                        faculty_name=proctor.faculty_name,
                        student_name=student.student_name,
                        app_id=new_app.application_id,
                        approve_token=approve_token,
                        reject_token=reject_token,
                        leave_type=new_app.leave_type,
                        from_date=str(new_app.from_date),
                        to_date=str(new_app.to_date),
                        reason=f"{new_app.subject} - {new_app.description}",
                        attachment_url=attachment_url,
                    )
        except Exception as e:
            print(f"Warning: Could not queue faculty actionable email. Error: {str(e)}")
        # ==========================================================

        return {"message": "Application submitted successfully", "application_id": new_app.application_id}
    
    
    @staticmethod
    def get_student_history(db: Session, student_roll_no: str):
        return db.query(LeaveApplication).filter(
            LeaveApplication.student_roll_no == student_roll_no
        ).order_by(LeaveApplication.applied_at.desc()).all()
        
    @staticmethod
    def get_pending_queue(db: Session, staff_role: str, staff_emp_id: str):
        cache_key = f"dashboard:queue:{staff_role}:{staff_emp_id}"
        
        cached_queue = redis_client.get(cache_key)
        if cached_queue:
            return json.loads(cached_queue)
        
        target_stage = "PROCTOR" if staff_role == "FACULTY" else staff_role

        query = db.query(
            LeaveApplication.application_id,
            LeaveApplication.student_roll_no,
            LeaveApplication.leave_type,
            LeaveApplication.subject,
            LeaveApplication.description,
            LeaveApplication.from_date,
            LeaveApplication.to_date,
            LeaveApplication.applied_at,
            LeaveApplication.proctor_remarks,  
            LeaveApplication.hod_remarks,      
            LeaveApplication.is_emergency,     
            LeaveApplication.attachment_filename,
            Student.student_name,
            Student.department,
            Student.year
        ).join(Student, LeaveApplication.student_roll_no == Student.roll_no).filter(
            LeaveApplication.status == "PENDING",
            LeaveApplication.current_approval_stage == target_stage
        )
        
        faculty = db.query(Faculty).filter(Faculty.emp_id == staff_emp_id).first()
        
        if faculty:
            if staff_role == "FACULTY":
                query = query.filter(Student.proctor_id == faculty.faculty_id)
            elif staff_role == "HOD":
                query = query.filter(Student.department == faculty.department)

        if staff_role == "WARDEN":
            query = query.filter(Student.is_hosteller == True)

        results = query.all()
        
        formatted_results = [
            {
                "application_id": row.application_id,
                "student_roll_no": row.student_roll_no,
                "leave_type": row.leave_type,
                "subject": row.subject,
                "description": row.description,
                "from_date": str(row.from_date),
                "to_date": str(row.to_date),
                "applied_at": str(row.applied_at), 
                "proctor_remarks": row.proctor_remarks,  
                "hod_remarks": row.hod_remarks,          
                "is_emergency": row.is_emergency,        
                "attachment_filename": row.attachment_filename,
                "student_name": row.student_name,
                "department": row.department,
                "year": row.year
            } for row in results
        ]

        redis_client.setex(cache_key, 300, json.dumps(formatted_results))
        return formatted_results

    @staticmethod
    def process_quick_action(db: Session, token: str, action: str, remarks: str):
        payload = decode_magic_token(token)
        app_id = payload.get("app_id")
        faculty_id = payload.get("faculty_id")
        
        faculty = db.query(Faculty).filter(Faculty.emp_id == faculty_id).first()
        if not faculty:
            raise HTTPException(status_code=404, detail="Faculty member not found.")

        class QuickActionData:
            def __init__(self, action, remarks):
                self.action = action
                self.remarks = remarks
                self.is_override_approval = False
                
        action_data = QuickActionData(action, remarks)
        
        return LeaveService.process_application(
            db=db, 
            app_id=app_id, 
            staff_role=faculty.role,
            staff_emp_id=faculty_id, 
            action_data=action_data
        )

    @staticmethod
    def process_application(db: Session, app_id: int, staff_role: str, staff_emp_id: str, action_data):
        app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id).first()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")

        # Business Rule: Ensure application is still pending overall
        if app.status != "PENDING":
            raise HTTPException(status_code=400, detail="This application has already been processed.")

        # =======================================================
        # SECURITY FIX: PREVENT DOUBLE-CLICKS!
        # Ensure the application is actually waiting for THIS exact role's approval.
        # =======================================================
        target_stage = "PROCTOR" if staff_role == "FACULTY" else staff_role
        if app.current_approval_stage != target_stage:
            raise HTTPException(
                status_code=400, 
                detail="Action Denied: You have already processed this application, or it has been escalated."
            )

        # 1. Create the Audit Trail entry in leave_approvals
        audit_log = LeaveApproval(
            application_id=app.application_id,
            approver_emp_id=staff_emp_id,
            approver_role=staff_role,
            action=action_data.action,
            remarks=action_data.remarks
        )
        db.add(audit_log)

        # 2. Update the main application state
        if staff_role == "FACULTY" and getattr(action_data, 'is_override_approval', False):
            app.is_override_approval = True
            app.is_emergency = True  

        # --- Route remarks to the correct dedicated column ---
        if action_data.remarks:
            if staff_role == "FACULTY":
                app.proctor_remarks = action_data.remarks
            elif staff_role in ["HOD", "WARDEN"]:
                app.hod_remarks = action_data.remarks
        # ----------------------------------------------------------

        if action_data.action == "REJECTED":
            app.status = "REJECTED"
            # State stays wherever it was rejected
            
        elif action_data.action == "APPROVED":
            if staff_role == "FACULTY": 
                app.current_approval_stage = "HOD"
                
                # =======================================================
                # 📧 TRIGGER ACTIONABLE EMAIL TO H.O.D.
                # =======================================================
                try:
                    roll_val = getattr(app, 'student_roll_no', getattr(app, 'roll_no', None))
                    student = db.query(Student).filter(Student.roll_no == roll_val).first()
                    
                    if student:
                        print(f"[SYSTEM] Processing stage escalation for Dept: {student.department}")
                        
                        hod = db.query(Faculty).filter(
                            func.upper(func.trim(Faculty.department)) == func.upper(func.trim(student.department)), 
                            Faculty.role == "HOD"
                        ).first()
                        
                        if hod and hod.email:
                            print(f"[SYSTEM] HOD Match Found: {hod.faculty_name} ({hod.email}). Queuing Email...")
                            approve_token = create_magic_token({"app_id": app.application_id, "faculty_id": hod.emp_id, "action": "APPROVED"})
                            reject_token  = create_magic_token({"app_id": app.application_id, "faculty_id": hod.emp_id, "action": "REJECTED"})

                            # Also give the HOD a direct link to view the parent letter
                            hod_attachment_url = None
                            if app.attachment_filename:
                                import os
                                backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
                                att_token = create_attachment_token(app.application_id)
                                hod_attachment_url = f"{backend_url}/leaves/attachment/view?token={att_token}"

                            send_faculty_action_email.delay(
                                faculty_email=hod.email,
                                faculty_name=hod.faculty_name,
                                student_name=student.student_name,
                                app_id=app.application_id,
                                approve_token=approve_token,
                                reject_token=reject_token,
                                leave_type=app.leave_type,
                                from_date=str(app.from_date),
                                to_date=str(app.to_date),
                                reason=f"{app.subject} - {app.description}",
                                proctor_remarks=app.proctor_remarks or "No remarks provided.",
                                attachment_url=hod_attachment_url,
                            )
                            print(f"[SYSTEM] ✅ HOD Email successfully dispatched to Celery Worker!")
                        else:
                            print(f"[SYSTEM] ⚠️ No HOD profile found for {student.department} department, or email is missing.")
                except Exception as e:
                    print(f"🛑 [CRITICAL ERROR] Could not queue HOD actionable email. Error: {str(e)}")
                # =======================================================

            elif staff_role in ["HOD", "WARDEN"]: 
                app.status = "APPROVED"
                
        db.commit()
        
        # Invalidate Dashboard Cache
        cache_key = f"dashboard:queue:{staff_role}:{staff_emp_id}"
        redis_client.delete(cache_key)

        # =======================================================
        # 📧 TRIGGER THE FINAL NOTIFICATION TO THE STUDENT
        # =======================================================
        if app.status in ["APPROVED", "REJECTED"]:
            try:
                # Safely extract roll number to prevent attribute errors
                roll_val = getattr(app, 'student_roll_no', getattr(app, 'roll_no', None))
                student = db.query(Student).filter(Student.roll_no == roll_val).first()
                
                if student and student.email:
                    send_leave_notification.delay(
                        student_email=student.email,
                        student_name=student.student_name,
                        status=app.status,
                        app_id=app.application_id
                    )
            except Exception as e:
                print(f"Warning: Could not queue student email task for APP-{app.application_id}. Error: {str(e)}")
        # =======================================================

        return {"message": f"Application {action_data.action} successfully"}


    @staticmethod
    def get_reviewed_history(db: Session, staff_emp_id: str):
        return db.query(LeaveApplication).join(LeaveApproval).filter(
            LeaveApproval.approver_emp_id == staff_emp_id
        ).order_by(LeaveApproval.action_time.desc()).all()
        
    
    @staticmethod
    def update_application(db: Session, app_id: int, student_roll_no: str, schema):
        app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id, LeaveApplication.student_roll_no == student_roll_no).first()
        
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
            
        if app.status != "PENDING" or app.current_approval_stage not in ["PROCTOR", "WARDEN"]:
            raise HTTPException(status_code=400, detail="Cannot update an application that is already being processed by higher authorities.")

        app.leave_type = schema.leave_type
        app.subject = schema.subject
        app.description = schema.description
        app.from_date = schema.from_date
        app.to_date = schema.to_date
        db.commit()

        try:
            student = db.query(Student).filter(Student.roll_no == student_roll_no).first()
            if app.current_approval_stage == "PROCTOR" and student.proctor_id:
                proctor = db.query(Faculty).filter(Faculty.faculty_id == student.proctor_id).first()
                if proctor:
                    redis_client.delete(f"dashboard:queue:FACULTY:{proctor.emp_id}")
        except Exception as e:
            pass

        return {"message": "Application updated successfully"}

    @staticmethod
    def delete_application(db: Session, app_id: int, student_roll_no: str):
        app = db.query(LeaveApplication).filter(LeaveApplication.application_id == app_id, LeaveApplication.student_roll_no == student_roll_no).first()
        
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
            
        if app.status != "PENDING" or app.current_approval_stage not in ["PROCTOR", "WARDEN"]:
            raise HTTPException(status_code=400, detail="Cannot delete an application that is already being processed.")

        stage_to_clear = app.current_approval_stage
        
        db.delete(app)
        db.commit()

        try:
            student = db.query(Student).filter(Student.roll_no == student_roll_no).first()
            if stage_to_clear == "PROCTOR" and student.proctor_id:
                proctor = db.query(Faculty).filter(Faculty.faculty_id == student.proctor_id).first()
                if proctor:
                    redis_client.delete(f"dashboard:queue:FACULTY:{proctor.emp_id}")
        except Exception as e:
            pass

        return {"message": "Application deleted successfully"}