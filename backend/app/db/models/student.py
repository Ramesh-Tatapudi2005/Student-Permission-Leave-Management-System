from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base

class Student(Base):
    __tablename__ = "students"

    roll_no = Column(String, primary_key=True)
    student_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    dept_id = Column(Integer)
    year = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())