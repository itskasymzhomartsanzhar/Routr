
import logging
import re
import asyncio
from urllib.parse import urlencode

from aiogram import Router
from aiogram.types import Message
from aiogram.filters import Command, CommandStart, CommandObject
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.utils.deep_linking import decode_payload

from api.models import Payment, Product, User
from api.robokassa import RobokassaError, create_invoice_link
from telegram_bot.keyboards import Keyboards
from telegram_bot.config import WEBAPP_URL

logger = logging.getLogger(__name__)

user_router = Router(name='user')


def _extract_profile_id(payload: str) -> int | None:
    payload = (payload or '').strip()
    if payload.startswith('start='):
        payload = payload.split('start=', 1)[1]
    match = re.search(r'profile_(\d+)', payload)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def _extract_habit_id(payload: str) -> int | None:
    payload = (payload or '').strip()
    if payload.startswith('start='):
        payload = payload.split('start=', 1)[1]
    match = re.search(r'habit_(\d+)', payload)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def _build_profile_webapp_url(profile_user_id: int) -> str:
    base_url = WEBAPP_URL.rstrip('/')
    query = urlencode({'profile_user_id': profile_user_id})
    return f'{base_url}/stats?{query}'


def _build_habit_webapp_url(habit_id: int) -> str:
    base_url = WEBAPP_URL.rstrip('/')
    query = urlencode({'public_habit_id': habit_id})
    return f'{base_url}/stats?{query}'


def _decode_start_payload(args: str | None) -> str:
    if not args:
        return ''
    try:
        return decode_payload(args)
    except Exception:
        return args


async def _get_or_create_user(message: Message) -> tuple[User, bool]:
    telegram_user = message.from_user
    user = await User.objects.filter(telegram_id=telegram_user.id).afirst()
    created = False

    if user:
        changed = False
        first_name = telegram_user.first_name or ''
        username = telegram_user.username or ''
        if user.first_name != first_name:
            user.first_name = first_name
            changed = True
        if user.username != username:
            user.username = username
            changed = True
        if user.language_code != 'ru':
            user.language_code = 'ru'
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if changed:
            await user.asave()
        return user, created

    user = await User.objects.acreate(
        telegram_id=telegram_user.id,
        username=telegram_user.username or '',
        first_name=telegram_user.first_name or '',
        photo_url='',
        language_code='ru',
        is_active=True,
    )
    created = True
    return user, created


async def _send_default_webapp(message: Message, user: User, *, created: bool):
    keyboard = Keyboards.webapp_button('ru')
    text = (
        f"🎉 Добро пожаловать в Routr, {user.first_name}!\n\nНажмите кнопку ниже, чтобы открыть приложение:"
        if created
        else f"👋 С возвращением, {user.first_name}!\n\nНажмите кнопку ниже, чтобы открыть Routr:"
    )
    await message.answer(text, reply_markup=keyboard)


async def _send_profile_webapp(message: Message, profile_user_id: int):
    target_user = await User.objects.filter(id=profile_user_id, is_active=True).afirst()
    if not target_user:
        await message.answer("Профиль не найден.")
        return
    display_name = target_user.first_name or target_user.username or f'User {target_user.id}'
    keyboard = Keyboards.webapp_button(
        'ru',
        url=_build_profile_webapp_url(target_user.id),
        text='Открыть профиль',
    )
    await message.answer(
        f'Посмотри профиль пользователя {display_name}',
        reply_markup=keyboard
    )


async def _send_habit_webapp(message: Message, habit_id: int):
    keyboard = Keyboards.webapp_button(
        'ru',
        url=_build_habit_webapp_url(habit_id),
        text='Открыть привычку',
    )
    await message.answer(
        'Посмотри эту привычку',
        reply_markup=keyboard
    )


@user_router.message(Command("buy"))
async def buy_command(message: Message, command: CommandObject):
    try:
        user, _created = await _get_or_create_user(message)
    except Exception:
        await message.answer("Не удалось определить пользователя.")
        return

    raw_arg = (command.args or "").strip()
    try:
        product_id = int(raw_arg) if raw_arg else None
    except ValueError:
        await message.answer("Используйте: /buy или /buy <product_id>")
        return

    product_qs = Product.objects.filter(is_active=True, currency__iexact="RUB").order_by("created_at")
    if product_id:
        product_qs = product_qs.filter(id=product_id)
    product = await product_qs.afirst()
    if not product:
        await message.answer("RUB-продукт для оплаты не найден.")
        return

    try:
        payment = await Payment.objects.acreate(
            user=user,
            product=product,
            provider=Payment.PROVIDER_ROBOKASSA,
            invoice_id=0,
            amount=product.price,
            currency="RUB",
            status=Payment.STATUS_PENDING,
            metadata={"source": "bot_command"},
        )
        payment.invoice_id = payment.id
        await payment.asave(update_fields=["invoice_id"])
        payment_url = await asyncio.to_thread(create_invoice_link, payment)
    except RobokassaError as exc:
        await message.answer(f"Ошибка создания платежа: {exc}")
        return
    except Exception:
        await message.answer("Не удалось создать платеж. Попробуйте позже.")
        return

    kb = InlineKeyboardBuilder()
    kb.button(text=f"Оплатить {product.name}", url=payment_url)
    await message.answer(
        f"Оплата: {product.name}\nСумма: {product.price} RUB",
        reply_markup=kb.as_markup(),
    )


@user_router.message(CommandStart())
async def start_command(message: Message, command: CommandObject):
    raw_args = command.args or ''
    payload = _decode_start_payload(raw_args)
    profile_user_id = _extract_profile_id(payload) or _extract_profile_id(raw_args)
    habit_id = _extract_habit_id(payload) or _extract_habit_id(raw_args)
    try:
        user, created = await _get_or_create_user(message)
        if profile_user_id:
            await _send_profile_webapp(message, profile_user_id)
        elif habit_id:
            await _send_habit_webapp(message, habit_id)
        else:
            await _send_default_webapp(message, user, created=created)
    except Exception as e:
        logger.error(f"Error in start_command: {e}")
        await message.answer("❌ Произошла ошибка. Попробуйте еще раз.")
