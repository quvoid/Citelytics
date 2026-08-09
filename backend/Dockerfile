FROM python:3.12-slim

WORKDIR /app

# System deps: none needed beyond what pip wheels bring in for this stack
# (fastapi/celery/httpx/supabase are all pure-Python or ship manylinux wheels).

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Same image serves all three roles (api / worker / beat) — the command run
# is chosen per-service in docker-compose.yml, not baked in here.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
