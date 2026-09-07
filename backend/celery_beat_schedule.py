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
    # Backfills per-brand sentiment for any answer not yet scored by the
    # current CLASSIFIER_VERSION. Local model, no quota — runs each
    # project's whole backlog to completion every night rather than
    # dripping it, so a version bump or a newly-tracked competitor is fully
    # caught up by the next morning. only_missing keeps a normal night a
    # cheap no-op once the corpus is current.
    #
    # Still scheduled after the fetch job (not concurrently) purely so a
    # night's freshly-fetched answers get classified live during the fetch
    # itself first, and this backfill only ever mops up what's left —
    # nothing here shares a quota with the fetch anymore.
    "daily-reclassify-backfill": {
        "task": "tasks.reclassify_all_projects_task",
        "schedule": crontab(hour=(FETCH_SCHEDULE_HOUR_UTC + 6) % 24, minute=30),
    },
}
