from sqlalchemy import Column, String, Integer, Text, ForeignKey
from app.db.session import Base

class StudentAuth(Base):
    __tablename__ = "student_auth"

    auth_id = Column(Integer, primary_key=True)
    roll_no = Column(String, ForeignKey("students.roll_no"))
    password_hash = Column(Text, nullable=False)
    
    
