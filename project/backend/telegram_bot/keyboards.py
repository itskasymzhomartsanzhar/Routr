from aiogram.types import InlineKeyboardMarkup, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

from telegram_bot.translations import get_text
from telegram_bot.config import WEBAPP_URL


class Keyboards:
    """Factory class for creating bot keyboards"""

    @staticmethod
    def webapp_button(language: str = 'ru', *, url: str | None = None, text: str | None = None) -> InlineKeyboardMarkup:
        """WebApp access button"""
        builder = InlineKeyboardBuilder()
        builder.button(
            text=text or get_text(language, 'open_webapp'),
            web_app=WebAppInfo(url=url or WEBAPP_URL)
        )
        return builder.as_markup()

    @staticmethod
    def admin_panel(language: str = 'ru') -> InlineKeyboardMarkup:
        """Admin panel main menu"""
        builder = InlineKeyboardBuilder()
        builder.button(
            text=get_text(language, 'admin_stats'),
            callback_data='admin_stats'
        )
        builder.button(
            text=get_text(language, 'admin_broadcast'),
            callback_data='admin_broadcast'
        )
        builder.button(
            text=get_text(language, 'admin_users'),
            callback_data='admin_users'
        )
        builder.adjust(1)
        return builder.as_markup()

    @staticmethod
    def admin_back(language: str = 'ru') -> InlineKeyboardMarkup:
        """Back to admin panel button"""
        builder = InlineKeyboardBuilder()
        builder.button(
            text=get_text(language, 'admin_back'),
            callback_data='admin_panel'
        )
        return builder.as_markup()

    @staticmethod
    def broadcast_confirm(language: str = 'ru') -> InlineKeyboardMarkup:
        """Confirm broadcast keyboard"""
        builder = InlineKeyboardBuilder()
        builder.button(
            text=get_text(language, 'broadcast_yes'),
            callback_data='broadcast_confirm_yes'
        )
        builder.button(
            text=get_text(language, 'broadcast_no'),
            callback_data='broadcast_confirm_no'
        )
        builder.adjust(2)
        return builder.as_markup()

