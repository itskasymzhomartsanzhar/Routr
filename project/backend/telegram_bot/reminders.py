import asyncio
import logging
import time
from datetime import timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from asgiref.sync import sync_to_async
from aiogram.exceptions import TelegramRetryAfter
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from django.core.cache import cache
from django.conf import settings
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
INDEX_TIMEZONES_KEY_SUFFIX = ":tzs"
INDEX_REBUILD_INTERVAL_SECONDS = 300
INDEX_VERSION_TTL_SECONDS = 7200
SEND_CONCURRENCY = 30
GATHER_CHUNK_SIZE = 500
MORNING_NO_TIME_REMINDER_HHMM = "08:00"


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


def _normalize_timezone_name(value: str | None) -> str:
    fallback = settings.TIME_ZONE or "UTC"
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            try:
                ZoneInfo(candidate)
                return candidate
            except ZoneInfoNotFoundError:
                pass
    try:
        ZoneInfo(fallback)
        return fallback
    except ZoneInfoNotFoundError:
        return "UTC"


def _habit_timezone_name(habit) -> str:
    owner_tz = getattr(habit.owner, "timezone_name", "")
    return _normalize_timezone_name(owner_tz)


def _is_scheduled_for_today(repeat_days, today_weekday_ru: str) -> bool:
    if not isinstance(repeat_days, list) or not repeat_days:
        return True
    return today_weekday_ru in repeat_days


def _dedupe_key(habit_id: int, now_hhmm: str, today_iso: str) -> str:
    return f"tg:reminder:habit:{habit_id}:{today_iso}:{now_hhmm}"


def _daily_no_time_dedupe_key(owner_id: int, today_iso: str) -> str:
    return f"tg:reminder:notime:{owner_id}:{today_iso}:{MORNING_NO_TIME_REMINDER_HHMM}"


def _seconds_to_day_end(now_local) -> int:
    tomorrow = (now_local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    ttl = int((tomorrow - now_local).total_seconds()) + 3600
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


def _build_no_time_summary_text(habits: list) -> str:
    if not habits:
        return ""
    lines = []
    for habit in habits[:20]:
        icon = (habit.icon or "").strip()
        prefix = f"{icon} " if icon else ""
        lines.append(f"• {prefix}{habit.title}")
    hidden_count = max(len(habits) - 20, 0)
    if hidden_count:
        lines.append(f"• И ещё {hidden_count}")
    joined = "\n".join(lines)
    return (
        "Доброе утро!\n"
        "У этих привычек не задано время напоминания:\n\n"
        f"{joined}\n\n"
        "Откройте Routr и отметьте выполнение."
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
        is_archived=False,
        owner__is_active=True,
        owner__notification_habit=True,
        owner__telegram_id__isnull=False,
    ).select_related("owner").only("id", "reminder_times", "end_date", "owner__timezone_name")

    touched_keys: set[str] = set()
    timezone_set_key = f"{INDEX_KEY_PREFIX}:{version}{INDEX_TIMEZONES_KEY_SUFFIX}"

    for habit in queryset.iterator(chunk_size=3000):
        timezone_name = _habit_timezone_name(habit)
        pipe.sadd(timezone_set_key, timezone_name)
        op_count += 1
        reminder_hhmm_values = _collect_unique_hhmm(habit.reminder_times)
        if reminder_hhmm_values:
            for hhmm in reminder_hhmm_values:
                index_key = f"{INDEX_KEY_PREFIX}:{version}:tz:{timezone_name}:m:{hhmm}"
                pipe.sadd(index_key, int(habit.id))
                touched_keys.add(index_key)
                op_count += 1
                if op_count >= 10000:
                    pipe.execute()
                    op_count = 0
        else:
            no_time_key = f"{INDEX_KEY_PREFIX}:{version}:tz:{timezone_name}:notime"
            pipe.sadd(no_time_key, int(habit.id))
            touched_keys.add(no_time_key)
            op_count += 1
            if op_count >= 10000:
                pipe.execute()
                op_count = 0

    pipe.expire(timezone_set_key, INDEX_VERSION_TTL_SECONDS)
    op_count += 1
    for key in touched_keys:
        pipe.expire(key, INDEX_VERSION_TTL_SECONDS)
        op_count += 1
        if op_count >= 10000:
            pipe.execute()
            op_count = 0
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


def _get_due_habit_ids_from_index_sync(now_utc) -> tuple[list[int] | None, list[int]]:
    redis = _get_redis()
    if redis is None:
        return None, []

    version = redis.get(INDEX_VERSION_KEY)
    if not version:
        return None, []
    if isinstance(version, bytes):
        version = version.decode("utf-8")

    timezone_key = f"{INDEX_KEY_PREFIX}:{version}{INDEX_TIMEZONES_KEY_SUFFIX}"
    raw_timezones = redis.smembers(timezone_key) or []
    if not raw_timezones:
        return [], []

    timezone_names_set: set[str] = set()
    for raw_tz in raw_timezones:
        if isinstance(raw_tz, bytes):
            raw_tz = raw_tz.decode("utf-8")
        timezone_names_set.add(_normalize_timezone_name(raw_tz))
    timezone_names = list(timezone_names_set)
    if not timezone_names:
        return [], []

    pipe = redis.pipeline(transaction=False)
    query_plan: list[tuple[str, str]] = []
    for timezone_name in timezone_names:
        local_now = now_utc.astimezone(ZoneInfo(timezone_name))
        local_hhmm = local_now.strftime("%H:%M")
        pipe.smembers(f"{INDEX_KEY_PREFIX}:{version}:tz:{timezone_name}:m:{local_hhmm}")
        query_plan.append(("timed", timezone_name))
        if local_hhmm == MORNING_NO_TIME_REMINDER_HHMM:
            pipe.smembers(f"{INDEX_KEY_PREFIX}:{version}:tz:{timezone_name}:notime")
            query_plan.append(("notime", timezone_name))
    raw_lists = pipe.execute()

    timed_result: list[int] = []
    timed_seen: set[int] = set()
    notime_result: list[int] = []
    notime_seen: set[int] = set()
    for idx, raw_ids in enumerate(raw_lists):
        list_type = query_plan[idx][0] if idx < len(query_plan) else "timed"
        for raw in raw_ids or []:
            try:
                value = int(raw)
            except Exception:
                continue
            if list_type == "notime":
                if value in notime_seen:
                    continue
                notime_seen.add(value)
                notime_result.append(value)
                continue
            if value in timed_seen:
                continue
            timed_seen.add(value)
            timed_result.append(value)
    return timed_result, notime_result


async def _ensure_index(force: bool = False) -> None:
    await sync_to_async(_ensure_index_sync, thread_sensitive=False)(force)


async def _get_due_habit_ids_from_index(now_utc) -> tuple[list[int] | None, list[int]]:
    return await sync_to_async(_get_due_habit_ids_from_index_sync, thread_sensitive=False)(now_utc)


async def _fetch_candidate_habits_fallback():
    queryset = Habit.objects.filter(
        reminder=True,
        is_archived=False,
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
        "end_date",
        "owner_id",
        "owner__timezone_name",
        "owner__telegram_id",
    )
    return await sync_to_async(lambda: list(queryset.iterator(chunk_size=2000)))()


async def _fetch_habits_by_ids(habit_ids: list[int]):
    if not habit_ids:
        return []
    queryset = Habit.objects.filter(
        id__in=habit_ids,
        reminder=True,
        is_archived=False,
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
        "end_date",
        "owner_id",
        "owner__timezone_name",
        "owner__telegram_id",
    )
    return await sync_to_async(lambda: list(queryset.iterator(chunk_size=2000)))()


async def _fetch_completion_map(habit_ids: list[int], now_utc):
    if not habit_ids:
        return {}
    utc_date = now_utc.date()
    min_date = utc_date - timedelta(days=1)
    max_date = utc_date + timedelta(days=1)
    rows = HabitCompletion.objects.filter(
        habit_id__in=habit_ids,
        date__range=(min_date, max_date),
    ).values_list("habit_id", "date", "count")
    triples = await sync_to_async(list)(rows)
    return {
        (int(hid), day.isoformat()): int(cnt or 0)
        for hid, day, cnt in triples
    }


async def process_due_reminders(bot) -> int:
    now_utc = timezone.now().astimezone(dt_timezone.utc)

    timed_habit_ids, no_time_habit_ids = await _get_due_habit_ids_from_index(now_utc)
    if timed_habit_ids is None:
        habits = await _fetch_candidate_habits_fallback()
    else:
        candidate_ids = list(set((timed_habit_ids or []) + (no_time_habit_ids or [])))
        if not candidate_ids:
            return 0
        habits = await _fetch_habits_by_ids(candidate_ids)
    if not habits:
        return 0

    habit_context: dict[int, dict] = {}
    due_habits = []
    due_no_time_habits_by_owner: dict[int, list] = {}
    for habit in habits:
        timezone_name = _habit_timezone_name(habit)
        local_now = now_utc.astimezone(ZoneInfo(timezone_name))
        if habit.end_date and local_now.date() > habit.end_date:
            continue
        local_hhmm = local_now.strftime("%H:%M")
        local_weekday = WEEKDAY_NAMES_RU[local_now.weekday()]
        local_today_iso = local_now.date().isoformat()
        if not _is_scheduled_for_today(habit.repeat_days, local_weekday):
            continue
        has_custom_times = bool(_collect_unique_hhmm(habit.reminder_times))
        habit_context[habit.id] = {
            "local_hhmm": local_hhmm,
            "local_today_iso": local_today_iso,
            "ttl": _seconds_to_day_end(local_now),
        }
        if has_custom_times and _is_due_time(habit.reminder_times, local_hhmm):
            due_habits.append(habit)
            continue
        if not has_custom_times and local_hhmm == MORNING_NO_TIME_REMINDER_HHMM:
            owner_id = int(habit.owner_id)
            due_no_time_habits_by_owner.setdefault(owner_id, []).append(habit)

    if not due_habits and not due_no_time_habits_by_owner:
        return 0

    completion_ids = [habit.id for habit in due_habits]
    for owner_habits in due_no_time_habits_by_owner.values():
        completion_ids.extend([habit.id for habit in owner_habits])
    completion_map = await _fetch_completion_map(list(set(completion_ids)), now_utc)
    keyboard = _build_reminder_keyboard()
    semaphore = asyncio.Semaphore(SEND_CONCURRENCY)
    sent = 0

    async def _send_one(habit):
        nonlocal sent
        context = habit_context.get(habit.id)
        if not context:
            return
        completion_key = (habit.id, context["local_today_iso"])
        if completion_map.get(completion_key, 0) >= max(int(habit.goal or 1), 1):
            return
        key = _dedupe_key(habit.id, context["local_hhmm"], context["local_today_iso"])
        if not cache.add(key, 1, timeout=context["ttl"]):
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

    async def _send_no_time_summary(owner_id: int, owner_habits: list):
        nonlocal sent
        if not owner_habits:
            return
        owner_habits = sorted(owner_habits, key=lambda item: (item.title or "", item.id))
        context = habit_context.get(owner_habits[0].id)
        if not context:
            return
        incomplete_habits = []
        for habit in owner_habits:
            completion_key = (habit.id, context["local_today_iso"])
            if completion_map.get(completion_key, 0) >= max(int(habit.goal or 1), 1):
                continue
            incomplete_habits.append(habit)
        if not incomplete_habits:
            return
        key = _daily_no_time_dedupe_key(owner_id, context["local_today_iso"])
        if not cache.add(key, 1, timeout=context["ttl"]):
            return
        text = _build_no_time_summary_text(incomplete_habits)
        if not text:
            return
        async with semaphore:
            try:
                await bot.send_message(
                    chat_id=incomplete_habits[0].owner.telegram_id,
                    text=text,
                    reply_markup=keyboard,
                )
                sent += 1
            except TelegramRetryAfter as exc:
                await asyncio.sleep(float(getattr(exc, "retry_after", 1)) + 0.1)
                try:
                    await bot.send_message(
                        chat_id=incomplete_habits[0].owner.telegram_id,
                        text=text,
                        reply_markup=keyboard,
                    )
                    sent += 1
                except Exception as retry_exc:
                    logger.warning(
                        "Failed to send no-time summary after retry: owner_id=%s telegram_id=%s error=%s",
                        owner_id,
                        incomplete_habits[0].owner.telegram_id,
                        retry_exc,
                    )
            except Exception as exc:
                logger.warning(
                    "Failed to send no-time summary: owner_id=%s telegram_id=%s error=%s",
                    owner_id,
                    incomplete_habits[0].owner.telegram_id,
                    exc,
                )

    tasks = [_send_one(habit) for habit in due_habits]
    tasks.extend(
        [_send_no_time_summary(owner_id, owner_habits) for owner_id, owner_habits in due_no_time_habits_by_owner.items()]
    )
    for i in range(0, len(tasks), GATHER_CHUNK_SIZE):
        await asyncio.gather(*tasks[i : i + GATHER_CHUNK_SIZE])
    return sent


async def run_reminder_loop(bot, poll_interval_seconds: int = 30) -> None:
    await _ensure_index(force=True)
    last_processed_minute: str | None = None
    while True:
        try:
            now_utc = timezone.now().astimezone(dt_timezone.utc)
            minute_key = now_utc.strftime("%Y-%m-%d %H:%M")
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
