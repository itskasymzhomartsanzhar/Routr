"""
Configuration settings for the Telegram bot (aiogram 3.x)
"""

import os
from dotenv import load_dotenv
from aiogram.fsm.state import State, StatesGroup

load_dotenv()

BOT_TOKEN = "8055384836:AAEQcRD8JpY44XpH9SGrf_XFzzvkNs29a6E"
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://aniultra.uz')
BOT_USERNAME = os.getenv('BOT_USERNAME', 'Routr_bot')

ADMIN_IDS = list(map(int, os.getenv('ADMIN_IDS', '').split(','))) if os.getenv('ADMIN_IDS') else []

DJANGO_SETTINGS_MODULE = 'backend.settings'

class AdminBroadcast(StatesGroup):
    """States for admin broadcast"""
    waiting_message = State()
    confirming = State()

DEFAULT_LANGUAGE = 'ru'
