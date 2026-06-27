import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import AuthUser, Student, Faculty
from app.core.security import get_password_hash, verify_password, create_access_token

class AuthService:
    
    # --- STUDENT METHODS ---
    @staticmethod
    def register_student(db: Session, schema):
        master_record = db.query(Student).filter(Student.roll_no == schema.roll_no).first()
        if not master_record:
            raise HTTPException(status_code=404, detail="Roll number not found in college database. Contact Admin.")

        existing_auth = db.query(AuthUser).filter(AuthUser.user_identifier == schema.roll_no).first()
        if existing_auth:
            raise HTTPException(status_code=400, detail="User already registered. Please login.")

        new_user = AuthUser(
            user_identifier=schema.roll_no,
            password=get_password_hash(schema.password),
            role="STUDENT"
        )
        db.add(new_user)
        db.commit()
        return {"status": "success", "message": "Registration successful"}

    @staticmethod
    def login_user(db: Session, schema):
        user = db.query(AuthUser).filter(AuthUser.user_identifier == schema.roll_no).first()

        if not user or not verify_password(schema.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid roll number or password")

        user.last_login_at = datetime.datetime.utcnow()
        db.commit()

        profile = db.query(Student).filter(Student.roll_no == user.user_identifier).first()
        token = create_access_token({"sub": user.user_identifier, "role": user.role})

        return {
            "access_token": token,
            "token_type": "bearer",
            "role": user.role,
            "is_hosteller": profile.is_hosteller if profile else False
        }

    # --- FACULTY / STAFF METHODS ---
    @staticmethod
    def register_faculty(db: Session, schema):
        faculty_profile = db.query(Faculty).filter(Faculty.emp_id == schema.emp_id).first()
        if not faculty_profile:
            raise HTTPException(status_code=404, detail="Employee ID not found in college records. Contact Admin.")

        existing_auth = db.query(AuthUser).filter(AuthUser.user_identifier == schema.emp_id).first()
        if existing_auth:
            raise HTTPException(status_code=400, detail="This faculty member is already registered.")

        new_faculty = AuthUser(
            user_identifier=schema.emp_id,
            password=get_password_hash(schema.password),
            role=faculty_profile.role 
        )
        db.add(new_faculty)
        db.commit()
        return {"status": "success", "message": f"Registration successful as {faculty_profile.role}"}

    @staticmethod
    def login_faculty(db: Session, schema):
        user = db.query(AuthUser).filter(AuthUser.user_identifier == schema.emp_id).first()

        if not user or not verify_password(schema.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid Employee ID or password")

        if user.role == "STUDENT":
            raise HTTPException(status_code=403, detail="Access denied. Use Student Login portal.")

        user.last_login_at = datetime.datetime.utcnow()
        db.commit()

        token = create_access_token({"sub": user.user_identifier, "role": user.role})
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": user.role
        }
    
    # --- ADMIN BOOTSTRAP ---
    @staticmethod
    def setup_master_admin(db: Session):
        admin_id = "ADMIN-ROOT"
        
        existing_admin = db.query(AuthUser).filter(AuthUser.user_identifier == admin_id).first()
        if existing_admin:
            return {"message": "Master Admin already exists."}

        # 1. Create Auth Record (FIXED: Uses 'password', not 'password_hash')
        master_admin = AuthUser(
            user_identifier=admin_id,
            password=get_password_hash("Admin@1234"),
            role="ADMIN"
        )
        db.add(master_admin)
        
        # 2. Create the Dummy Profile so profile endpoints don't crash (NEW)
        admin_profile = Faculty(
            emp_id=admin_id,
            faculty_name="System Administrator",
            email="admin@campus.edu",
            department="ALL",
            role="ADMIN"
        )
        db.add(admin_profile)
        
        db.commit()

        return {
            "message": "Master Admin created successfully!",
            "credentials": {"user_id": "ADMIN-ROOT", "password": "Admin@1234"}
        }