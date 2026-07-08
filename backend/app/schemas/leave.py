from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import date, timedelta
from typing import Optional, Literal


# ─── Industry-level constants ────────────────────────────────────────────────
MAX_ADVANCE_DAYS = 90    # Cannot apply more than 90 days in the future
MAX_DURATION_DAYS = 30   # Single application cannot exceed 30 calendar days
MIN_NOTICE_DAYS = 1      # Must apply at least 1 day before the start date
# ─────────────────────────────────────────────────────────────────────────────


class LeaveApplySchema(BaseModel):
    leave_type: Literal['Leave', 'Outpass', 'Other']
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=2000)
    from_date: date
    to_date: date

    # ── Text field sanitisers ──────────────────────────────────────────────

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

    # ── Date field validators ──────────────────────────────────────────────

    @field_validator('from_date')
    @classmethod
    def validate_from_date(cls, v: date) -> date:
        today = date.today()

        # Rule 1: Cannot be in the past
        if v < today:
            raise ValueError('Start date cannot be in the past')

        # Rule 2: Must have at least MIN_NOTICE_DAYS advance notice
        earliest_allowed = today + timedelta(days=MIN_NOTICE_DAYS)
        if v < earliest_allowed:
            raise ValueError(
                f'Applications must be submitted at least {MIN_NOTICE_DAYS} day(s) in advance. '
                f'Earliest allowed start date is {earliest_allowed.strftime("%d %b %Y")}'
            )

        # Rule 3: Cannot be more than MAX_ADVANCE_DAYS in the future
        max_future = today + timedelta(days=MAX_ADVANCE_DAYS)
        if v > max_future:
            raise ValueError(
                f'Start date cannot be more than {MAX_ADVANCE_DAYS} days from today. '
                f'Latest allowed start date is {max_future.strftime("%d %b %Y")}'
            )

        return v

    @field_validator('to_date')
    @classmethod
    def validate_to_date(cls, v: date) -> date:
        today = date.today()

        # Rule 4: End date cannot be in the past
        if v < today:
            raise ValueError('End date cannot be in the past')

        # Rule 5: End date cannot be more than MAX_ADVANCE_DAYS + MAX_DURATION_DAYS in the future
        hard_ceiling = today + timedelta(days=MAX_ADVANCE_DAYS + MAX_DURATION_DAYS)
        if v > hard_ceiling:
            raise ValueError(f'End date is too far in the future')

        return v

    # ── Cross-field / model-level validators ──────────────────────────────

    @model_validator(mode='after')
    def validate_date_range(self) -> 'LeaveApplySchema':
        fd = self.from_date
        td = self.to_date

        if fd is None or td is None:
            return self

        # Rule 6: End date must be on or after start date
        if td < fd:
            raise ValueError('End date must be on or after the start date')

        # Rule 7: Duration must not exceed MAX_DURATION_DAYS
        duration = (td - fd).days + 1  # inclusive count
        if duration > MAX_DURATION_DAYS:
            raise ValueError(
                f'The leave duration ({duration} days) exceeds the maximum allowed '
                f'{MAX_DURATION_DAYS} days per application. Please split into separate requests.'
            )

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
