from sqlalchemy import Column, String, Integer, ForeignKey
from app.db.session import Base

class Faculty(Base):
    __tablename__ = "faculty"

    faculty_id = Column(Integer, primary_key=True, index=True)
    faculty_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String)
    role = Column(String)  # This will store 'proctor', 'hod', or 'warden'
    dept_id = Column(Integer, ForeignKey("departments.dept_id"))
    
    # Industry Note: Since the schema doesn't show a separate faculty_auth table,
    # we include the password_hash directly here for simplicity and efficiency.
    password_hash = Column(String, nullable=False)