import hashlib
import hmac
import json
import logging
import math
import re
import uuid
import requests
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from urllib.parse import parse_qsl, unquote, parse_qs

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Case, Count, Exists, F, IntegerField, OuterRef, Prefetch, Q, Sum, When
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django_redis import get_redis_connection
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from backend.webapp_auth import WebAppAuth, AuthError as WebAppAuthError
from .models import (
    Category,
    Habit,
    HabitCopy,
    HabitCompletion,
    HabitShare,
    Payment,
    Product,
    Quest,
    Title,
    User,
    UserQuest,
    XpIntervalTransaction,
)
from .serializers import (
    CategorySerializer,
    HabitSerializer,
    PaymentSerializer,
    ProductSerializer,
    QuestSerializer,
    TelegramAuthSerializer,
    TitleSerializer,
    UserSerializer,
)
from .robokassa import (
    RobokassaError,
    create_invoice_link_with_meta,
    format_out_sum,
    verify_result_signature,
    verify_success_signature,
)

logger = logging.getLogger(__name__)

class AuthError(Exception):
    def __init__(self, message, detail, status_code):
        super().__init__(message)
        self.message = message
        self.detail = detail
        self.status = status_code


XP_BASE = 10
PREMIUM_XP_MULTIPLIER = 1.3
LEADERBOARD_CACHE_TTL_SECONDS = 60 * 5
LEADERBOARD_DEFAULT_LIMIT = 10
LEADERBOARD_MAX_LIMIT = 100
XP_FLUSH_INTERVAL_SECONDS = 60 * 60 * 3
XP_FLUSH_LOCK_TTL_SECONDS = 120
XP_FLUSH_LOCK_KEY = "xp:flush:lock"
XP_BUCKET_KEY_PREFIX = "xp:bucket:3h:"
XP_BUCKET_TTL_SECONDS = 60 * 60 * 24 * 45
XP_BUCKET_KEY_RE = re.compile(r"^xp:bucket:3h:(\d+)$")
XP_PENDING_PERIOD_BUCKET_PREFIX = "xp:pending:{range}:bucket:"
XP_PENDING_PERIOD_INDEX_KEY = "xp:pending:{range}:index"
XP_PENDING_USER_TOTAL_KEY = "xp:pending:user:{user_id}:total"


def _notify_telegram_payment_success(*, telegram_id: int | None, product_name: str) -> None:
    if not telegram_id or not settings.BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": int(telegram_id),
        "text": f"Оплата успешно подтверждена.\nПакет: {product_name}",
    }
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as exc:
        logger.warning(
            "Failed to send payment success Telegram message: telegram_id=%s error=%s",
            telegram_id,
            exc,
        )


def _telegram_send_message(*, chat_id: int, text: str, reply_markup: dict | None = None) -> dict:
    if not settings.BOT_TOKEN:
        raise ValidationError({"detail": "BOT_TOKEN is not configured"})
    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    payload: dict = {
        "chat_id": int(chat_id),
        "text": text,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        response = requests.post(url, json=payload, timeout=8)
        data = response.json() if response.content else {}
    except Exception as exc:
        raise ValidationError({"detail": f"Failed to send Telegram message: {exc}"}) from exc
    if not response.ok or not data.get("ok"):
        description = data.get("description") or f"HTTP {response.status_code}"
        raise ValidationError({"detail": f"Telegram sendMessage failed: {description}"})
    return data


def _telegram_edit_message(*, chat_id: int, message_id: int, text: str, reply_markup: dict | None = None) -> None:
    if not settings.BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/editMessageText"
    payload: dict = {
        "chat_id": int(chat_id),
        "message_id": int(message_id),
        "text": text,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        response = requests.post(url, json=payload, timeout=8)
        data = response.json() if response.content else {}
    except Exception as exc:
        logger.warning("Failed to edit Telegram message: chat_id=%s message_id=%s error=%s", chat_id, message_id, exc)
        return
    if not response.ok or not data.get("ok"):
        description = data.get("description") or f"HTTP {response.status_code}"
        logger.warning("Telegram editMessageText failed: chat_id=%s message_id=%s error=%s", chat_id, message_id, description)


def _parse_name_count(name: str) -> int:
    match = re.search(r"(\d+)\s*шт", name, re.IGNORECASE)
    if match:
        return max(int(match.group(1)), 1)
    return 1


def _normalize_product_name(name: str) -> str:
    return re.sub(r"<[^>]+>", "", name or "").strip()


def _apply_payment_product_effects(user: User, product: Product, now: datetime) -> dict:
    name = _normalize_product_name(product.name).lower()
    effects: dict = {}
    update_fields: list[str] = []

    product_extra_habits = int(product.extra_habit_slots or 0)
    if product_extra_habits <= 0 and "дополнительная привычка" in name:
        product_extra_habits = _parse_name_count(name)

    if product_extra_habits > 0:
        user.extra_habit_slots = int(user.extra_habit_slots or 0) + product_extra_habits
        update_fields.append("extra_habit_slots")
        effects["extra_habit_slots"] = product_extra_habits

    product_shields = int(product.streak_shields or 0)
    if product_shields <= 0 and "щит" in name and "streak" in name:
        product_shields = _parse_name_count(name)

    if product_shields > 0:
        user.streak_shields = int(user.streak_shields or 0) + product_shields
        update_fields.append("streak_shields")
        effects["streak_shields"] = product_shields

    multiplier = float(product.xp_multiplier or 1.0)
    if multiplier <= 1.0 and "бустер xp" in name:
        multiplier_match = re.search(r"[×x]\s*([0-9]+(?:[.,][0-9]+)?)", name)
        if multiplier_match:
            raw_multiplier = multiplier_match.group(1).replace(",", ".")
            try:
                multiplier = float(raw_multiplier)
            except ValueError:
                multiplier = 1.0

    duration_days = int(product.duration_days or 0)
    if duration_days <= 0 and (product.is_premium or "premium" in name or "премиум" in name):
        duration_days = 30
    if multiplier > 1 and duration_days > 0:
        current_multiplier = float(user.xp_boost_multiplier or 1)
        current_expires = user.xp_boost_expires_at
        active = bool(current_expires and current_expires > now)
        base = current_expires if active else now
        if multiplier >= current_multiplier:
            user.xp_boost_multiplier = multiplier
        user.xp_boost_expires_at = base + timedelta(days=duration_days)
        update_fields.extend(["xp_boost_multiplier", "xp_boost_expires_at"])
        effects["xp_boost_multiplier"] = float(user.xp_boost_multiplier)
        effects["xp_boost_expires_at"] = user.xp_boost_expires_at.isoformat() if user.xp_boost_expires_at else None

    is_premium_product = bool(product.is_premium)
    if not is_premium_product and ("premium" in name or "премиум" in name):
        is_premium_product = True

    if is_premium_product and duration_days > 0:
        base = user.premium_expiration if user.premium_expiration and user.premium_expiration > now else now
        user.premium_expiration = base + timedelta(days=duration_days)
        update_fields.append("premium_expiration")
        effects["premium_days"] = duration_days

    if update_fields:
        user.save(update_fields=list(sorted(set(update_fields))))
    return effects


def _format_payment_effects(product: Product, effects: dict) -> str:
    lines = []
    if effects.get("premium_days"):
        lines.append(f"Премиум: +{effects['premium_days']} дн.")
    if effects.get("xp_boost_multiplier"):
        lines.append(f"Бустер XP: ×{effects['xp_boost_multiplier']}")
    if effects.get("extra_habit_slots"):
        lines.append(f"Доп. привычки: +{effects['extra_habit_slots']}")
    if effects.get("streak_shields"):
        lines.append(f"Щиты стрика: +{effects['streak_shields']}")
    if not lines:
        lines.append("Покупка активирована")
    return "\n".join(lines)


def _get_week_start(target_date: date) -> date:
    return target_date - timedelta(days=target_date.weekday())


def _is_premium_active(user: User) -> bool:
    return bool(user.premium_expiration and user.premium_expiration > timezone.now())


def _get_streak_multiplier(streak_days: int) -> float:
    if streak_days >= 20:
        return 2.0
    if streak_days >= 7:
        return 1.5
    if streak_days >= 3:
        return 1.3
    return 1.0


def _get_daily_cap(habits_count: int) -> int:
    if habits_count <= 2:
        return 50
    if habits_count <= 4:
        return 75
    return 100


def _xp_for_level(level: int) -> int:
    return int(8.5 * (1.05 ** (level - 1)))


def _level_from_total_xp(total_xp: int) -> int:
    level = 1
    required_sum = 0
    while True:
        required = _xp_for_level(level)
        if total_xp < required_sum + required:
            return level
        required_sum += required
        level += 1


def _resolve_title(user: User) -> Title | None:
    if user.current_title_id:
        is_premium = bool(user.premium_expiration and user.premium_expiration > timezone.now())
        if user.current_title.requires_premium and not is_premium:
            return _sync_user_title(user, save=True)
        return user.current_title
    return _sync_user_title(user, save=True)


def _has_completed_all_group_quests(user: User, group_code: str) -> bool:
    required_ids = list(Quest.objects.filter(is_active=True, group=group_code).values_list("id", flat=True))
    if not required_ids:
        return True
    completed_count = UserQuest.objects.filter(user=user, quest_id__in=required_ids).count()
    return completed_count == len(required_ids)


def _determine_user_title(user: User) -> Title | None:
    is_premium = bool(user.premium_expiration and user.premium_expiration > timezone.now())
    titles_qs = Title.objects.all().order_by("order")
    if not is_premium:
        titles_qs = titles_qs.filter(requires_premium=False)
    titles = list(titles_qs)
    if not titles:
        return None

    level = user.level or 1
    current = titles[0]
    for next_title in titles[1:]:
        can_level_up = level > current.level_max
        if not can_level_up:
            break
        if not _has_completed_all_group_quests(user, current.code):
            break
        current = next_title
    return current


def _sync_user_title(user: User, *, save: bool = True) -> Title | None:
    target = _determine_user_title(user)
    target_id = target.id if target else None
    if user.current_title_id != target_id:
        user.current_title = target
        if save:
            user.save(update_fields=["current_title"])
    return target


def _get_stats_days_limit(user: User) -> int:
    title = _resolve_title(user)
    if not title:
        return 30
    try:
        value = int((title.privileges or {}).get("stats_days", 30))
    except (TypeError, ValueError):
        return 30
    return max(value, 1)


def _calculate_streak_days(user: User, target_date: date) -> int:
    start_date = target_date - timedelta(days=60)
    dates = set(
        HabitCompletion.objects.filter(
            habit__owner=user,
            date__range=(start_date, target_date),
            count__gte=F("habit__goal"),
        ).values_list("date", flat=True)
    )
    streak = 0
    cursor = target_date
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _calculate_habit_streak(habit: Habit, target_date: date) -> int:
    start_date = target_date - timedelta(days=60)
    dates = set(
        HabitCompletion.objects.filter(
            habit=habit,
            date__range=(start_date, target_date),
            count__gte=F("habit__goal"),
        ).values_list("date", flat=True)
    )
    streak = 0
    cursor = target_date
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _habit_streak_from_cached_fields(habit: Habit, target_date: date, completed_today: bool) -> int:
    last_date = habit.streak_last_date
    cached = int(habit.streak_current or 0)
    if not completed_today:
        if last_date == target_date:
            return cached
        return 0
    if last_date == target_date:
        return cached
    if last_date == target_date - timedelta(days=1):
        return cached + 1
    return 1


def _get_habit_streak_days_cached(habit: Habit, target_date: date) -> int:
    if target_date != timezone.localdate():
        return _calculate_habit_streak(habit, target_date)

    _rollup_habit_stats(habit, target_date)
    completion = HabitCompletion.objects.filter(habit=habit, date=target_date).only("count").first()
    completed_today = bool(completion and completion.count >= max(habit.goal, 1))
    return _habit_streak_from_cached_fields(habit, target_date, completed_today)


def _get_user_streak_days_cached(user: User, target_date: date) -> int:
    if target_date != timezone.localdate():
        return _calculate_streak_days(user, target_date)

    _rollup_user_habit_stats(user, target_date)
    habits = list(
        Habit.objects.filter(owner=user).only(
            "id",
            "goal",
            "streak_current",
            "streak_last_date",
        )
    )
    if not habits:
        return 0
    completion_map = {
        item["habit_id"]: int(item["count"] or 0)
        for item in HabitCompletion.objects.filter(
            habit__owner=user,
            date=target_date,
        ).values("habit_id", "count")
    }
    max_streak = 0
    for habit in habits:
        completed_today = completion_map.get(habit.id, 0) >= max(habit.goal, 1)
        streak = _habit_streak_from_cached_fields(habit, target_date, completed_today)
        if streak > max_streak:
            max_streak = streak
    return max_streak


def _rebuild_habit_stats(habit: Habit, today: date | None = None) -> None:
    today = today or timezone.localdate()
    yesterday = today - timedelta(days=1)
    rows = HabitCompletion.objects.filter(
        habit=habit,
        date__lt=today,
    ).values("date", "count")
    counts_by_date = {item["date"]: int(item["count"] or 0) for item in rows}
    if counts_by_date:
        start_date = min(counts_by_date.keys())
    else:
        start_date = None

    total = 0
    current = 0
    best = 0
    last_completed = None
    user = habit.owner
    used_shields = 0
    if start_date:
        cursor = start_date
        goal = max(habit.goal, 1)
        while cursor <= yesterday:
            count = counts_by_date.get(cursor, 0)
            total += count
            if count >= goal:
                if last_completed and cursor == last_completed + timedelta(days=1):
                    current += 1
                else:
                    current = 1
                last_completed = cursor
                best = max(best, current)
            else:
                if current > 0 and last_completed and cursor == last_completed + timedelta(days=1):
                    available = int(user.streak_shields or 0) - used_shields
                    if available > 0:
                        used_shields += 1
                        last_completed = cursor
                        cursor += timedelta(days=1)
                        continue
                current = 0
            cursor += timedelta(days=1)

    habit.completed_total = total
    habit.streak_current = current
    habit.streak_best = best
    habit.streak_last_date = last_completed
    habit.stats_rollup_date = yesterday
    habit.save(update_fields=[
        "completed_total",
        "streak_current",
        "streak_best",
        "streak_last_date",
        "stats_rollup_date",
    ])
    if used_shields:
        user.streak_shields = max(int(user.streak_shields or 0) - used_shields, 0)
        user.save(update_fields=["streak_shields"])


def _rollup_habit_stats(habit: Habit, today: date | None = None) -> None:
    today = today or timezone.localdate()
    yesterday = today - timedelta(days=1)
    rollup_date = habit.stats_rollup_date
    if rollup_date is None:
        _rebuild_habit_stats(habit, today)
        return

    start_date = rollup_date + timedelta(days=1)
    if start_date > yesterday:
        return

    rows = HabitCompletion.objects.filter(
        habit=habit,
        date__gte=start_date,
        date__lte=yesterday,
    ).values("date", "count")
    counts_by_date = {item["date"]: int(item["count"] or 0) for item in rows}

    total = int(habit.completed_total or 0)
    current = int(habit.streak_current or 0)
    best = int(habit.streak_best or 0)
    last_completed = habit.streak_last_date
    user = habit.owner
    used_shields = 0
    goal = max(habit.goal, 1)
    cursor = start_date
    while cursor <= yesterday:
        count = counts_by_date.get(cursor, 0)
        total += count
        if count >= goal:
            if last_completed and cursor == last_completed + timedelta(days=1):
                current += 1
            else:
                current = 1
            last_completed = cursor
            best = max(best, current)
        else:
            if current > 0 and last_completed and cursor == last_completed + timedelta(days=1):
                available = int(user.streak_shields or 0) - used_shields
                if available > 0:
                    used_shields += 1
                    last_completed = cursor
                    cursor += timedelta(days=1)
                    continue
            current = 0
        cursor += timedelta(days=1)

    habit.completed_total = total
    habit.streak_current = current
    habit.streak_best = best
    habit.streak_last_date = last_completed
    habit.stats_rollup_date = yesterday
    habit.save(update_fields=[
        "completed_total",
        "streak_current",
        "streak_best",
        "streak_last_date",
        "stats_rollup_date",
    ])
    if used_shields:
        user.streak_shields = max(int(user.streak_shields or 0) - used_shields, 0)
        user.save(update_fields=["streak_shields"])


def _rollup_user_habit_stats(user: User, today: date | None = None) -> None:
    today = today or timezone.localdate()
    habits = Habit.objects.filter(owner=user).only(
        "id",
        "goal",
        "completed_total",
        "streak_current",
        "streak_best",
        "streak_last_date",
        "stats_rollup_date",
    )
    for habit in habits:
        _rollup_habit_stats(habit, today)


def _get_redis():
    try:
        redis = get_redis_connection("default")
        redis.ping()
        return redis
    except Exception:
        return None


def _cache_get_safe(key: str):
    try:
        return cache.get(key)
    except Exception:
        return None


def _cache_set_safe(key: str, value, timeout: int) -> None:
    try:
        cache.set(key, value, timeout=timeout)
    except Exception:
        return


def _int_from_redis(value, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _scan_keys(redis, pattern: str) -> list[str]:
    keys: list[str] = []
    cursor = 0
    while True:
        cursor, batch = redis.scan(cursor=cursor, match=pattern, count=500)
        if batch:
            for key in batch:
                if isinstance(key, bytes):
                    keys.append(key.decode("utf-8"))
                else:
                    keys.append(str(key))
        if cursor == 0:
            break
    return keys


def _current_3h_interval_start(now_dt: datetime) -> datetime:
    base = now_dt.astimezone(dt_timezone.utc)
    hour = base.hour - (base.hour % 3)
    return base.replace(hour=hour, minute=0, second=0, microsecond=0)


def _bucket_key_for_start(interval_start: datetime) -> str:
    return f"{XP_BUCKET_KEY_PREFIX}{int(interval_start.timestamp())}"


def _bucket_start_from_key(key: str) -> datetime | None:
    match = XP_BUCKET_KEY_RE.match(key)
    if not match:
        return None
    try:
        ts = int(match.group(1))
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(ts, tz=dt_timezone.utc)


def _pending_period_bucket_key(range_key: str, bucket_start: datetime) -> str:
    return XP_PENDING_PERIOD_BUCKET_PREFIX.format(range=range_key) + str(int(bucket_start.timestamp()))


def _pending_period_index_key(range_key: str) -> str:
    return XP_PENDING_PERIOD_INDEX_KEY.format(range=range_key)


def _pending_user_total_key(user_id: int) -> str:
    return XP_PENDING_USER_TOTAL_KEY.format(user_id=int(user_id))


def _pending_period_bucket_keys_in_window(redis, range_key: str, start_dt: datetime, end_dt: datetime) -> list[str]:
    index_key = _pending_period_index_key(range_key)
    start_score = int(start_dt.timestamp())
    end_score = int(end_dt.timestamp()) - 1
    if end_score < start_score:
        return []
    members = redis.zrangebyscore(index_key, start_score, end_score)
    keys: list[str] = []
    for member in members:
        if isinstance(member, bytes):
            member = member.decode("utf-8")
        member_str = str(member)
        if not member_str.isdigit():
            continue
        keys.append(XP_PENDING_PERIOD_BUCKET_PREFIX.format(range=range_key) + member_str)
    return keys


def _incr_pending_user_total(redis, user_id: int, delta: int) -> None:
    if delta == 0:
        return
    key = _pending_user_total_key(user_id)
    script = """
    local current = tonumber(redis.call('get', KEYS[1]) or '0')
    local delta = tonumber(ARGV[1])
    local ttl = tonumber(ARGV[2])
    local next = current + delta
    if next < 0 then
        next = 0
    end
    redis.call('set', KEYS[1], next)
    redis.call('expire', KEYS[1], ttl)
    return next
    """
    redis.eval(script, 1, key, int(delta), XP_BUCKET_TTL_SECONDS)


def _persist_interval_xp_without_redis(user_id: int, awarded: int, now_dt: datetime | None = None) -> None:
    if awarded <= 0:
        return
    now_dt = now_dt or timezone.now()
    interval_start = _current_3h_interval_start(now_dt)
    interval_end = interval_start + timedelta(hours=3)
    updated = XpIntervalTransaction.objects.filter(
        user_id=user_id,
        period_start=interval_start,
    ).update(
        xp=F("xp") + awarded,
        period_end=interval_end,
    )
    if updated:
        return
    XpIntervalTransaction.objects.create(
        user_id=user_id,
        period_start=interval_start,
        period_end=interval_end,
        xp=awarded,
    )
    User.objects.filter(id=user_id).update(xp=F("xp") + awarded)
    u = User.objects.filter(id=user_id).first()
    if u:
        new_level = _level_from_total_xp(int(u.xp or 0))
        if int(u.level or 1) != new_level:
            u.level = new_level
            u.save(update_fields=["level"])
        _sync_user_title(u, save=True)


def _flush_pending_xp_to_db(redis, *, force: bool = False) -> bool:
    lock_token = str(uuid.uuid4())
    lock_ok = redis.set(XP_FLUSH_LOCK_KEY, lock_token, nx=True, ex=XP_FLUSH_LOCK_TTL_SECONDS)
    if not lock_ok:
        return False

    try:
        now_dt = timezone.now().astimezone(dt_timezone.utc)
        current_bucket_start = _current_3h_interval_start(now_dt)
        candidate_keys = _scan_keys(redis, f"{XP_BUCKET_KEY_PREFIX}*")
        if not candidate_keys:
            return False

        ordered_keys: list[tuple[str, datetime]] = []
        for key in candidate_keys:
            bucket_start = _bucket_start_from_key(key)
            if not bucket_start:
                continue
            if not force and bucket_start >= current_bucket_start:
                continue
            ordered_keys.append((key, bucket_start))
        ordered_keys.sort(key=lambda pair: pair[1])
        if not ordered_keys:
            return False

        user_increments: dict[int, int] = {}
        tx_to_create: list[XpIntervalTransaction] = []
        for key, bucket_start in ordered_keys:
            raw = redis.hgetall(key) or {}
            if not raw:
                continue
            period_end = bucket_start + timedelta(hours=3)
            for user_id_raw, xp_raw in raw.items():
                user_id = _int_from_redis(user_id_raw)
                xp_value = _int_from_redis(xp_raw)
                if user_id <= 0 or xp_value <= 0:
                    continue
                tx_to_create.append(
                    XpIntervalTransaction(
                        user_id=user_id,
                        period_start=bucket_start,
                        period_end=period_end,
                        xp=xp_value,
                    )
                )
                user_increments[user_id] = user_increments.get(user_id, 0) + xp_value

        if tx_to_create:
            XpIntervalTransaction.objects.bulk_create(tx_to_create, ignore_conflicts=True)
        if user_increments:
            for user_id, delta in user_increments.items():
                User.objects.filter(id=user_id).update(xp=F("xp") + delta)
            affected = list(User.objects.filter(id__in=user_increments.keys()))
            for u in affected:
                new_level = _level_from_total_xp(int(u.xp or 0))
                if int(u.level or 1) != new_level:
                    u.level = new_level
                    u.save(update_fields=["level"])
                _sync_user_title(u, save=True)

        if ordered_keys:
            flushed_stamps = [str(int(bucket_start.timestamp())) for _, bucket_start in ordered_keys]
            delete_keys = [key for key, _ in ordered_keys]
            delete_keys.extend([XP_PENDING_PERIOD_BUCKET_PREFIX.format(range="week") + stamp for stamp in flushed_stamps])
            delete_keys.extend([XP_PENDING_PERIOD_BUCKET_PREFIX.format(range="month") + stamp for stamp in flushed_stamps])
            redis.delete(*delete_keys)
            if flushed_stamps:
                redis.zrem(_pending_period_index_key("week"), *flushed_stamps)
                redis.zrem(_pending_period_index_key("month"), *flushed_stamps)
        if user_increments:
            for user_id, delta in user_increments.items():
                _incr_pending_user_total(redis, user_id, -int(delta))
        return bool(tx_to_create)
    finally:
        current = redis.get(XP_FLUSH_LOCK_KEY)
        if current and isinstance(current, bytes):
            current = current.decode("utf-8")
        if current == lock_token:
            redis.delete(XP_FLUSH_LOCK_KEY)


def _maybe_flush_pending_xp(redis) -> None:
    try:
        _flush_pending_xp_to_db(redis, force=False)
    except Exception:
        return


def _register_pending_xp(redis, user_id: int, awarded: int, event_dt: datetime | None = None) -> None:
    if awarded <= 0:
        return
    event_dt = event_dt or timezone.now()
    bucket_start = _current_3h_interval_start(event_dt)
    bucket_key = _bucket_key_for_start(bucket_start)
    bucket_ts = int(bucket_start.timestamp())
    redis.hincrby(bucket_key, user_id, awarded)
    redis.expire(bucket_key, XP_BUCKET_TTL_SECONDS)
    for range_key in ("week", "month"):
        period_bucket_key = _pending_period_bucket_key(range_key, bucket_start)
        period_index_key = _pending_period_index_key(range_key)
        redis.zincrby(period_bucket_key, int(awarded), str(int(user_id)))
        redis.expire(period_bucket_key, XP_BUCKET_TTL_SECONDS)
        redis.zadd(period_index_key, {str(bucket_ts): bucket_ts})
        redis.expire(period_index_key, XP_BUCKET_TTL_SECONDS)
    _incr_pending_user_total(redis, int(user_id), int(awarded))


def _redis_incr_with_cap(redis, key: str, amount: int, cap: int, ttl: int) -> int:
    if amount <= 0:
        return 0
    script = """
    local current = tonumber(redis.call('get', KEYS[1]) or '0')
    local cap = tonumber(ARGV[1])
    local inc = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])
    local available = cap - current
    if available <= 0 then
        return 0
    end
    if inc > available then
        inc = available
    end
    redis.call('incrby', KEYS[1], inc)
    redis.call('expire', KEYS[1], ttl)
    return inc
    """
    return int(redis.eval(script, 1, key, cap, amount, ttl))


def _cache_incr_with_cap(key: str, amount: int, cap: int, ttl: int) -> int:
    if amount <= 0:
        return 0
    current = _cache_get_safe(key)
    current_value = int(current) if isinstance(current, int) else _int_from_redis(current, 0)
    available = cap - current_value
    if available <= 0:
        return 0
    inc = amount if amount <= available else available
    _cache_set_safe(key, current_value + inc, timeout=ttl)
    return int(inc)


def _daily_ttl(target_date: date) -> int:
    tz = timezone.get_current_timezone()
    end_of_day = datetime.combine(target_date + timedelta(days=1), time.min).replace(tzinfo=tz)
    ttl = int((end_of_day + timedelta(hours=6) - timezone.now()).total_seconds())
    return max(ttl, 3600)


def _award_xp(user: User, base_xp: int, target_date: date, habits_count: int) -> int:
    if base_xp <= 0:
        return 0

    cap = _get_daily_cap(habits_count)
    redis = _get_redis()
    day_key = f"xp:day:{user.id}:{target_date.isoformat()}"
    ttl = _daily_ttl(target_date)

    if redis:
        try:
            base_applied = _redis_incr_with_cap(redis, day_key, base_xp, cap, ttl)
        except Exception:
            base_applied = _cache_incr_with_cap(day_key, base_xp, cap, ttl)
    else:
        base_applied = _cache_incr_with_cap(day_key, base_xp, cap, ttl)

    if base_applied <= 0:
        return 0

    now = timezone.now()
    is_premium = bool(user.premium_expiration and user.premium_expiration > now)
    boost_multiplier = 1.0
    if user.xp_boost_expires_at and user.xp_boost_expires_at > now:
        boost_multiplier = float(user.xp_boost_multiplier or 1.0)

    awarded = base_applied
    if is_premium:
        awarded = int(round(awarded * PREMIUM_XP_MULTIPLIER))
    if boost_multiplier > 1:
        awarded = int(round(awarded * boost_multiplier))

    grant_key = f"xp:grant:{uuid.uuid4()}"
    grant_payload = {
        "user_id": user.id,
        "date": target_date.isoformat(),
        "xp": awarded,
        "base_xp": base_applied,
        "created_at": timezone.now().isoformat(),
    }

    if redis:
        try:
            _register_pending_xp(redis, user.id, awarded, event_dt=timezone.now())
            _maybe_flush_pending_xp(redis)
        except Exception:
            _persist_interval_xp_without_redis(user.id, awarded)
    else:
        _persist_interval_xp_without_redis(user.id, awarded)

    _cache_set_safe(grant_key, grant_payload, timeout=60 * 60 * 3)

    return awarded


def _period_bounds(range_key: str, now_dt: datetime | None = None) -> tuple[datetime, datetime] | None:
    now_dt = (now_dt or timezone.now()).astimezone(dt_timezone.utc)
    if range_key == "week":
        return now_dt - timedelta(hours=168), now_dt
    if range_key == "month":
        return now_dt - timedelta(hours=720), now_dt
    return None


def _get_pending_period_map(redis, range_key: str, target_date: date) -> dict[int, int]:
    if not redis:
        return {}
    bounds = _period_bounds(range_key)
    if not bounds:
        return {}
    start_dt, end_dt = bounds
    result: dict[int, int] = {}
    try:
        keys = _pending_period_bucket_keys_in_window(redis, range_key, start_dt, end_dt)
        if keys:
            for key in keys:
                raw = redis.zrange(key, 0, -1, withscores=True) or []
                for user_id_raw, xp_raw in raw:
                    user_id = _int_from_redis(user_id_raw)
                    xp_value = int(xp_raw or 0)
                    if user_id <= 0 or xp_value <= 0:
                        continue
                    result[user_id] = result.get(user_id, 0) + xp_value
            return result

        legacy_keys = _scan_keys(redis, f"{XP_BUCKET_KEY_PREFIX}*")
        for key in legacy_keys:
            bucket_start = _bucket_start_from_key(key)
            if not bucket_start:
                continue
            if bucket_start < start_dt or bucket_start >= end_dt:
                continue
            raw = redis.hgetall(key) or {}
            for user_id_raw, xp_raw in raw.items():
                user_id = _int_from_redis(user_id_raw)
                xp_value = _int_from_redis(xp_raw)
                if user_id <= 0 or xp_value <= 0:
                    continue
                result[user_id] = result.get(user_id, 0) + xp_value
    except Exception:
        return {}
    return result


def _get_db_period_scores_map(range_key: str, target_date: date) -> dict[int, int]:
    bounds = _period_bounds(range_key)
    if not bounds:
        return {}
    start_dt, end_dt = bounds
    rows = (
        XpIntervalTransaction.objects.filter(
            period_start__gte=start_dt,
            period_start__lt=end_dt,
        )
        .values("user_id")
        .annotate(total=Sum("xp"))
    )
    return {int(row["user_id"]): int(row["total"] or 0) for row in rows}


def _get_user_period_xp(user: User, range_key: str, target_date: date) -> int:
    if range_key not in {"week", "month"}:
        return int(user.xp or 0)
    redis = _get_redis()
    if redis:
        _maybe_flush_pending_xp(redis)
    db_scores = _get_db_period_scores_map(range_key, target_date)
    pending_scores = _get_pending_period_map(redis, range_key, target_date) if redis else {}
    return int(db_scores.get(user.id, 0) + pending_scores.get(user.id, 0))


def _get_month_xp(user: User, target_date: date) -> int:
    return _get_user_period_xp(user, "month", target_date)


def _get_pending_total_xp_for_user(redis, user_id: int) -> int:
    if not redis:
        return 0
    try:
        pending_key = _pending_user_total_key(user_id)
        pending_total = _int_from_redis(redis.get(pending_key), default=-1)
        if pending_total >= 0:
            return int(pending_total)

        keys = _scan_keys(redis, f"{XP_BUCKET_KEY_PREFIX}*")
        total = 0
        for key in keys:
            total += _int_from_redis(redis.hget(key, user_id), 0)
        return int(total)
    except Exception:
        return 0


def _get_user_live_xp(user: User) -> int:
    base_xp = int(user.xp or 0)
    redis = _get_redis()
    if not redis:
        return base_xp
    _maybe_flush_pending_xp(redis)
    pending_xp = _get_pending_total_xp_for_user(redis, user.id)
    return int(base_xp + pending_xp)


def _serialize_user_with_live_xp(user: User) -> dict:
    payload = UserSerializer(user).data
    payload["xp"] = _get_user_live_xp(user)
    return payload


def _check_and_award_quests(user: User, target_date: date | None = None) -> list[UserQuest]:
    target_date = target_date or timezone.localdate()
    active_quests = list(Quest.objects.filter(is_active=True).order_by("order"))
    if not active_quests:
        return []

    completed_map = {
        uq.quest_id: uq
        for uq in UserQuest.objects.filter(user=user, quest__in=active_quests)
    }

    habits_count = Habit.objects.filter(owner=user).count()
    public_habits_count = Habit.objects.filter(owner=user, visibility="Публичный").count()
    public_habits = Habit.objects.filter(owner=user, visibility="Публичный")
    streak_days = (
        Habit.objects.filter(owner=user)
        .order_by("-streak_current")
        .values_list("streak_current", flat=True)
        .first()
        or 0
    )
    month_xp = _get_month_xp(user, target_date)
    has_joined_public = HabitCopy.objects.filter(user=user).exists()
    has_shared_habit = HabitShare.objects.filter(user=user).exists()
    popular_habit = public_habits.filter(copied_count__gte=50).exists()
    influential_habit = public_habits.filter(copied_count__gte=200).exists()
    trend_setter_count = public_habits.filter(copied_count__gte=10).count()
    community_support_sum = public_habits.order_by("-copied_count").values_list("copied_count", flat=True)[:5]
    community_support_total = sum(community_support_sum) if community_support_sum else 0

    balance_payload = _serialize_balance(user, public_only=False)

    created = []
    for quest in active_quests:
        if quest.id in completed_map:
            continue
        completed = False
        if quest.type == "create_habit":
            completed = habits_count >= quest.target
        elif quest.type == "public_habit_created":
            completed = public_habits_count >= quest.target
        elif quest.type == "join_public_habit":
            completed = has_joined_public
        elif quest.type == "share_habit":
            completed = has_shared_habit
        elif quest.type == "streak_days":
            completed = streak_days >= quest.target
        elif quest.type == "balance_points":
            required_categories = int(quest.metadata.get("categories", 1))
            categories_ok = sum(
                1 for item in balance_payload.get("items", [])
                if int(item.get("value") or 0) >= quest.target
            )
            completed = categories_ok >= required_categories
        elif quest.type == "level_reached":
            completed = (user.level or 1) >= quest.target
        elif quest.type == "popular_habit":
            completed = popular_habit
        elif quest.type == "trend_setter":
            min_additions = int(quest.metadata.get("min_additions", 10))
            completed = public_habits.filter(copied_count__gte=min_additions).count() >= quest.target
        elif quest.type == "monthly_xp":
            completed = month_xp >= quest.target
        elif quest.type == "community_support":
            required_habits = int(quest.metadata.get("habits", 5))
            completed = len(community_support_sum) >= required_habits and community_support_total >= quest.target
        elif quest.type == "mentor_streak":
            min_user_streak = int(quest.metadata.get("min_user_streak", 5))
            qualified_users_count = (
                Habit.objects.filter(
                    source_habit__owner=user,
                    streak_current__gte=min_user_streak,
                )
                .values("owner_id")
                .distinct()
                .count()
            )
            completed = qualified_users_count >= quest.target
        elif quest.type == "influential_habit":
            completed = influential_habit

        if not completed:
            continue

        if quest.type == "level_reached":
            awarded = 0
        else:
            is_premium = bool(user.premium_expiration and user.premium_expiration > timezone.now())
            awarded = int(round(quest.xp * PREMIUM_XP_MULTIPLIER)) if is_premium else quest.xp
        with transaction.atomic():
            uq, created_flag = UserQuest.objects.get_or_create(
                user=user,
                quest=quest,
                defaults={"completed_at": timezone.now(), "xp_awarded": awarded},
            )
            if created_flag:
                if awarded > 0:
                    redis = _get_redis()
                    if redis:
                        try:
                            _register_pending_xp(redis, user.id, awarded, event_dt=timezone.now())
                            _maybe_flush_pending_xp(redis)
                        except Exception:
                            _persist_interval_xp_without_redis(user.id, awarded)
                    else:
                        _persist_interval_xp_without_redis(user.id, awarded)
                created.append(uq)
    return created


def _verify_telegram_init_data(init_data, bot_token):
    if not bot_token:
        raise AuthError(
            "Server misconfiguration",
            "BOT_TOKEN is not configured",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    try:
        data = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError as exc:
        raise AuthError(
            "Invalid init_data",
            f"Failed to parse init_data: {exc}",
            status.HTTP_400_BAD_REQUEST,
        )
    provided_hash = data.pop("hash", None)

    if not provided_hash:
        raise AuthError(
            "Invalid init_data",
            "Missing hash in init_data",
            status.HTTP_400_BAD_REQUEST,
        )

    data_check_string = "\n".join(f"{key}={data[key]}" for key in sorted(data.keys()))
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, provided_hash):
        raise AuthError(
            "Unauthorized",
            "Telegram signature mismatch",
            status.HTTP_403_FORBIDDEN,
        )

    return data


@api_view(['POST'])
@permission_classes([AllowAny])
def telegram_auth(request):
    serializer = TelegramAuthSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    init_data = serializer.validated_data['init_data']
    if not settings.BOT_TOKEN and settings.DEBUG:
        try:
            decoded_init_data = unquote(init_data)
            data = dict(parse_qsl(decoded_init_data, strict_parsing=True))
            raw_user = data.get("user")
            if not raw_user:
                return Response({
                    'error': 'Invalid init_data',
                    'detail': 'Missing user in init_data',
                }, status=status.HTTP_400_BAD_REQUEST)
            user_data = json.loads(raw_user)
            telegram_id = int(user_data.get("id"))
            if telegram_id <= 0:
                return Response({
                    'error': 'Invalid init_data',
                    'detail': 'Invalid Telegram user id',
                }, status=status.HTTP_400_BAD_REQUEST)

            user, created = User.objects.get_or_create_telegram_user(
                telegram_id=telegram_id,
                first_name=user_data.get('first_name', ''),
                username=user_data.get('username', ''),
                photo_url=user_data.get('photo_url', ''),
                is_active=True
            )
            _sync_user_title(user, save=True)

            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            refresh_token = str(refresh)

            return Response({
                'access_token': access_token,
                'refresh_token': refresh_token,
                'user': _serialize_user_with_live_xp(user),
                'created': created,
                'debug_auth': True,
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'error': 'Invalid init_data',
                'detail': str(exc),
            }, status=status.HTTP_400_BAD_REQUEST)

    if not settings.BOT_TOKEN:
        return Response({
            'error': 'Server misconfiguration',
            'detail': 'BOT_TOKEN is not configured',
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        auth_handler = WebAppAuth(settings.BOT_TOKEN)

        init_data_decoded = unquote(init_data)
        user_data = auth_handler.get_user_data(init_data_decoded)

        user, created = User.objects.get_or_create_telegram_user(
            telegram_id=user_data['tg_id'],
            first_name=user_data.get('first_name', ''),
            username=user_data.get('username', ''),
            photo_url=user_data.get('avatar_url', ''),
            is_active=True
        )
        _sync_user_title(user, save=True)

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        return Response({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': _serialize_user_with_live_xp(user),
            'created': created
        }, status=status.HTTP_200_OK)

    except (AuthError, WebAppAuthError) as e:
        return Response({
            'error': e.message,
            'detail': e.detail
        }, status=e.status)
    except Exception as e:
        return Response({
            'error': 'Authentication failed',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    _sync_user_title(request.user, save=True)
    return Response(_serialize_user_with_live_xp(request.user))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_current_user(request):
    user = request.user
    serializer = UserSerializer(user, data=request.data, partial=True)

    if serializer.is_valid():
        serializer.save()
        _sync_user_title(user, save=True)
        return Response(serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_public_user_profile(request, user_id: int):
    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        return Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    title = _resolve_title(user)
    return Response({
        "id": user.id,
        "name": user.first_name or user.username or f"User {user.id}",
        "avatar": user.photo_url,
        "level": int(user.level or 1),
        "xp": int(user.xp or 0),
        "title": title.name if title else "",
        "is_premium": _is_premium_active(user),
    })


def _serialize_titles(user: User) -> list[dict]:
    is_premium = bool(user.premium_expiration and user.premium_expiration > timezone.now())
    current_title = _resolve_title(user)
    titles = Title.objects.all().order_by("order")
    data = []
    for title in titles:
        is_locked = title.requires_premium and not is_premium
        is_current = current_title.id == title.id if current_title else False
        is_reached = bool(current_title and (title.order or 0) <= (current_title.order or 0))
        data.append({
            "code": title.code,
            "name": title.name,
            "level_min": title.level_min,
            "level_max": title.level_max,
            "privileges": title.privileges,
            "requires_premium": title.requires_premium,
            "order": title.order,
            "is_current": is_current,
            "is_reached": is_reached,
            "is_locked": is_locked,
        })
    return data


def _build_quests_progress_map(user: User, quests: list[Quest], target_date: date) -> dict[int, dict]:
    habits_count = Habit.objects.filter(owner=user).count()
    public_habits = Habit.objects.filter(owner=user, visibility="Публичный")
    public_habits_count = public_habits.count()
    max_public_copied_count = (
        public_habits.order_by("-copied_count").values_list("copied_count", flat=True).first() or 0
    )
    max_streak = (
        Habit.objects.filter(owner=user)
        .order_by("-streak_current")
        .values_list("streak_current", flat=True)
        .first()
        or 0
    )
    month_xp = _get_month_xp(user, target_date)
    has_joined_public = HabitCopy.objects.filter(user=user).exists()
    has_shared_habit = HabitShare.objects.filter(user=user).exists()
    balance_payload = _serialize_balance(user, public_only=False)
    level_value = user.level or 1

    trend_setter_cache: dict[int, int] = {}
    mentor_streak_cache: dict[int, int] = {}
    progress_map: dict[int, dict] = {}

    for quest in quests:
        current = 0
        target = max(int(quest.target or 1), 1)
        show_progress = quest.type in {
            "create_habit",
            "public_habit_created",
            "streak_days",
            "balance_points",
            "level_reached",
            "popular_habit",
            "trend_setter",
            "monthly_xp",
            "community_support",
            "mentor_streak",
            "influential_habit",
        }

        if quest.type == "create_habit":
            current = habits_count
        elif quest.type == "public_habit_created":
            current = public_habits_count
        elif quest.type == "join_public_habit":
            current = 1 if has_joined_public else 0
            target = 1
            show_progress = False
        elif quest.type == "share_habit":
            current = 1 if has_shared_habit else 0
            target = 1
            show_progress = False
        elif quest.type == "streak_days":
            current = max_streak
        elif quest.type == "balance_points":
            required_categories = int(quest.metadata.get("categories", 1))
            categories_ok = sum(
                1 for item in balance_payload.get("items", [])
                if int(item.get("value") or 0) >= quest.target
            )
            current = categories_ok
            target = max(required_categories, 1)
        elif quest.type == "level_reached":
            current = level_value
        elif quest.type == "popular_habit":
            current = max_public_copied_count
        elif quest.type == "trend_setter":
            min_additions = int(quest.metadata.get("min_additions", 10))
            if min_additions not in trend_setter_cache:
                trend_setter_cache[min_additions] = public_habits.filter(copied_count__gte=min_additions).count()
            current = trend_setter_cache[min_additions]
        elif quest.type == "monthly_xp":
            current = month_xp
        elif quest.type == "community_support":
            current = int(sum(public_habits.order_by("-copied_count").values_list("copied_count", flat=True)[:5]) or 0)
        elif quest.type == "mentor_streak":
            min_user_streak = int(quest.metadata.get("min_user_streak", 5))
            if min_user_streak not in mentor_streak_cache:
                mentor_streak_cache[min_user_streak] = (
                    Habit.objects.filter(
                        source_habit__owner=user,
                        streak_current__gte=min_user_streak,
                    )
                    .values("owner_id")
                    .distinct()
                    .count()
                )
            current = mentor_streak_cache[min_user_streak]
        elif quest.type == "influential_habit":
            current = max_public_copied_count

        current = min(int(current), int(target))
        progress_map[quest.id] = {"current": current, "target": int(target), "show": show_progress}

    return progress_map


def _serialize_quests(user: User) -> list[dict]:
    quests = list(Quest.objects.filter(is_active=True).order_by("group", "order"))
    today = timezone.localdate()
    progress_map = _build_quests_progress_map(user, quests, today)
    completed_map = {
        uq.quest_id: uq
        for uq in UserQuest.objects.filter(user=user, quest__in=quests)
    }
    items = []
    for quest in quests:
        uq = completed_map.get(quest.id)
        progress = progress_map.get(quest.id, {"current": 0, "target": max(quest.target, 1), "show": False})
        items.append({
            "code": quest.code,
            "title": quest.title,
            "description": quest.description,
            "xp": quest.xp,
            "group": quest.group,
            "type": quest.type,
            "target": quest.target,
            "metadata": quest.metadata,
            "order": quest.order,
            "completed": bool(uq),
            "completed_at": uq.completed_at.isoformat() if uq and uq.completed_at else None,
            "xp_awarded": uq.xp_awarded if uq else 0,
            "progress_current": progress["current"],
            "progress_target": progress["target"],
            "progress_percent": int(round((progress["current"] / max(progress["target"], 1)) * 100)),
            "show_progress": bool(progress["show"]),
        })
    return items


def _serialize_balance(user: User, *, public_only: bool | None = None) -> dict:
    if public_only is None:
        public_only = bool(user.balance_wheel)
    habits = Habit.objects.filter(owner=user).select_related("category")
    if public_only:
        habits = habits.filter(visibility="Публичный")
    category_map = {habit.category.name: 0 for habit in habits if habit.category and habit.category.name}
    if not category_map:
        return {"total": 0, "items": []}
    completions = HabitCompletion.objects.filter(
        habit__owner=user,
        count__gte=F("habit__goal"),
    )
    if public_only:
        completions = completions.filter(habit__visibility="Публичный")
    completions = completions.values("habit__category__name").annotate(total=Count("id"))
    for item in completions:
        name = item["habit__category__name"]
        if not name:
            continue
        category_map[name] = item["total"]
    items = [{"label": name, "value": value} for name, value in category_map.items()]
    total = sum(item["value"] for item in items)
    return {"total": total, "items": items}


def _normalize_leaderboard_range(range_key: str | None) -> str:
    if range_key in {"week", "month", "all"}:
        return range_key
    return "month"


def _serialize_leaderboard_user(u: User, rank: int, xp_value: int) -> dict:
    title = _resolve_title(u)
    return {
        "id": u.id,
        "name": u.first_name or u.username or f"User {u.id}",
        "avatar": u.photo_url,
        "level": int(u.level or 1),
        "xp": int(xp_value or 0),
        "title": title.name if title else "",
        "rank": int(rank),
        "is_premium": _is_premium_active(u),
    }


def _serialize_leaderboard_me(user: User, xp_value: int, rank: int | None) -> dict:
    title = _resolve_title(user)
    return {
        "id": user.id,
        "name": user.first_name or user.username or f"User {user.id}",
        "avatar": user.photo_url,
        "level": int(user.level or 1),
        "xp": int(xp_value or 0),
        "title": title.name if title else "",
        "rank": int(rank) if rank is not None else None,
        "is_premium": _is_premium_active(user),
    }


def _build_items_from_users(users: list[User], score_map: dict[int, int], limit: int) -> list[dict]:
    items = []
    for index, u in enumerate(users[:limit], start=1):
        items.append(_serialize_leaderboard_user(u, rank=index, xp_value=score_map.get(u.id, int(u.xp or 0))))
    return items


def _build_period_ranking(range_key: str, today: date, redis=None) -> tuple[list[User], dict[int, int]]:
    users = list(
        User.objects.filter(participation_in_ratings=True).order_by("-xp", "id")
    )
    db_scores = _get_db_period_scores_map(range_key, today)
    pending_scores = _get_pending_period_map(redis, range_key, today) if redis else {}
    score_map = {
        u.id: int(db_scores.get(u.id, 0) + pending_scores.get(u.id, 0))
        for u in users
    }
    users.sort(key=lambda u: (-score_map.get(u.id, 0), -int(u.xp or 0), u.id))
    return users, score_map


def _build_live_me_entry(user: User, range_key: str, today: date, ranking_users: list[User] | None = None, score_map: dict[int, int] | None = None) -> dict | None:
    me_user = User.objects.filter(id=user.id).first() or user
    if not me_user.participation_in_ratings:
        return None

    if range_key == "all":
        rank = (
            User.objects.filter(participation_in_ratings=True, xp__gt=me_user.xp).count()
            + User.objects.filter(participation_in_ratings=True, xp=me_user.xp, id__lt=me_user.id).count()
            + 1
        )
        return _serialize_leaderboard_me(me_user, xp_value=int(me_user.xp or 0), rank=rank)

    users = ranking_users or []
    scores = score_map or {}
    me_score = int(scores.get(me_user.id, 0))
    me_rank = None
    for idx, ranked in enumerate(users, start=1):
        if ranked.id == me_user.id:
            me_rank = idx
            break
    return _serialize_leaderboard_me(me_user, xp_value=me_score, rank=me_rank)


def _build_leaderboard_payload(user: User, range_key: str = "month", limit: int = LEADERBOARD_DEFAULT_LIMIT) -> dict:
    normalized_range = _normalize_leaderboard_range(range_key)
    normalized_limit = max(1, min(int(limit or LEADERBOARD_DEFAULT_LIMIT), LEADERBOARD_MAX_LIMIT))
    today = timezone.localdate()
    redis = _get_redis()
    if redis:
        _maybe_flush_pending_xp(redis)

    use_cache = True
    cache_key = f"xp:leaderboard:items:v5:{normalized_range}:{normalized_limit}"
    items = _cache_get_safe(cache_key) if use_cache else None
    ranking_users: list[User] | None = None
    ranking_scores: dict[int, int] | None = None
    if items is None:
        if normalized_range == "all":
            ranking_users = list(User.objects.filter(participation_in_ratings=True).order_by("-xp", "id"))
            ranking_scores = {u.id: int(u.xp or 0) for u in ranking_users}
            items = _build_items_from_users(ranking_users, ranking_scores, normalized_limit)
        else:
            ranking_users, ranking_scores = _build_period_ranking(normalized_range, today, redis=redis)
            items = _build_items_from_users(ranking_users, ranking_scores, normalized_limit)
        if use_cache:
            _cache_set_safe(cache_key, items, timeout=LEADERBOARD_CACHE_TTL_SECONDS)

    if normalized_range == "all":
        me = _build_live_me_entry(user, normalized_range, today)
    else:
        if ranking_users is None or ranking_scores is None:
            ranking_users, ranking_scores = _build_period_ranking(normalized_range, today, redis=redis)
        me = _build_live_me_entry(
            user,
            normalized_range,
            today,
            ranking_users=ranking_users,
            score_map=ranking_scores,
        )

    if me:
        patched_items = []
        for item in items:
            if item["id"] == me["id"]:
                patched_items.append({**item, **me, "rank": item.get("rank", me.get("rank"))})
            else:
                patched_items.append(item)
        items = patched_items

    return {"range": normalized_range, "items": items, "me": me}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_my_purchases(request):
    status_param = (request.query_params.get("status") or "paid").strip().lower()
    payments = (
        Payment.objects.filter(user=request.user)
        .select_related("product")
        .order_by("-paid_at", "-created_at", "-id")
    )

    if status_param != "all":
        statuses = [value.strip() for value in status_param.split(",") if value.strip()]
        if statuses:
            payments = payments.filter(status__in=statuses)
        else:
            payments = payments.filter(status=Payment.STATUS_PAID)

    serializer = PaymentSerializer(payments, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def app_bootstrap(request):
    user = request.user
    today = timezone.localdate()
    _rollup_user_habit_stats(user, today)
    _sync_user_title(user, save=True)
    _check_and_award_quests(user, today)

    habits = (
        Habit.objects.filter(owner=user)
        .select_related("category")
        .prefetch_related("completions")
        .order_by("-created_at")
    )
    categories = Category.objects.all().order_by("id")
    products = Product.objects.filter(is_active=True).order_by("created_at")

    payload = {
        "user": _serialize_user_with_live_xp(user),
        "habits": HabitSerializer(habits, many=True, context={"request": request, "date": today.isoformat()}).data,
        "categories": CategorySerializer(categories, many=True).data,
        "products": ProductSerializer(products, many=True, context={"request": request}).data,
        "titles": _serialize_titles(user),
        "quests": _serialize_quests(user),
        "balance": _serialize_balance(user),
        "leaderboard": _build_leaderboard_payload(user, range_key="month", limit=LEADERBOARD_DEFAULT_LIMIT),
    }
    return Response(payload)


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("created_at")
    serializer_class = ProductSerializer

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        queryset = self.get_queryset().filter(is_active=True)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_robokassa_payment(request):
    product_id = request.data.get("product_id")
    if not product_id:
        return Response({"detail": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        product = Product.objects.get(pk=int(product_id), is_active=True, currency__iexact="RUB")
    except (ValueError, TypeError):
        return Response({"detail": "product_id must be integer"}, status=status.HTTP_400_BAD_REQUEST)
    except Product.DoesNotExist:
        return Response({"detail": "RUB product not found"}, status=status.HTTP_404_NOT_FOUND)

    missing = []
    if not settings.ROBOKASSA_MERCHANT_LOGIN:
        missing.append("ROBOKASSA_MERCHANT_LOGIN")
    if not settings.ROBOKASSA_PASSWORD1:
        missing.append("ROBOKASSA_PASSWORD1")
    if not settings.ROBOKASSA_PASSWORD2:
        missing.append("ROBOKASSA_PASSWORD2")
    if missing:
        return Response(
            {"detail": f"Robokassa is not configured. Missing: {', '.join(missing)}"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    with transaction.atomic():
        payment = Payment.objects.create(
            user=request.user,
            product=product,
            provider=Payment.PROVIDER_ROBOKASSA,
            invoice_id=0,
            amount=product.price,
            currency="RUB",
            status=Payment.STATUS_PENDING,
            metadata={"source": "api"},
        )
        payment.invoice_id = payment.id
        payment.save(update_fields=["invoice_id"])

    try:
        payment_url, provider_meta = create_invoice_link_with_meta(payment)
        logger.info(
            "Robokassa create endpoint success: payment_id=%s invoice_id=%s user_id=%s product_id=%s provider_meta=%s",
            payment.id,
            payment.invoice_id,
            request.user.id,
            product.id,
            provider_meta,
        )
        payment.metadata = {
            **(payment.metadata or {}),
            "provider_meta": provider_meta,
        }
        payment.save(update_fields=["metadata", "updated_at"])
    except RobokassaError as exc:
        logger.exception(
            "Robokassa payment creation failed: payment_id=%s invoice_id=%s user_id=%s product_id=%s",
            payment.id,
            payment.invoice_id,
            request.user.id,
            product.id,
        )
        payment.status = Payment.STATUS_FAILED
        payment.metadata = {
            **(payment.metadata or {}),
            "error": str(exc),
            "error_stage": exc.stage,
            "provider_status_code": exc.status_code,
            "provider_response_snippet": exc.response_snippet,
        }
        payment.save(update_fields=["status", "metadata", "updated_at"])
        return Response(
            {
                "detail": str(exc),
                "error_stage": exc.stage,
                "provider_status_code": exc.status_code,
                "provider_response_snippet": exc.response_snippet,
                "payment_id": payment.id,
                "invoice_id": payment.invoice_id,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {
            "payment_id": payment.id,
            "invoice_id": payment.invoice_id,
            "payment_url": payment_url,
            "amount": format_out_sum(payment.amount),
            "currency": payment.currency,
            "provider_meta": provider_meta,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_robokassa_payment_message(request):
    product_id = request.data.get("product_id")
    if not product_id:
        raise ValidationError({"product_id": "This field is required."})
    try:
        product_id = int(product_id)
    except (TypeError, ValueError):
        raise ValidationError({"product_id": "Must be an integer."})

    product = Product.objects.filter(id=product_id, is_active=True, currency__iexact="RUB").first()
    if not product:
        return Response({"detail": "RUB product not found"}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    if not user.telegram_id:
        return Response(
            {"detail": "Telegram account is not linked. Start the bot first."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.payment_offer_accepted:
        reply_markup = {
            "inline_keyboard": [
                [{"text": "Оферта", "url": "https://telegra.ph/PUBLICHNAYA-OFERTA-02-25-8"}],
                [{"text": "Согласиться", "callback_data": f"offer_accept:{product.id}"}],
            ]
        }
        _telegram_send_message(
            chat_id=int(user.telegram_id),
            text="Перед оплатой ознакомьтесь с публичной офертой.\nНажмите «Согласиться», чтобы продолжить.",
            reply_markup=reply_markup,
        )
        return Response({"status": "offer_sent"})

    missing = []
    if not settings.ROBOKASSA_MERCHANT_LOGIN:
        missing.append("ROBOKASSA_MERCHANT_LOGIN")
    if not settings.ROBOKASSA_PASSWORD1:
        missing.append("ROBOKASSA_PASSWORD1")
    if not settings.ROBOKASSA_PASSWORD2:
        missing.append("ROBOKASSA_PASSWORD2")
    if missing:
        return Response(
            {"detail": f"Robokassa is not configured. Missing: {', '.join(missing)}"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    with transaction.atomic():
        payment = Payment.objects.create(
            user=user,
            product=product,
            provider=Payment.PROVIDER_ROBOKASSA,
            invoice_id=0,
            amount=product.price,
            currency="RUB",
            status=Payment.STATUS_PENDING,
            metadata={"source": "api_bot_message"},
        )
        payment.invoice_id = payment.id
        payment.save(update_fields=["invoice_id"])

    try:
        payment_url, provider_meta = create_invoice_link_with_meta(payment)
        payment.metadata = {
            **(payment.metadata or {}),
            "provider_meta": provider_meta,
        }
        payment.save(update_fields=["metadata", "updated_at"])
    except RobokassaError as exc:
        logger.exception(
            "Robokassa bot-message payment creation failed: payment_id=%s invoice_id=%s user_id=%s product_id=%s",
            payment.id,
            payment.invoice_id,
            request.user.id,
            product.id,
        )
        payment.status = Payment.STATUS_FAILED
        payment.metadata = {
            **(payment.metadata or {}),
            "error": str(exc),
            "error_stage": exc.stage,
            "provider_status_code": exc.status_code,
            "provider_response_snippet": exc.response_snippet,
        }
        payment.save(update_fields=["status", "metadata", "updated_at"])
        return Response(
            {
                "detail": str(exc),
                "error_stage": exc.stage,
                "provider_status_code": exc.status_code,
                "provider_response_snippet": exc.response_snippet,
                "payment_id": payment.id,
                "invoice_id": payment.invoice_id,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except Exception as exc:
        logger.exception(
            "Unexpected bot-message payment creation error: payment_id=%s invoice_id=%s user_id=%s product_id=%s",
            payment.id,
            payment.invoice_id,
            request.user.id,
            product.id,
        )
        payment.status = Payment.STATUS_FAILED
        payment.metadata = {
            **(payment.metadata or {}),
            "error": str(exc),
            "error_stage": "unexpected",
        }
        payment.save(update_fields=["status", "metadata", "updated_at"])
        return Response(
            {
                "detail": "Unexpected payment creation error",
                "payment_id": payment.id,
                "invoice_id": payment.invoice_id,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    safe_name = re.sub(r"<[^>]+>", "", (product.name or "")).strip()
    reply_markup = {
        "inline_keyboard": [
            [{"text": "Оплатить", "url": payment_url}],
        ]
    }
    message_payload = _telegram_send_message(
        chat_id=int(user.telegram_id),
        text=f"Оплата: {safe_name}\nСумма: {product.price} RUB\n\nОплатите по кнопке ниже.",
        reply_markup=reply_markup,
    )
    message_id = message_payload.get("result", {}).get("message_id")
    if message_id:
        payment.metadata = {
            **(payment.metadata or {}),
            "telegram_message_id": int(message_id),
            "telegram_chat_id": int(user.telegram_id),
        }
        payment.save(update_fields=["metadata", "updated_at"])
    return Response({"status": "payment_sent", "invoice_id": payment.invoice_id, "payment_id": payment.id})


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def robokassa_result_webhook(request):
    payload = dict(request.data or {})
    if payload:
        payload = {k: (v[-1] if isinstance(v, (list, tuple)) and v else v) for k, v in payload.items()}
    print("Robokassa webhook payload:", payload)
    if not payload:
        try:
            raw = request.body.decode("utf-8")
            parsed = parse_qs(raw, keep_blank_values=True)
            payload = {k: v[-1] if isinstance(v, list) and v else v for k, v in parsed.items()}
        except Exception:
            payload = {}
    if not payload:
        payload = dict(request.query_params or {})
    if payload:
        payload = {k: (v[-1] if isinstance(v, (list, tuple)) and v else v) for k, v in payload.items()}

    if not payload:
        return HttpResponse("bad request", status=400, content_type="text/plain; charset=utf-8")

    if "SignatureValue" not in payload and "crc" in payload:
        payload["SignatureValue"] = payload.get("crc")
    if "OutSum" not in payload and "out_summ" in payload:
        payload["OutSum"] = payload.get("out_summ")
    if "InvId" not in payload and "inv_id" in payload:
        payload["InvId"] = payload.get("inv_id")

    if not verify_result_signature(payload):
        logger.warning("Robokassa webhook bad sign: payload_keys=%s", list(payload.keys()))
        return HttpResponse("bad sign", status=400, content_type="text/plain; charset=utf-8")

    out_sum_raw = str(payload.get("OutSum", "")).strip()
    inv_id_raw = str(payload.get("InvId", "")).strip()
    if not out_sum_raw or not inv_id_raw:
        return HttpResponse("bad request", status=400, content_type="text/plain; charset=utf-8")

    try:
        inv_id = int(inv_id_raw)
        out_sum = Decimal(out_sum_raw).quantize(Decimal("0.01"))
    except (ValueError, InvalidOperation):
        return HttpResponse("bad request", status=400, content_type="text/plain; charset=utf-8")

    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("user", "product").filter(invoice_id=inv_id).first()
        if not payment:
            return HttpResponse("invoice not found", status=404, content_type="text/plain; charset=utf-8")

        expected_sum = Decimal(payment.amount).quantize(Decimal("0.01"))
        if out_sum != expected_sum:
            payment.status = Payment.STATUS_FAILED
            payment.metadata = {**(payment.metadata or {}), "webhook_payload": payload, "error": "sum_mismatch"}
            payment.save(update_fields=["status", "metadata", "updated_at"])
            return HttpResponse("sum mismatch", status=400, content_type="text/plain; charset=utf-8")

        if payment.status == Payment.STATUS_PAID:
            return HttpResponse(f"OK{inv_id}", content_type="text/plain; charset=utf-8")

        user = payment.user
        now = timezone.now()
        effects = _apply_payment_product_effects(user, payment.product, now)

        payment.status = Payment.STATUS_PAID
        payment.paid_at = now
        payment.metadata = {
            **(payment.metadata or {}),
            "webhook_payload": payload,
            "applied_effects": effects,
        }
        payment.save(update_fields=["status", "paid_at", "metadata", "updated_at"])
        telegram_message_id = (payment.metadata or {}).get("telegram_message_id")
        if telegram_message_id and user.telegram_id:
            effects_text = _format_payment_effects(payment.product, effects)
            transaction.on_commit(
                lambda: _telegram_edit_message(
                    chat_id=int(user.telegram_id),
                    message_id=int(telegram_message_id),
                    text=f"Оплата подтверждена.\nПакет: {payment.product.name}\n{effects_text}",
                    reply_markup=None,
                )
            )
        else:
            transaction.on_commit(
                lambda: _notify_telegram_payment_success(
                    telegram_id=user.telegram_id,
                    product_name=payment.product.name,
                )
            )

    return HttpResponse(f"OK{inv_id}", content_type="text/plain; charset=utf-8")


@csrf_exempt
@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def robokassa_success(request):
    payload = dict(request.data or request.query_params or {})
    if not verify_success_signature(payload):
        return HttpResponse("bad sign", status=400, content_type="text/plain; charset=utf-8")

    out_sum_raw = str(payload.get("OutSum", "")).strip()
    inv_id_raw = str(payload.get("InvId", "")).strip()
    if not out_sum_raw or not inv_id_raw:
        return HttpResponse("bad request", status=400, content_type="text/plain; charset=utf-8")

    try:
        inv_id = int(inv_id_raw)
        out_sum = Decimal(out_sum_raw).quantize(Decimal("0.01"))
    except (ValueError, InvalidOperation):
        return HttpResponse("bad request", status=400, content_type="text/plain; charset=utf-8")

    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("user", "product").filter(invoice_id=inv_id).first()
        if not payment:
            return HttpResponse("invoice not found", status=404, content_type="text/plain; charset=utf-8")

        expected_sum = Decimal(payment.amount).quantize(Decimal("0.01"))
        if out_sum != expected_sum:
            payment.status = Payment.STATUS_FAILED
            payment.metadata = {**(payment.metadata or {}), "success_payload": payload, "error": "sum_mismatch"}
            payment.save(update_fields=["status", "metadata", "updated_at"])
            return HttpResponse("sum mismatch", status=400, content_type="text/plain; charset=utf-8")

        if payment.status != Payment.STATUS_PAID:
            user = payment.user
            now = timezone.now()
            effects = _apply_payment_product_effects(user, payment.product, now)
            payment.status = Payment.STATUS_PAID
            payment.paid_at = now
            payment.metadata = {
                **(payment.metadata or {}),
                "success_payload": payload,
                "applied_effects": effects,
            }
            payment.save(update_fields=["status", "paid_at", "metadata", "updated_at"])
            telegram_message_id = (payment.metadata or {}).get("telegram_message_id")
            if telegram_message_id and user.telegram_id:
                effects_text = _format_payment_effects(payment.product, effects)
                transaction.on_commit(
                    lambda: _telegram_edit_message(
                        chat_id=int(user.telegram_id),
                        message_id=int(telegram_message_id),
                        text=f"Оплата подтверждена.\nПакет: {payment.product.name}\n{effects_text}",
                        reply_markup=None,
                    )
                )
            else:
                transaction.on_commit(
                    lambda: _notify_telegram_payment_success(
                        telegram_id=user.telegram_id,
                        product_name=payment.product.name,
                    )
                )

    return HttpResponseRedirect("https://t.me/Routr_bot")


@csrf_exempt
@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def robokassa_fail(request):
    payload = dict(request.data or request.query_params or {})
    out_sum_raw = str(payload.get("OutSum", "")).strip()
    inv_id_raw = str(payload.get("InvId", "")).strip()
    if not out_sum_raw or not inv_id_raw:
        return HttpResponseRedirect("https://t.me/Routr_bot")

    try:
        inv_id = int(inv_id_raw)
    except (ValueError, InvalidOperation):
        return HttpResponseRedirect("https://t.me/Routr_bot")

    with transaction.atomic():
        payment = Payment.objects.select_for_update().filter(invoice_id=inv_id).first()
        if payment and payment.status != Payment.STATUS_PAID:
            payment.status = Payment.STATUS_FAILED
            payment.metadata = {**(payment.metadata or {}), "fail_payload": payload}
            payment.save(update_fields=["status", "metadata", "updated_at"])
            telegram_message_id = (payment.metadata or {}).get("telegram_message_id")
            telegram_chat_id = (payment.metadata or {}).get("telegram_chat_id")
            if telegram_message_id and telegram_chat_id:
                transaction.on_commit(
                    lambda: _telegram_edit_message(
                        chat_id=int(telegram_chat_id),
                        message_id=int(telegram_message_id),
                        text="Оплата не завершена. Попробуйте ещё раз.",
                        reply_markup=None,
                    )
                )

    return HttpResponseRedirect("https://t.me/Routr_bot")


class HabitViewSet(viewsets.ModelViewSet):
    serializer_class = HabitSerializer

    @staticmethod
    def _parse_limit(value):
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed >= 0 else None

    def _get_habit_limits(self, user: User) -> dict:
        title = _resolve_title(user)
        privileges = title.privileges if title else {}
        max_total = self._parse_limit(privileges.get("total_habits"))
        if max_total is not None:
            max_total += int(user.extra_habit_slots or 0)
        return {
            "max_total": max_total,
            "max_public": self._parse_limit(privileges.get("public_habits")),
            "public_join_only": bool(privileges.get("public_join_only", False)),
        }

    def _validate_habit_limits(
        self,
        user: User,
        target_visibility: str,
        *,
        is_new: bool,
        current_habit: Habit | None = None,
    ) -> None:
        limits = self._get_habit_limits(user)
        owner_habits = Habit.objects.filter(owner=user)

        if is_new:
            max_total = limits["max_total"]
            if max_total is not None and owner_habits.count() >= max_total:
                raise ValidationError({
                    "detail": f"Достигнут лимит привычек для текущего уровня: {max_total}.",
                })

        if target_visibility != "Публичный":
            return

        is_existing_public = bool(current_habit and current_habit.visibility == "Публичный")
        if is_existing_public:
            return

        if limits["public_join_only"]:
            raise ValidationError({
                "visibility": "На текущем уровне нельзя создавать публичные привычки.",
            })

        max_public = limits["max_public"]
        if max_public is None:
            return

        public_count = owner_habits.filter(visibility="Публичный").count()
        if public_count >= max_public:
            raise ValidationError({
                "visibility": f"Достигнут лимит публичных привычек: {max_public}.",
            })

    def get_serializer_context(self):
        context = super().get_serializer_context()
        date_param = self.request.query_params.get("date")
        if date_param:
            context["date"] = date_param
        return context

    def get_queryset(self):
        _rollup_user_habit_stats(self.request.user, timezone.localdate())
        return (
            Habit.objects.filter(owner=self.request.user)
            .select_related("category")
            .prefetch_related("completions")
            .order_by("-created_at")
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        date_param = request.query_params.get("date")
        if date_param:
            try:
                target_date = date.fromisoformat(date_param)
            except ValueError:
                return Response({"detail": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
            weekdays = [
                "Понедельник",
                "Вторник",
                "Среда",
                "Четверг",
                "Пятница",
                "Суббота",
                "Воскресенье",
            ]
            weekday_name = weekdays[target_date.weekday()]
            queryset = [
                habit
                for habit in queryset
                if not habit.repeat_days or weekday_name in habit.repeat_days
            ]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=self.request.user.pk)
            target_visibility = serializer.validated_data.get("visibility", "Приватный")
            self._validate_habit_limits(user, target_visibility, is_new=True)
            habit = serializer.save(owner=user)
            _check_and_award_quests(user, timezone.localdate())
        return habit

    def perform_update(self, serializer):
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=self.request.user.pk)
            current_habit = serializer.instance
            old_goal = current_habit.goal
            target_visibility = serializer.validated_data.get("visibility", current_habit.visibility)
            next_goal = serializer.validated_data.get("goal", current_habit.goal)
            self._validate_habit_limits(
                user,
                target_visibility,
                is_new=False,
                current_habit=current_habit,
            )
            habit = serializer.save()
            if next_goal != old_goal:
                _rebuild_habit_stats(habit, timezone.localdate())

    def perform_destroy(self, instance):
        source_id = instance.source_habit_id
        owner_id = instance.owner_id
        with transaction.atomic():
            deleted_copy_links = 0
            if source_id:
                deleted_copy_links, _ = HabitCopy.objects.filter(
                    user_id=owner_id,
                    source_habit_id=source_id,
                ).delete()
            instance.delete()
            if source_id and deleted_copy_links:
                Habit.objects.filter(pk=source_id, copied_count__gt=0).update(copied_count=F("copied_count") - 1)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        habit = self.get_object()
        date_value = request.data.get("date")
        increment = int(request.data.get("count", 1))
        awarded_xp = 0
        if increment < 1:
            return Response({"detail": "count must be >= 1"}, status=status.HTTP_400_BAD_REQUEST)

        if date_value:
            try:
                completion_date = date.fromisoformat(date_value)
            except ValueError:
                return Response({"detail": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            completion_date = timezone.localdate()

        today = timezone.localdate()
        if completion_date > today:
            return Response({"detail": "Cannot complete habit for a future date"}, status=status.HTTP_400_BAD_REQUEST)

        if habit.repeat_days:
            weekdays = [
                "Понедельник",
                "Вторник",
                "Среда",
                "Четверг",
                "Пятница",
                "Суббота",
                "Воскресенье",
            ]
            weekday_name = weekdays[completion_date.weekday()]
            if weekday_name not in habit.repeat_days:
                return Response({"detail": "Habit is not scheduled for this day"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            completion, _created = HabitCompletion.objects.select_for_update().get_or_create(
                habit=habit, date=completion_date
            )
            goal = max(habit.goal, 1)
            prev_count = completion.count
            new_count = min(goal, completion.count + increment)
            completion.count = new_count
            completion.save()
        added_count = max(new_count - prev_count, 0)

        if added_count > 0:
            streak_days = _calculate_streak_days(request.user, completion_date)
            multiplier = _get_streak_multiplier(streak_days)
            completed_before = prev_count >= goal
            completed_now = new_count >= goal
            completed_increment = 1 if (not completed_before and completed_now) else 0
            raw_xp = int(round(completed_increment * XP_BASE * multiplier))
            habits_today = (
                HabitCompletion.objects.filter(
                    habit__owner=request.user, date=completion_date, count__gte=F("habit__goal")
                )
                .values("habit_id")
                .distinct()
                .count()
            )
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=request.user.pk)
                awarded_xp = _award_xp(user, raw_xp, completion_date, habits_today)
                _check_and_award_quests(user, completion_date)

        if completion_date < today and habit.stats_rollup_date and completion_date <= habit.stats_rollup_date:
            _rebuild_habit_stats(habit, today)

        habit.refresh_from_db()
        habit = Habit.objects.select_related("category").prefetch_related("completions").get(pk=habit.pk)
        serializer = self.get_serializer(habit, context={**self.get_serializer_context(), "date": completion_date})
        response_user = User.objects.select_related("current_title").get(pk=request.user.pk)
        title = _resolve_title(response_user)
        return Response({
            **serializer.data,
            "xp_awarded": int(awarded_xp),
            "user_progress": {
                "xp": _get_user_live_xp(response_user),
                "level": int(response_user.level or 1),
                "title": title.name if title else "",
            }
        })

    @action(detail=True, methods=["post"], url_path="share")
    def share(self, request, pk=None):
        habit = self.get_object()
        with transaction.atomic():
            if habit.visibility != "Публичный":
                Habit.objects.filter(pk=habit.pk).update(visibility="Публичный")
            _share, created = HabitShare.objects.get_or_create(user=request.user, habit=habit)
            if created:
                Habit.objects.filter(pk=habit.pk).update(share_count=F("share_count") + 1)
        _check_and_award_quests(request.user, timezone.localdate())
        habit.refresh_from_db(fields=["visibility", "share_count"])
        return Response({
            "shared": True,
            "visibility": habit.visibility,
            "share_count": habit.share_count,
        })

    @action(detail=False, methods=["post"], url_path="copy")
    def copy_public(self, request):
        source_id = request.data.get("habit_id")
        if not source_id:
            return Response({"detail": "habit_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            source = Habit.objects.get(pk=source_id, visibility="Публичный")
        except Habit.DoesNotExist:
            return Response({"detail": "Public habit not found"}, status=status.HTTP_404_NOT_FOUND)
        if source.owner_id == request.user.id:
            return Response({"detail": "You cannot copy your own public habit"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            self._validate_habit_limits(user, "Приватный", is_new=True)
            copy_record, created = HabitCopy.objects.get_or_create(user=user, source_habit=source)
            if not created:
                return Response({"detail": "Already copied"}, status=status.HTTP_409_CONFLICT)
            Habit.objects.filter(pk=source.pk).update(copied_count=F("copied_count") + 1)
            habit = Habit.objects.create(
                owner=user,
                source_habit=source,
                title=source.title,
                category=source.category,
                icon=source.icon,
                goal=source.goal,
                repeat_days=list(source.repeat_days or []),
                reminder=False,
                reminder_times=[],
                visibility="Приватный",
            )
        _check_and_award_quests(request.user, timezone.localdate())
        serializer = self.get_serializer(habit, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="public")
    def public_list(self, request):
        owner_id = request.query_params.get("owner_id")
        habit_id = request.query_params.get("habit_id")
        search = (request.query_params.get("q") or "").strip()
        try:
            limit = int(request.query_params.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 100))
        try:
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            offset = 0
        offset = max(0, offset)

        copied_subquery = HabitCopy.objects.filter(
            user=request.user,
            source_habit_id=OuterRef("pk"),
        )

        queryset = (
            Habit.objects.filter(visibility="Публичный")
            .select_related("owner", "category")
            .annotate(
                participants_count=Count("habit_copies", distinct=True),
                is_copied=Exists(copied_subquery),
            )
            .order_by("-participants_count", "-created_at", "id")
        )

        owner_id_int = None
        if owner_id:
            try:
                owner_id_int = int(owner_id)
            except (TypeError, ValueError):
                return Response({"detail": "owner_id must be integer"}, status=status.HTTP_400_BAD_REQUEST)

        if owner_id_int is not None:
            queryset = queryset.filter(owner_id=owner_id_int)
        if habit_id:
            try:
                habit_id_int = int(habit_id)
            except (TypeError, ValueError):
                return Response({"detail": "habit_id must be integer"}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(pk=habit_id_int)
        if search:
            queryset = queryset.filter(title__icontains=search)

        total = queryset.count()
        habits = list(queryset[offset: offset + limit])
        habit_ids = [item.id for item in habits]
        copy_rows = (
            HabitCopy.objects.filter(source_habit_id__in=habit_ids)
            .select_related("user")
            .order_by("source_habit_id", "-created_at")
        )
        preview_map: dict[int, list[dict]] = {}
        for row in copy_rows:
            preview = preview_map.setdefault(row.source_habit_id, [])
            if len(preview) >= 5:
                continue
            participant = row.user
            preview.append({
                "id": participant.id,
                "name": participant.first_name or participant.username or f"User {participant.id}",
                "avatar": participant.photo_url,
            })

        items = []
        for habit in habits:
            owner = habit.owner
            repeat_days = habit.repeat_days or []
            items.append({
                "id": habit.id,
                "title": habit.title,
                "icon": habit.icon,
                "goal": habit.goal,
                "frequency": f"{habit.goal} раз в день",
                "repeat_days": repeat_days,
                "days": ", ".join(repeat_days) if repeat_days else "Каждый день",
                "category": habit.category.name if habit.category else "",
                "copied_count": int(max(habit.copied_count, getattr(habit, "participants_count", 0))),
                "participants_count": int(getattr(habit, "participants_count", 0)),
                "participants_preview": preview_map.get(habit.id, []),
                "author": {
                    "id": owner.id,
                    "name": owner.first_name or owner.username or f"User {owner.id}",
                    "avatar": owner.photo_url,
                    "is_premium": _is_premium_active(owner),
                },
                "is_copied": bool(getattr(habit, "is_copied", False)),
                "can_copy": owner.id != request.user.id and not bool(getattr(habit, "is_copied", False)),
            })

        return Response({
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": items,
        })

    @action(detail=True, methods=["get"], url_path="participants")
    def participants(self, request, pk=None):
        habit = self.get_object()
        source_habit = habit
        if habit.source_habit_id:
            try:
                source_habit = Habit.objects.select_related("owner").get(pk=habit.source_habit_id)
            except Habit.DoesNotExist:
                return Response({"total": 0, "items": []})

        has_copies = HabitCopy.objects.filter(source_habit=source_habit).exists()
        if source_habit.visibility != "Публичный" and not has_copies and not habit.source_habit_id:
            return Response({"total": 0, "items": []})

        owner = source_habit.owner
        items = [{
            "id": owner.id,
            "name": owner.first_name or owner.username or f"User {owner.id}",
            "avatar": owner.photo_url,
            "is_premium": _is_premium_active(owner),
            "is_author": True,
        }]

        copies = (
            HabitCopy.objects.filter(source_habit=source_habit)
            .select_related("user")
            .order_by("-created_at")
        )
        for copy in copies:
            participant = copy.user
            items.append({
                "id": participant.id,
                "name": participant.first_name or participant.username or f"User {participant.id}",
                "avatar": participant.photo_url,
                "is_premium": _is_premium_active(participant),
                "is_author": False,
            })

        return Response({
            "total": len(items),
            "items": items,
        })

    @action(detail=True, methods=["get"], url_path="participant-stats")
    def participant_stats(self, request, pk=None):
        habit = self.get_object()
        source_habit = habit
        if habit.source_habit_id:
            try:
                source_habit = Habit.objects.select_related("owner").get(pk=habit.source_habit_id)
            except Habit.DoesNotExist:
                return Response({"detail": "Source habit not found"}, status=status.HTTP_404_NOT_FOUND)

        has_copies = HabitCopy.objects.filter(source_habit=source_habit).exists()
        if source_habit.visibility != "Публичный" and not has_copies and not habit.source_habit_id:
            return Response({"detail": "Habit is not social"}, status=status.HTTP_400_BAD_REQUEST)

        user_id_param = request.query_params.get("user_id")
        if not user_id_param:
            return Response({"detail": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id = int(user_id_param)
        except (TypeError, ValueError):
            return Response({"detail": "user_id must be integer"}, status=status.HTTP_400_BAD_REQUEST)

        participant_ids = set(
            HabitCopy.objects.filter(source_habit=source_habit).values_list("user_id", flat=True)
        )
        participant_ids.add(source_habit.owner_id)
        if user_id not in participant_ids:
            return Response({"detail": "Participant not found"}, status=status.HTTP_404_NOT_FOUND)

        if user_id == source_habit.owner_id:
            participant_habit = (
                Habit.objects.filter(pk=source_habit.pk)
                .select_related("category")
                .prefetch_related("completions")
                .first()
            )
        else:
            participant_habit = (
                Habit.objects.filter(owner_id=user_id, source_habit_id=source_habit.id)
                .select_related("category")
                .prefetch_related("completions")
                .first()
            )
        if not participant_habit:
            return Response({"detail": "Participant habit not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(participant_habit, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        habit = self.get_object()
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if not start or not end:
            return Response({"detail": "start and end are required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start_date = date.fromisoformat(start)
            end_date = date.fromisoformat(end)
        except ValueError:
            return Response({"detail": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        if start_date > end_date:
            return Response({"detail": "start must be <= end"}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        stats_days_limit = _get_stats_days_limit(request.user)
        allowed_start = today - timedelta(days=stats_days_limit - 1)
        if start_date < allowed_start or end_date > today:
            return Response(
                {"detail": f"Period exceeds role limit ({stats_days_limit} days)"},
                status=status.HTTP_403_FORBIDDEN,
            )

        completions = HabitCompletion.objects.filter(
            habit=habit, date__range=(start_date, end_date)
        ).order_by("date")
        total = sum(item.count for item in completions)
        payload = {
            "habit_id": habit.id,
            "total": total,
            "items": [{"date": item.date.isoformat(), "count": item.count} for item in completions],
        }
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats_all(self, request):
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if not start or not end:
            return Response({"detail": "start and end are required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start_date = date.fromisoformat(start)
            end_date = date.fromisoformat(end)
        except ValueError:
            return Response({"detail": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        if start_date > end_date:
            return Response({"detail": "start must be <= end"}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        stats_days_limit = _get_stats_days_limit(request.user)
        allowed_start = today - timedelta(days=stats_days_limit - 1)
        if start_date < allowed_start or end_date > today:
            return Response(
                {"detail": f"Period exceeds role limit ({stats_days_limit} days)"},
                status=status.HTTP_403_FORBIDDEN,
            )

        habits = self.get_queryset()
        completions = HabitCompletion.objects.filter(
            habit__in=habits, date__range=(start_date, end_date)
        )
        totals_by_habit = {}
        for item in completions:
            totals_by_habit[item.habit_id] = totals_by_habit.get(item.habit_id, 0) + item.count

        data = []
        total = 0
        for habit in habits:
            count = totals_by_habit.get(habit.id, 0)
            total += count
            data.append({
                "id": habit.id,
                "title": habit.title,
                "category": habit.category.name if habit.category else "",
                "count": count
            })

        return Response({"total": total, "habits": data})

    @action(detail=False, methods=["get"], url_path="balance")
    def balance(self, request):
        return Response(_serialize_balance(request.user))


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all().order_by("id")
    serializer_class = CategorySerializer


class XpViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get"]

    def get_queryset(self):
        return User.objects.none()

    @action(detail=False, methods=["get"], url_path="progress")
    def progress(self, request):
        user = request.user
        today = timezone.localdate()
        streak_days = _calculate_streak_days(user, today)
        multiplier = _get_streak_multiplier(streak_days)
        habits_today = (
            HabitCompletion.objects.filter(
                habit__owner=user, date=today, count__gte=F("habit__goal")
            )
            .values("habit_id")
            .distinct()
            .count()
        )
        daily_cap = _get_daily_cap(habits_today)
        redis = _get_redis()
        day_key = f"xp:day:{user.id}:{today.isoformat()}"
        base_today = int(redis.get(day_key) or 0) if redis else 0
        title = _resolve_title(user)
        return Response({
            "xp": _get_user_live_xp(user),
            "level": user.level,
            "title": title.name if title else "",
            "streak_days": streak_days,
            "streak_multiplier": multiplier,
            "daily_cap": daily_cap,
            "daily_base_xp": base_today,
            "premium_multiplier": PREMIUM_XP_MULTIPLIER if user.premium_expiration and user.premium_expiration > timezone.now() else 1.0,
        })

    @action(detail=False, methods=["get"], url_path="quests")
    def quests(self, request):
        user = request.user
        _check_and_award_quests(user, timezone.localdate())
        today = timezone.localdate()
        quests = list(Quest.objects.filter(is_active=True).order_by("group", "order"))
        progress_map = _build_quests_progress_map(user, quests, today)
        completed_map = {
            uq.quest_id: uq
            for uq in UserQuest.objects.filter(user=user, quest__in=quests)
        }
        items = []
        for quest in quests:
            uq = completed_map.get(quest.id)
            progress = progress_map.get(quest.id, {"current": 0, "target": max(quest.target, 1), "show": False})
            items.append({
                "code": quest.code,
                "title": quest.title,
                "description": quest.description,
                "xp": quest.xp,
                "group": quest.group,
                "type": quest.type,
                "target": quest.target,
                "metadata": quest.metadata,
                "order": quest.order,
                "completed": bool(uq),
                "completed_at": uq.completed_at.isoformat() if uq and uq.completed_at else None,
                "xp_awarded": uq.xp_awarded if uq else 0,
                "progress_current": progress["current"],
                "progress_target": progress["target"],
                "progress_percent": int(round((progress["current"] / max(progress["target"], 1)) * 100)),
                "show_progress": bool(progress["show"]),
            })
        return Response({"items": items})

    @action(detail=False, methods=["get"], url_path="titles")
    def titles(self, request):
        user = request.user
        _sync_user_title(user, save=True)
        return Response({"items": _serialize_titles(user)})

    @action(detail=False, methods=["get"], url_path="leaderboard")
    def leaderboard(self, request):
        range_key = request.query_params.get("range", "month")
        user = request.user
        try:
            limit = int(request.query_params.get("limit", LEADERBOARD_DEFAULT_LIMIT))
        except (TypeError, ValueError):
            limit = LEADERBOARD_DEFAULT_LIMIT
        return Response(_build_leaderboard_payload(user, range_key=range_key, limit=limit))
