
import logging
import re
import asyncio
from urllib.parse import urlencode
from typing import Any

from aiogram import Router
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command, CommandStart, CommandObject
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.utils.deep_linking import decode_payload

from api.models import Payment, Product, Title, User
from api.robokassa import RobokassaError, create_invoice_link
from telegram_bot.keyboards import Keyboards
from telegram_bot.config import WEBAPP_URL

logger = logging.getLogger(__name__)

user_router = Router(name='user')
OFFER_URL = "https://telegra.ph/PUBLICHNAYA-OFERTA-02-25-8"


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


def _extract_buy_product_id(payload: str) -> int | None:
    payload = (payload or '').strip()
    if payload.startswith('start='):
        payload = payload.split('start=', 1)[1]
    match = re.search(r'buy_(\d+)', payload)
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
    return await _upsert_user_from_telegram(telegram_user, message.bot)


async def _resolve_novice_title() -> Title | None:
    novice_title = await Title.objects.filter(code='novice').afirst()
    if novice_title:
        return novice_title
    return await Title.objects.filter(name='Новичок').order_by('order', 'id').afirst()


async def _upsert_user_from_telegram(telegram_user: Any, bot: Any) -> tuple[User, bool]:
    user = await User.objects.filter(telegram_id=telegram_user.id).afirst()
    photo_url = await _get_telegram_photo_url(telegram_user, bot)
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
        if (user.photo_url or '') != photo_url:
            user.photo_url = photo_url
            changed = True
        if user.language_code != 'ru':
            user.language_code = 'ru'
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if changed:
            await user.asave()
        return user, False

    novice_title = await _resolve_novice_title()
    user = await User.objects.acreate(
        telegram_id=telegram_user.id,
        username=telegram_user.username or '',
        first_name=telegram_user.first_name or '',
        photo_url=photo_url,
        language_code='ru',
        is_active=True,
        current_title=novice_title,
    )
    return user, True


async def _get_telegram_photo_url(telegram_user: Any, bot: Any) -> str:
    direct = getattr(telegram_user, 'photo_url', '') or ''
    if direct:
        return direct
    try:
        photos = await bot.get_user_profile_photos(user_id=telegram_user.id, limit=1)
        if not photos or not photos.photos:
            return ''
        best = photos.photos[0][-1]
        file = await bot.get_file(best.file_id)
        file_path = getattr(file, 'file_path', '') or ''
        if not file_path:
            return ''
        return f"https://api.telegram.org/file/bot{bot.token}/{file_path}"
    except Exception as exc:
        logger.warning("Failed to fetch Telegram profile photo for user=%s: %s", telegram_user.id, exc)
        return ''


async def _get_or_create_user_by_callback(callback: CallbackQuery) -> User:
    user, _created = await _upsert_user_from_telegram(callback.from_user, callback.bot)
    return user


async def _get_rub_product(product_id: int | None) -> Product | None:
    qs = Product.objects.filter(is_active=True, currency__iexact="RUB").order_by("created_at")
    if product_id:
        qs = qs.filter(id=product_id)
    return await qs.afirst()


async def _create_payment_url(user: User, product: Product) -> str:
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
    return await asyncio.to_thread(create_invoice_link, payment)


def _offer_keyboard(product_id: int):
    kb = InlineKeyboardBuilder()
    kb.button(text="Оферта", url=OFFER_URL)
    kb.button(text="Согласиться", callback_data=f"offer_accept:{product_id}")
    kb.adjust(1)
    return kb.as_markup()


def _payment_keyboard(product: Product, payment_url: str):
    kb = InlineKeyboardBuilder()
    kb.button(text="Оплатить", url=payment_url)
    return kb.as_markup()


async def _send_offer_message(message: Message, product: Product):
    await message.answer(
        (
            "Перед оплатой ознакомьтесь с публичной офертой.\n"
            "Нажмите «Согласиться», чтобы продолжить."
        ),
        reply_markup=_offer_keyboard(product.id),
    )


async def _send_payment_message(message: Message, user: User, product: Product):
    safe_name = re.sub(r"<[^>]+>", "", product.name or "").strip()
    try:
        payment_url = await _create_payment_url(user, product)
    except RobokassaError as exc:
        await message.answer(f"Ошибка создания платежа: {exc}")
        return
    except Exception:
        await message.answer("Не удалось создать платеж. Попробуйте позже.")
        return

    await message.answer(
        f"Оплата: {safe_name}\nСумма: {product.price} RUB",
        reply_markup=_payment_keyboard(product, payment_url),
    )


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

    product = await _get_rub_product(product_id)
    if not product:
        await message.answer("RUB-продукт для оплаты не найден.")
        return

    if not user.payment_offer_accepted:
        await _send_offer_message(message, product)
        return
    await _send_payment_message(message, user, product)


@user_router.callback_query(lambda c: (c.data or "").startswith("offer_accept:"))
async def offer_accept_callback(callback: CallbackQuery):
    await callback.answer()
    try:
        user = await _get_or_create_user_by_callback(callback)
    except Exception:
        await callback.message.answer("Не удалось определить пользователя.")
        return

    try:
        product_id = int((callback.data or "").split(":", 1)[1])
    except (ValueError, IndexError):
        await callback.message.answer("Некорректный параметр оплаты.")
        return

    product = await _get_rub_product(product_id)
    if not product:
        await callback.message.answer("RUB-продукт для оплаты не найден.")
        return
    safe_name = re.sub(r"<[^>]+>", "", product.name or "").strip()

    if not user.payment_offer_accepted:
        user.payment_offer_accepted = True
        await user.asave(update_fields=["payment_offer_accepted"])

    try:
        payment_url = await _create_payment_url(user, product)
    except RobokassaError as exc:
        await callback.message.answer(f"Ошибка создания платежа: {exc}")
        return
    except Exception:
        await callback.message.answer("Не удалось создать платеж. Попробуйте позже.")
        return

    await callback.message.edit_text(
        f"Оплата: {safe_name}\nСумма: {product.price} RUB\n\nОплатите по ссылке ниже:",
        reply_markup=_payment_keyboard(product, payment_url),
    )


@user_router.message(CommandStart())
async def start_command(message: Message, command: CommandObject):
    raw_args = command.args or ''
    payload = _decode_start_payload(raw_args)
    profile_user_id = _extract_profile_id(payload) or _extract_profile_id(raw_args)
    habit_id = _extract_habit_id(payload) or _extract_habit_id(raw_args)
    buy_product_id = _extract_buy_product_id(payload) or _extract_buy_product_id(raw_args)
    try:
        user, created = await _get_or_create_user(message)
        if profile_user_id:
            await _send_profile_webapp(message, profile_user_id)
        elif habit_id:
            await _send_habit_webapp(message, habit_id)
        elif buy_product_id:
            product = await _get_rub_product(buy_product_id)
            if not product:
                await message.answer("RUB-продукт для оплаты не найден.")
                return
            if not user.payment_offer_accepted:
                await _send_offer_message(message, product)
                return
            await _send_payment_message(message, user, product)
        else:
            await _send_default_webapp(message, user, created=created)
    except Exception as e:
        logger.error(f"Error in start_command: {e}")
        await message.answer("❌ Произошла ошибка. Попробуйте еще раз.")
