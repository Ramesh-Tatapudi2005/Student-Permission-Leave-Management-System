from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from fastapi.responses import Response
from app.db.session import get_db
from app.core.security import get_current_user
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["Master Admin Console"])

# ========================================================================
# INLINE SCHEMAS (Keeps everything safe from ModuleNotFoundErrors)
# ========================================================================

class OverridePayload(BaseModel):
    status: str  # e.g., "APPROVED" or "REJECTED"
    admin_remarks: str

class BulkDeletePayload(BaseModel):
    user_ids: list[str]
class BroadcastPayload(BaseModel):
    title: str
    description: str
class DepartmentPayload(BaseModel):
    name: str
# ========================================================================
# SECURITY GUARD
# ========================================================================

def verify_master_admin(current_user: dict = Depends(get_current_user)):
    """
    Security Guard: Instantly rejects anyone who is not the Master ADMIN.
    Protects all routes in this file.
    """
    if current_user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Master Admin clearance required."
        )
    return current_user

# ========================================================================
# PILLAR 1: IDENTITY & ACCESS MANAGEMENT (IAM) ROUTES
# ========================================================================

@router.get("/users")
def get_network_identities(
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    return AdminService.get_all_users(db)

@router.post("/provision")
def provision_identity(
    payload: dict, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    return AdminService.provision_identity(db, payload)

@router.put("/users/{user_id}")
def update_user_profile(
    user_id: str, 
    payload: dict, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    return AdminService.update_user_profile(db, user_id, payload)

@router.post("/users/{user_id}/reset-password")
def cryptographic_reset(
    user_id: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    return AdminService.cryptographic_reset(db, user_id)

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 1: Hard Delete a single user identity"""
    return AdminService.delete_user(db, user_id)

@router.post("/users/bulk-delete")
def bulk_delete_users_endpoint(
    payload: BulkDeletePayload, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 1: Highly optimized bulk deletion transaction"""
    return AdminService.bulk_delete_users(db, payload.user_ids)

@router.post("/provision/bulk")
def bulk_provision_users(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 1: Bulk CSV Upload Engine"""
    contents = file.file.read()
    return AdminService.bulk_provision_users(db, contents)

# ========================================================================
# PILLAR 3: GLOBAL APPLICATION MATRIX ROUTES
# ========================================================================

@router.get("/applications")
def get_global_applications(
    department: Optional[str] = "ALL", 
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin) 
):
    """Fetches CQRS Read Model data for the Matrix"""
    return AdminService.get_all_applications(db, department)

@router.put("/applications/{app_id}/override")
def override_application(
    app_id: int, 
    payload: OverridePayload, 
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Triggers the COMMAND Service to bypass SLAs and force a status"""
    return AdminService.override_application(db, app_id, payload)


@router.get("/applications/export")
def export_audit_report(
    department: Optional[str] = "ALL", 
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin) 
):
    """Pillar 3: Compliance Exporting"""
    csv_data = AdminService.export_applications_csv(db, department)

    return Response(
        content=csv_data, 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=Compliance_Audit_{department}.csv"}
    )
    
@router.get("/broadcasts/moderation")
def get_moderation_feed(
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 2: Global Moderation Feed - Bypasses all standard announcement logic"""
    return AdminService.get_all_announcements_for_moderation(db)

@router.post("/broadcasts/deploy")
def deploy_master_broadcast(
    payload: BroadcastPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 2: The Master Override Broadcast"""
    return AdminService.deploy_master_broadcast(db, payload.model_dump(), admin["sub"])

@router.delete("/broadcasts/{announcement_id}/kill")
def kill_broadcast(
    announcement_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 2: The Kill Switch"""
    return AdminService.kill_announcement(db, announcement_id)

# ========================================================================
# PILLAR 4: SYSTEM CONFIGURATION & TELEMETRY ROUTES
# ========================================================================

@router.get("/telemetry")
def get_system_telemetry(
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 4: System Health & Usage Metrics"""
    return AdminService.get_system_telemetry(db)

@router.post("/departments")
def add_system_department(
    payload: DepartmentPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_master_admin)
):
    """Pillar 4: Add New Department Config"""
    return AdminService.add_system_department(db, payload.name)