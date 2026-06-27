from celery import Celery

# 1. Initialize Celery
# We tell it to use RabbitMQ as the broker (message queue) 
# and Redis as the backend (to store task success/failure states)
celery_app = Celery(
    "university_worker",
    broker="amqp://guest:guest@rabbitmq:5672//",
    backend="redis://redis:6379/0",
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