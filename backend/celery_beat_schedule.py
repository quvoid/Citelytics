from celery.schedules import crontab

from config import FETCH_SCHEDULE_HOUR_UTC

# Daily while testing against free-tier engines — comment below applies once
# the real (paid) engine APIs are swapped in.
#
# Production note: move this to `crontab(day_of_week=1, hour=FETCH_SCHEDULE_HOUR_UTC,
# minute=0)` (weekly) once Perplexity/OpenAI/Grok/DataForSEO are wired in —
# daily is only safe against Gemini/OpenRouter's free-tier rate limits.
BEAT_SCHEDULE = {
    "daily-fetch-all-projects": {
        "task": "tasks.enqueue_all_projects_fetch",
        "schedule": crontab(hour=FETCH_SCHEDULE_HOUR_UTC, minute=0),
    },
}
