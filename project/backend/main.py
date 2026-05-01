import os
import sys
import logging
import asyncio
import socket
from urllib.parse import quote

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from telegram_bot.config import BOT_PROXY, BOT_TOKEN
from telegram_bot.handlers.user import user_router
from telegram_bot.handlers.admin import admin_router
from telegram_bot.reminders import run_reminder_loop

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    force=True,
)
logger = logging.getLogger(__name__)


def _build_proxy_url(proxy_value: str) -> str | None:
    value = (proxy_value or "").strip()
    if not value:
        return None
    if "://" in value:
        return value

    parts = value.split(":")
    if len(parts) == 4:
        host, port, username, password = parts
        user_quoted = quote(username, safe="")
        pass_quoted = quote(password, safe="")
        return f"http://{user_quoted}:{pass_quoted}@{host}:{port}"

    if len(parts) == 2:
        host, port = parts
        return f"http://{host}:{port}"

    raise RuntimeError(
        "Invalid BOT_PROXY format. Use ip:port:user:pass or http://user:pass@host:port"
    )


def _mask_proxy_for_logs(proxy_url: str | None) -> str:
    if not proxy_url:
        return "disabled"
    if "@" not in proxy_url:
        return proxy_url
    prefix, suffix = proxy_url.split("@", 1)
    scheme = prefix.split("://", 1)[0] if "://" in prefix else "http"
    return f"{scheme}://***:***@{suffix}"


async def main():
    logger.info("Bot bootstrap started")
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not configured")

    proxy_url = _build_proxy_url(BOT_PROXY)
    session = AiohttpSession(timeout=20, proxy=proxy_url)
    session._connector_init["family"] = socket.AF_INET
    logger.info("Bot session created (IPv4 forced, proxy=%s)", _mask_proxy_for_logs(proxy_url))

    bot = Bot(
        token=BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )

    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(admin_router)
    dp.include_router(user_router)
    logger.info("Routers registered")

    me = await bot.get_me()
    webhook_info = await bot.get_webhook_info()
    if webhook_info.url:
        logger.warning("Webhook is set for @%s (%s). Removing it for polling mode.", me.username, webhook_info.url)
        await bot.delete_webhook(drop_pending_updates=True)
    logger.info("🤖 Connected as @%s (id=%s)", me.username, me.id)

    reminder_task = asyncio.create_task(run_reminder_loop(bot))
    logger.info("✅ Bot started successfully!")

    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        reminder_task.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass
        await bot.session.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Stopped")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
