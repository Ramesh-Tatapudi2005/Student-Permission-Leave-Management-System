from celery import Celery

import os

# 1. Initialize Celery
# We read the broker and backend URLs from environment variables, 
# defaulting to the local docker-compose URLs for local development.
BROKER_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672//")
BACKEND_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "university_worker",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["app.workers.leave_tasks", "app.workers.announcement_tasks"]
)

# 2. Optional: Configure basic settings
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
)