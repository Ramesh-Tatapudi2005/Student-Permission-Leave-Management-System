from fastapi import Depends, HTTPException, status
from jose import jwt, JWTError
from app.core.config import settings
from fastapi.security import OAuth2PasswordBearer

# This tells FastAPI where to look for the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user_id(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        return user_id
    except JWTError:
        raise credentials_exception