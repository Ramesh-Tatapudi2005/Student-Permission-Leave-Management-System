from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from ...db.session import get_db  # Assuming you put session logic here
from app.schemas.auth import UserRegister, UserLogin, Token, FacultyLogin, FacultyRegister
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    return AuthService.register_student(db, payload)

@router.post("/login")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    return AuthService.login_user(db, payload)

@router.post("/register/faculty", status_code=status.HTTP_201_CREATED)
def register_faculty(payload: FacultyRegister, db: Session = Depends(get_db)):
    return AuthService.register_faculty(db, payload)

@router.post("/login/faculty")
def login_faculty(payload: FacultyLogin, db: Session = Depends(get_db)):
    return AuthService.login_faculty(db, payload)

# ==========================================
# MASTER ADMIN BOOTSTRAP (RUN ONCE)
# ==========================================
@router.post("/setup-master-admin")
def setup_master_admin(db: Session = Depends(get_db)):
    """
    Run this endpoint ONCE via Swagger UI to create the Root Admin.
    """
    return AuthService.setup_master_admin(db)