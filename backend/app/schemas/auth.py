import re
from pydantic import BaseModel, Field, field_validator
from typing import Optional

_PASSWORD_RE = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#^])[A-Za-z\d@$!%*?&_\-#^]{8,128}$'
)
_ROLL_NO_RE = re.compile(r'^[A-Z0-9]{4,20}$')
_EMP_ID_RE = re.compile(r'^[A-Z0-9\-]{3,20}$')


def _check_password_strength(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError('Password is required')
    if len(v) < 8:
        raise ValueError('Password must be at least 8 characters long')
    if len(v) > 128:
        raise ValueError('Password must not exceed 128 characters')
    if not _PASSWORD_RE.match(v):
        raise ValueError(
            'Password must contain at least one uppercase letter, one lowercase letter, '
            'one digit, and one special character (@$!%*?&_-#^)'
        )
    return v


class UserRegister(BaseModel):
    roll_no: str = Field(..., min_length=4, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str

    @field_validator('roll_no')
    @classmethod
    def validate_roll_no(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError('Roll number is required')
        if not _ROLL_NO_RE.match(v):
            raise ValueError(
                'Roll number must be 4–20 alphanumeric characters (no spaces or special characters)'
            )
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password_strength(v)

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v


class UserLogin(BaseModel):
    roll_no: str = Field(..., min_length=1, max_length=20)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator('roll_no')
    @classmethod
    def sanitize_roll_no(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError('Roll number is required')
        return v

    @field_validator('password')
    @classmethod
    def sanitize_password(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Password is required')
        return v


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    is_hosteller: bool


class FacultyRegister(BaseModel):
    emp_id: str = Field(..., min_length=3, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str

    @field_validator('emp_id')
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError('Employee ID is required')
        if not _EMP_ID_RE.match(v):
            raise ValueError(
                'Employee ID must be 3–20 alphanumeric characters (hyphens allowed, no spaces)'
            )
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password_strength(v)

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v


class FacultyLogin(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=20)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator('emp_id')
    @classmethod
    def sanitize_emp_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError('Employee ID is required')
        return v

    @field_validator('password')
    @classmethod
    def sanitize_password(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Password is required')
        return v


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str

    @field_validator('current_password')
    @classmethod
    def validate_current(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Current password is required')
        return v

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v: str, info) -> str:
        v = _check_password_strength(v)
        if 'current_password' in info.data and v == info.data['current_password']:
            raise ValueError('New password must differ from the current password')
        return v

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'new_password' in info.data and v != info.data['new_password']:
            raise ValueError('Passwords do not match')
        return v


class OTPVerifyRequest(BaseModel):
    otp_code: str = Field(..., min_length=6, max_length=6)

    @field_validator('otp_code')
    @classmethod
    def validate_otp(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError('OTP must contain exactly 6 digits')
        return v
