from celery import Celery

from celery_beat_schedule import BEAT_SCHEDULE
from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery_app = Celery(
    "citelytics",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Upstash free tier is a shared, rate-limited endpoint — keep the worker
    # from hammering it with a large prefetch window.
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)

# Loaded by `celery -A celery_app beat`.
celery_app.conf.beat_schedule = BEAT_SCHEDULE
