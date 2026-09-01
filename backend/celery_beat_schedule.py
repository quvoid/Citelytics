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
    # Drips the per-brand sentiment backfill a few answers at a time.
    #
    # Gemini's free tier allows ~20 classifier calls per DAY, so a corpus of
    # any size cannot be re-scored in one run — it has to accumulate. This is
    # resumable by construction (only_missing skips anything already scored by
    # the current CLASSIFIER_VERSION), so it simply converges over several
    # days and then becomes a no-op until the version is bumped.
    #
    # Deliberately several hours after the fetch job: both share the same
    # Gemini quota, and the live fetch must always win that race.
    "daily-reclassify-backfill": {
        "task": "tasks.reclassify_all_projects_task",
        "schedule": crontab(hour=(FETCH_SCHEDULE_HOUR_UTC + 6) % 24, minute=30),
    },
}
