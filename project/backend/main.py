import os
import sys
import logging
import asyncio

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from telegram_bot.config import BOT_TOKEN
from telegram_bot.handlers.user import user_router
from telegram_bot.handlers.admin import admin_router
from telegram_bot.reminders import run_reminder_loop

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def main():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not configured")

    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )

    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(admin_router)
    dp.include_router(user_router)

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
