from fastapi import FastAPI
from contextlib import asynccontextmanager
import redis.asyncio as redis
from fastapi_limiter import FastAPILimiter
import asyncio
from app.api.v1 import auth, dashboard, leaves, users, announcements,admin
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import engine, Base
from app.models.user import AuthUser, Student, Faculty, PasswordOTP
from app.models.leave import LeaveApplication, LeaveApproval
from app.models.models import Announcement, AnnouncementAttachment, AnnouncementRead, AnnouncementReply
from app.utils.redis_pubsub import redis_pubsub

Base.metadata.create_all(bind=engine)

import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connects to the Redis DB using the environment variable
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_connection = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    await FastAPILimiter.init(redis_connection)
    print("✅ Rate Limiter Initialized via Redis")
    
    # 📢 START NEW CODE: Initialize and spin up the real-time announcement listener
    await redis_pubsub.connect()
    listener_task = asyncio.create_task(redis_pubsub.start_listener())
    print("📢 Real-time Announcement Listener Started")
    # 📢 END NEW CODE
    
    yield # The app runs while inside this yield
    
    # Cleanup when shutting down
    # 📢 START NEW CODE: Cleanly cancel and teardown the listener background thread
    listener_task.cancel()
    await asyncio.gather(listener_task, return_exceptions=True)
    print("🛑 Real-time Announcement Listener Stopped")
    # 📢 END NEW CODE
    
    await redis_connection.close()
    
app = FastAPI(title="University Portal API", lifespan=lifespan)

origins = [
    "http://localhost:5173",  # Your React Frontend
    "http://127.0.0.1:5173",  # Alternate localhost mapping
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,    # Allows requests from the React app
    allow_credentials=True,   # Allows cookies/auth headers
    allow_methods=["*"],      # Allows all methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],      # Allows all headers
)

# Include Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(leaves.router, prefix="/leaves")
app.include_router(users.router)
app.include_router(announcements.announcements_router)
app.include_router(admin.router, prefix="/api/v1", tags=["Admin"])

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "university-backend"}