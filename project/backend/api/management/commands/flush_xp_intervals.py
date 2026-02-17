from django.core.management.base import BaseCommand

from api.views import _flush_pending_xp_to_db, _get_redis


class Command(BaseCommand):
    help = "Flush pending XP from Redis into 3-hour interval DB transactions."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Flush immediately, ignoring 3-hour interval.")

    def handle(self, *args, **options):
        redis = _get_redis()
        if not redis:
            self.stdout.write("Redis is not available.")
            return

        try:
            created = _flush_pending_xp_to_db(redis, force=bool(options.get("force")))
        except Exception as exc:
            self.stderr.write(f"Flush failed: {exc}")
            return

        if created:
            self.stdout.write("XP intervals flushed successfully.")
        else:
            self.stdout.write("No flush required (interval not reached or no pending XP).")
