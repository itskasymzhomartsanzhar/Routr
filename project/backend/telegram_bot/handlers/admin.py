
import logging
import asyncio
from datetime import timedelta
from django.utils import timezone
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.enums import ParseMode

from api.models import User
from telegram_bot.translations import get_text
from telegram_bot.keyboards import Keyboards
from telegram_bot.config import ADMIN_IDS, AdminBroadcast

logger = logging.getLogger(__name__)

admin_router = Router(name='admin')


def is_admin(user_id: int) -> bool:
    """Check if user is admin"""
    return user_id in ADMIN_IDS


@admin_router.message(Command('admin'))
async def admin_command(message: Message, state: FSMContext):
    """Handle /admin command - show admin panel"""
    user_id = message.from_user.id

    if not is_admin(user_id):
        await message.answer(get_text('ru', 'admin_only'))
        return

    keyboard = Keyboards.admin_panel('ru')
    await message.answer(
        get_text('ru', 'admin_panel'),
        reply_markup=keyboard
    )


@admin_router.callback_query(F.data == 'admin_stats')
async def admin_stats(callback: CallbackQuery):
    """Show user statistics"""
    await callback.answer()

    user_id = callback.from_user.id
    if not is_admin(user_id):
        return

    from asgiref.sync import sync_to_async

    total_users = await sync_to_async(User.objects.count)()
    active_users = await sync_to_async(User.objects.filter(is_active=True).count)()

    today = timezone.now().date()
    today_users = await sync_to_async(
        User.objects.filter(date_joined__date=today).count
    )()

    week_ago = timezone.now() - timedelta(days=7)
    week_users = await sync_to_async(
        User.objects.filter(date_joined__gte=week_ago).count
    )()

    premium_users = await sync_to_async(
        User.objects.filter(
            premium_expiration__isnull=False,
            premium_expiration__gt=timezone.now()
        ).count
    )()

    stats_text = get_text(
        'ru',
        'stats_message',
        total_users=total_users,
        active_users=active_users,
        today_users=today_users,
        week_users=week_users,
        premium_users=premium_users
    )

    keyboard = Keyboards.admin_back('ru')
    await callback.message.edit_text(
        stats_text,
        reply_markup=keyboard,
        parse_mode=ParseMode.HTML
    )


@admin_router.callback_query(F.data == 'admin_broadcast')
async def admin_broadcast_start(callback: CallbackQuery, state: FSMContext):
    """Start broadcast process"""
    await callback.answer()

    user_id = callback.from_user.id
    if not is_admin(user_id):
        return

    await state.update_data(admin_language='ru')

    await callback.message.edit_text(
        get_text('ru', 'broadcast_start')
    )

    await state.set_state(AdminBroadcast.waiting_message)


@admin_router.message(AdminBroadcast.waiting_message)
async def admin_broadcast_receive(message: Message, state: FSMContext):
    """Receive broadcast message and ask for confirmation"""
    data = await state.get_data()
    language = 'ru'

    await state.update_data(
        broadcast_message_id=message.message_id,
        broadcast_chat_id=message.chat.id
    )

    from asgiref.sync import sync_to_async
    user_count = await sync_to_async(User.objects.filter(is_active=True).count)()

    keyboard = Keyboards.broadcast_confirm(language)
    await message.answer(
        get_text(language, 'broadcast_confirm', count=user_count),
        reply_markup=keyboard
    )

    await state.set_state(AdminBroadcast.confirming)


@admin_router.callback_query(F.data.startswith('broadcast_confirm_'), AdminBroadcast.confirming)
async def admin_broadcast_confirm(callback: CallbackQuery, state: FSMContext):
    """Confirm and execute broadcast"""
    await callback.answer()

    data = await state.get_data()
    language = 'ru'
    response = callback.data.split('_')[-1]

    if response == 'no':
        await callback.message.edit_text(
            get_text(language, 'broadcast_cancelled')
        )
        await state.clear()
        return

    message_id = data.get('broadcast_message_id')
    chat_id = data.get('broadcast_chat_id')

    if not message_id or not chat_id:
        await callback.message.edit_text(get_text(language, 'error_occurred'))
        await state.clear()
        return

    await callback.message.edit_text(
        get_text(language, 'broadcast_started')
    )

    from asgiref.sync import sync_to_async
    users = await sync_to_async(list)(User.objects.filter(is_active=True))

    sent_count = 0
    error_count = 0

    for user in users:
        try:
            await callback.bot.copy_message(
                chat_id=user.telegram_id,
                from_chat_id=chat_id,
                message_id=message_id
            )
            sent_count += 1
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.error(f"Error sending broadcast to {user.telegram_id}: {e}")
            error_count += 1

    await callback.message.answer(
        get_text(language, 'broadcast_completed', sent=sent_count, errors=error_count)
    )

    await state.clear()


@admin_router.callback_query(F.data == 'admin_panel')
async def admin_panel_callback(callback: CallbackQuery):
    """Return to admin panel"""
    await callback.answer()

    user_id = callback.from_user.id
    if not is_admin(user_id):
        return

    keyboard = Keyboards.admin_panel('ru')
    await callback.message.edit_text(
        get_text('ru', 'admin_panel'),
        reply_markup=keyboard
    )


@admin_router.callback_query(F.data == 'admin_users')
async def admin_users(callback: CallbackQuery):
    """Show users management (placeholder for future features)"""
    await callback.answer()

    user_id = callback.from_user.id
    if not is_admin(user_id):
        return

    keyboard = Keyboards.admin_back('ru')
    await callback.message.edit_text(
        "👥 Управление пользователями\n\n(В разработке)",
        reply_markup=keyboard
    )
