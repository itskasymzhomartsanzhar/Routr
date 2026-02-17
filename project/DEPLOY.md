# Deploy (staging)

## Staging compose

1. Create `.env` from `.env.example` and fill values.
2. Build and start:

```sh
docker compose up --build -d
```

Services:
- Nginx: `http://<host>/`
- Backend: proxied under `/v1/` and `/admin/`
- Media: `/media/`
- Static: `/static/`

## Back to development

```sh
docker compose -f docker-compose.dev.yml up --build
```

Dev ports:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

