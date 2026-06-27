from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import date
from typing import Optional, Literal


class LeaveApplySchema(BaseModel):
    leave_type: Literal['Leave', 'Outpass', 'Other']
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=2000)
    from_date: date
    to_date: date

    @field_validator('subject')
    @classmethod
    def validate_subject(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Subject is required')
        return v

    @field_validator('description')
    @classmethod
    def validate_description(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Description is required')
        return v

    @field_validator('from_date')
    @classmethod
    def from_date_not_past(cls, v: date) -> date:
        if v < date.today():
            raise ValueError('Start date cannot be in the past')
        return v

    @model_validator(mode='after')
    def date_range_valid(self) -> 'LeaveApplySchema':
        if self.from_date and self.to_date and self.to_date < self.from_date:
            raise ValueError('End date must be on or after the start date')
        return self


class LeaveActionSchema(BaseModel):
    action: Literal['APPROVED', 'REJECTED']
    remarks: Optional[str] = Field(None, max_length=500)
    is_override_approval: Optional[bool] = False

    @field_validator('remarks')
    @classmethod
    def validate_remarks(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            return v or None
        return v
