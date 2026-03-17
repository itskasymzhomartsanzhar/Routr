import json
from datetime import timedelta

from django.contrib.admin import AdminSite
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from .models import Habit, HabitCompletion, Payment, User


class RoutrAdminSite(AdminSite):
    site_header = "Трекер привычек Routr"
    index_title = "Администрирование Telegram Bot Mini App Routr"
    site_url = "https://t.me/Routr_bot"

    def index(self, request, extra_context=None):
        today = timezone.localdate()
        now = timezone.now()
        week_start = today - timedelta(days=6)
        month_start = today - timedelta(days=29)

        total_users = User.objects.count()
        new_users_week = User.objects.filter(date_joined__date__gte=week_start).count()
        active_habits = Habit.objects.filter(
            is_archived=False,
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=today)
        ).count()
        completions_week = HabitCompletion.objects.filter(
            date__gte=week_start, date__lte=today
        ).aggregate(total=Coalesce(Sum("count"), 0))["total"]
        paid_30 = Payment.objects.filter(
            status=Payment.STATUS_PAID,
            paid_at__date__gte=month_start,
        ).count()
        premium_active = User.objects.filter(premium_expiration__gt=now).count()

        chart_days = 14
        chart_start = today - timedelta(days=chart_days - 1)
        labels = [(chart_start + timedelta(days=i)) for i in range(chart_days)]

        users_by_day = {
            row["day"]: row["total"]
            for row in (
                User.objects.filter(date_joined__date__gte=chart_start)
                .annotate(day=TruncDate("date_joined"))
                .values("day")
                .annotate(total=Count("id"))
            )
        }

        habits_by_day = {
            row["day"]: row["total"]
            for row in (
                Habit.objects.filter(created_at__date__gte=chart_start)
                .annotate(day=TruncDate("created_at"))
                .values("day")
                .annotate(total=Count("id"))
            )
        }

        completions_by_day = {
            row["day"]: row["total"]
            for row in (
                HabitCompletion.objects.filter(date__gte=chart_start)
                .annotate(day=TruncDate("date"))
                .values("day")
                .annotate(total=Coalesce(Sum("count"), 0))
            )
        }

        chart_labels = [day.strftime("%d.%m") for day in labels]
        chart_new_users = [int(users_by_day.get(day, 0)) for day in labels]
        chart_new_habits = [int(habits_by_day.get(day, 0)) for day in labels]
        chart_completions = [int(completions_by_day.get(day, 0)) for day in labels]

        context = {
            "kpi": {
                "total_users": total_users,
                "new_users_week": new_users_week,
                "active_habits": active_habits,
                "completions_week": int(completions_week or 0),
                "paid_30": paid_30,
                "premium_active": premium_active,
            },
            "chart_labels": json.dumps(chart_labels),
            "chart_new_users": json.dumps(chart_new_users),
            "chart_new_habits": json.dumps(chart_new_habits),
            "chart_completions": json.dumps(chart_completions),
        }

        extra_context = {**(extra_context or {}), **context}
        return super().index(request, extra_context=extra_context)


admin_site = RoutrAdminSite(name="routr_admin")
