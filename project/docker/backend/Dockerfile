FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY backend/r.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
  && pip install --no-cache-dir gunicorn

COPY backend /app
COPY docker/backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DJANGO_SETTINGS_MODULE=backend.settings
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
