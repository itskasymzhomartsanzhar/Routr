import asyncio
import logging
import time
from datetime import timedelta

from asgiref.sync import sync_to_async
from aiogram.exceptions import TelegramRetryAfter
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from django.core.cache import cache
from django.utils import timezone
from django_redis import get_redis_connection

from api.models import Habit, HabitCompletion
from telegram_bot.config import WEBAPP_URL

logger = logging.getLogger(__name__)

WEEKDAY_NAMES_RU = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
]

INDEX_VERSION_KEY = "tg:reminder:index:version"
INDEX_REBUILD_TS_KEY = "tg:reminder:index:rebuilt_at"
INDEX_LOCK_KEY = "tg:reminder:index:rebuild_lock"
INDEX_KEY_PREFIX = "tg:reminder:index"
INDEX_REBUILD_INTERVAL_SECONDS = 300
INDEX_VERSION_TTL_SECONDS = 7200
SEND_CONCURRENCY = 30
GATHER_CHUNK_SIZE = 500


def _is_due_time(reminder_times, now_hhmm: str) -> bool:
    if not isinstance(reminder_times, list):
        return False
    for value in reminder_times:
        if isinstance(value, str) and value[:5] == now_hhmm:
            return True
    return False


def _normalize_hhmm(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if len(value) < 5:
        return None
    candidate = value[:5]
    if len(candidate) != 5 or candidate[2] != ":":
        return None
    hh = candidate[:2]
    mm = candidate[3:5]
    if not (hh.isdigit() and mm.isdigit()):
        return None
    hhi = int(hh)
    mmi = int(mm)
    if hhi < 0 or hhi > 23 or mmi < 0 or mmi > 59:
        return None
    return f"{hhi:02d}:{mmi:02d}"


def _collect_unique_hhmm(reminder_times) -> set[str]:
    if not isinstance(reminder_times, list):
        return set()
    result: set[str] = set()
    for value in reminder_times:
        parsed = _normalize_hhmm(value)
        if parsed:
            result.add(parsed)
    return result


def _is_scheduled_for_today(repeat_days, today_weekday_ru: str) -> bool:
    if not isinstance(repeat_days, list) or not repeat_days:
        return True
    return today_weekday_ru in repeat_days


def _dedupe_key(habit_id: int, now_hhmm: str, today_iso: str) -> str:
    return f"tg:reminder:habit:{habit_id}:{today_iso}:{now_hhmm}"


def _seconds_to_day_end() -> int:
    now = timezone.now()
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    ttl = int((tomorrow - now).total_seconds()) + 3600
    return max(ttl, 3600)


def _build_reminder_keyboard() -> InlineKeyboardMarkup:
    url = WEBAPP_URL.rstrip("/")
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть Routr", web_app={"url": url})]]
    )


def _build_reminder_text(habit) -> str:
    icon = (habit.icon or "").strip()
    prefix = f"{icon} " if icon else ""
    return (
        "Пора отметить привычку\n"
        f"{prefix}{habit.title}\n\n"
        "Откройте Routr и зафиксируйте выполнение."
    )


def _get_redis():
    try:
        return get_redis_connection("default")
    except Exception:
        return None


def _acquire_rebuild_lock(redis) -> bool:
    return bool(redis.set(INDEX_LOCK_KEY, "1", nx=True, ex=180))


def _rebuild_index_sync() -> bool:
    redis = _get_redis()
    if redis is None:
        return False
    if not _acquire_rebuild_lock(redis):
        return False

    version = str(int(time.time()))
    pipe = redis.pipeline(transaction=False)
    op_count = 0

    queryset = Habit.objects.filter(
        reminder=True,
        owner__is_active=True,
        owner__notification_habit=True,
        owner__telegram_id__isnull=False,
    ).only("id", "reminder_times")

    for habit in queryset.iterator(chunk_size=3000):
        for hhmm in _collect_unique_hhmm(habit.reminder_times):
            pipe.sadd(f"{INDEX_KEY_PREFIX}:{version}:m:{hhmm}", int(habit.id))
            op_count += 1
            if op_count >= 10000:
                pipe.execute()
                op_count = 0

    for i in range(24):
        for j in range(60):
            pipe.expire(f"{INDEX_KEY_PREFIX}:{version}:m:{i:02d}:{j:02d}", INDEX_VERSION_TTL_SECONDS)
    pipe.set(INDEX_VERSION_KEY, version, ex=INDEX_VERSION_TTL_SECONDS)
    pipe.set(INDEX_REBUILD_TS_KEY, str(int(time.time())), ex=INDEX_VERSION_TTL_SECONDS)
    pipe.execute()
    return True


def _ensure_index_sync(force: bool = False) -> None:
    redis = _get_redis()
    if redis is None:
        return
    if force:
        _rebuild_index_sync()
        return

    last = redis.get(INDEX_REBUILD_TS_KEY)
    now_ts = int(time.time())
    if not last:
        _rebuild_index_sync()
        return

    try:
        last_ts = int(last)
    except Exception:
        _rebuild_index_sync()
        return

    if now_ts - last_ts >= INDEX_REBUILD_INTERVAL_SECONDS:
        _rebuild_index_sync()


def _get_due_habit_ids_from_index_sync(now_hhmm: str) -> list[int]:
    redis = _get_redis()
    if redis is None:
        return []

    version = redis.get(INDEX_VERSION_KEY)
    if not version:
        return []
    if isinstance(version, bytes):
        version = version.decode("utf-8")

    raw_ids = redis.smembers(f"{INDEX_KEY_PREFIX}:{version}:m:{now_hhmm}") or []
    if not raw_ids:
        return []

    result: list[int] = []
    for raw in raw_ids:
        try:
            result.append(int(raw))
        except Exception:
            continue
    return result


async def _ensure_index(force: bool = False) -> None:
    await sync_to_async(_ensure_index_sync, thread_sensitive=False)(force)


async def _get_due_habit_ids_from_index(now_hhmm: str) -> list[int]:
    return await sync_to_async(_get_due_habit_ids_from_index_sync, thread_sensitive=False)(now_hhmm)


async def _fetch_candidate_habits_fallback():
    queryset = Habit.objects.filter(
        reminder=True,
        owner__is_active=True,
        owner__notification_habit=True,
        owner__telegram_id__isnull=False,
    ).select_related("owner").only(
        "id",
        "title",
        "icon",
        "goal",
        "repeat_days",
        "reminder_times",
        "owner_id",
        "owner__telegram_id",
    )
    return await sync_to_async(lambda: list(queryset.iterator(chunk_size=2000)))()


async def _fetch_habits_by_ids(habit_ids: list[int]):
    if not habit_ids:
        return []
    queryset = Habit.objects.filter(
        id__in=habit_ids,
        reminder=True,
        owner__is_active=True,
        owner__notification_habit=True,
        owner__telegram_id__isnull=False,
    ).select_related("owner").only(
        "id",
        "title",
        "icon",
        "goal",
        "repeat_days",
        "reminder_times",
        "owner_id",
        "owner__telegram_id",
    )
    return await sync_to_async(lambda: list(queryset.iterator(chunk_size=2000)))()


async def _fetch_today_completion_map(habit_ids: list[int]):
    if not habit_ids:
        return {}
    today = timezone.localdate()
    rows = HabitCompletion.objects.filter(habit_id__in=habit_ids, date=today).values_list("habit_id", "count")
    pairs = await sync_to_async(list)(rows)
    return {int(hid): int(cnt or 0) for hid, cnt in pairs}


async def process_due_reminders(bot) -> int:
    now = timezone.localtime()
    now_hhmm = now.strftime("%H:%M")
    today_weekday_ru = WEEKDAY_NAMES_RU[now.weekday()]
    today_iso = now.date().isoformat()
    ttl = _seconds_to_day_end()

    habit_ids = await _get_due_habit_ids_from_index(now_hhmm)
    if habit_ids:
        habits = await _fetch_habits_by_ids(habit_ids)
    else:
        habits = await _fetch_candidate_habits_fallback()
    if not habits:
        return 0

    due_habits = [
        habit
        for habit in habits
        if _is_due_time(habit.reminder_times, now_hhmm)
        and _is_scheduled_for_today(habit.repeat_days, today_weekday_ru)
    ]
    if not due_habits:
        return 0

    completion_map = await _fetch_today_completion_map([habit.id for habit in due_habits])
    keyboard = _build_reminder_keyboard()
    semaphore = asyncio.Semaphore(SEND_CONCURRENCY)
    sent = 0

    async def _send_one(habit):
        nonlocal sent
        if completion_map.get(habit.id, 0) >= max(int(habit.goal or 1), 1):
            return
        key = _dedupe_key(habit.id, now_hhmm, today_iso)
        if not cache.add(key, 1, timeout=ttl):
            return

        async with semaphore:
            try:
                await bot.send_message(
                    chat_id=habit.owner.telegram_id,
                    text=_build_reminder_text(habit),
                    reply_markup=keyboard,
                )
                sent += 1
            except TelegramRetryAfter as exc:
                await asyncio.sleep(float(getattr(exc, "retry_after", 1)) + 0.1)
                try:
                    await bot.send_message(
                        chat_id=habit.owner.telegram_id,
                        text=_build_reminder_text(habit),
                        reply_markup=keyboard,
                    )
                    sent += 1
                except Exception as retry_exc:
                    logger.warning(
                        "Failed to send reminder after retry: habit_id=%s user_id=%s telegram_id=%s error=%s",
                        habit.id,
                        habit.owner_id,
                        habit.owner.telegram_id,
                        retry_exc,
                    )
            except Exception as exc:
                logger.warning(
                    "Failed to send reminder: habit_id=%s user_id=%s telegram_id=%s error=%s",
                    habit.id,
                    habit.owner_id,
                    habit.owner.telegram_id,
                    exc,
                )

    tasks = [_send_one(habit) for habit in due_habits]
    for i in range(0, len(tasks), GATHER_CHUNK_SIZE):
        await asyncio.gather(*tasks[i : i + GATHER_CHUNK_SIZE])
    return sent


async def run_reminder_loop(bot, poll_interval_seconds: int = 30) -> None:
    await _ensure_index(force=True)
    last_processed_minute: str | None = None
    while True:
        try:
            now = timezone.localtime()
            minute_key = now.strftime("%Y-%m-%d %H:%M")
            if minute_key != last_processed_minute:
                await _ensure_index(force=False)
                count = await process_due_reminders(bot)
                if count:
                    logger.info("Habit reminders sent: %s", count)
                last_processed_minute = minute_key
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Reminder loop error: %s", exc)
        await asyncio.sleep(max(int(poll_interval_seconds), 10))
