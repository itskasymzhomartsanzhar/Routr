from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django_redis import get_redis_connection

from api.models import User, XpTransaction


class Command(BaseCommand):
    help = "Aggregate weekly XP from Redis into XpTransaction records."

    def add_arguments(self, parser):
        parser.add_argument("--week-start", type=str)
        parser.add_argument("--keep", action="store_true")

    def handle(self, *args, **options):
        if options.get("week_start"):
            week_start = date.fromisoformat(options["week_start"])
        else:
            today = timezone.localdate()
            week_start = today - timedelta(days=today.weekday()) - timedelta(days=7)

        week_end = week_start + timedelta(days=6)
        redis = get_redis_connection("default")
        key = f"xp:week:{week_start.isoformat()}"

        raw = redis.zrange(key, 0, -1, withscores=True)
        if not raw:
            self.stdout.write("No weekly XP data found.")
            return

        user_ids = [int(item[0]) for item in raw]
        users = User.objects.filter(id__in=user_ids)
        user_map = {u.id: u for u in users}

        for member, score in raw:
            user_id = int(member)
            if user_id not in user_map:
                continue
            XpTransaction.objects.update_or_create(
                user_id=user_id,
                week_start=week_start,
                defaults={
                    "week_end": week_end,
                    "xp": int(score),
                },
            )

        if not options.get("keep"):
            redis.delete(key)

        self.stdout.write(f"Aggregated weekly XP for {week_start.isoformat()} to {week_end.isoformat()}.")
