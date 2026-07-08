import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings

# This tells FastAPI where your login endpoint is so it knows how to find the Bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_password_hash(password: str) -> str:
    """
    Hashes a plain-text password using bcrypt.
    """
    # Convert password string to bytes
    pwd_bytes = password.encode('utf-8')
    # Generate a salt and hash the password
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    # Return as a string for database storage
    return hashed_password.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain-text password against a hashed password.
    """
    # Convert both to bytes for bcrypt comparison
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    # Check compatibility
    return bcrypt.checkpw(password_bytes, hashed_bytes)

def create_access_token(data: dict):
    """
    Generates a JWT access token.
    """
    to_encode = data.copy()
    # Use timezone-aware UTC for modern standards
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    
    # Ensure settings.SECRET_KEY and settings.ALGORITHM are used
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Decodes the JWT token and returns the current user's data.
    Acts as a dependency for protected routes.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode the token using your existing settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        
        # If the token is valid but missing critical data, reject it
        if user_id is None or role is None:
            raise credentials_exception
            
        # Return the user data as a dictionary so the router can use it
        return {
            "sub": user_id,
            "role": role
        }
        
    except JWTError as e:
        # If the token is expired or tampered with, reject it
        print(f"🛑 SECURITY LOG: JWT Verification Failed! Reason: {str(e)}")
        raise credentials_exception
    
def create_magic_token(data: dict):
    """Creates a secure, short-lived token for email approve/reject buttons"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=3) # Link expires in 3 days
    to_encode.update({"exp": expire, "type": "magic_link"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_magic_token(token: str):
    """Securely decodes the email approve/reject token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "magic_link":
            raise HTTPException(status_code=400, detail="Invalid token type.")
        return payload
    except JWTError:
        raise HTTPException(status_code=400, detail="This action link has expired or is invalid.")


def create_attachment_token(app_id: int) -> str:
    """
    Creates a secure, short-lived, read-only token that allows faculty to
    view the parent's letter PDF directly from their email — no login required.
    The token is purpose-scoped to 'attachment_link' so it cannot be reused
    for any approve/reject action.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=3)
    payload = {
        "app_id": app_id,
        "type": "attachment_link",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_attachment_token(token: str) -> dict:
    """Decodes and validates an attachment view token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "attachment_link":
            raise HTTPException(status_code=400, detail="Invalid token type for attachment access.")
        if "app_id" not in payload:
            raise HTTPException(status_code=400, detail="Malformed attachment token.")
        return payload
    except JWTError:
        raise HTTPException(status_code=400, detail="Attachment link has expired or is invalid. Please request a new email.")