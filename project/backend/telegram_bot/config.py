"""
Configuration settings for the Telegram bot (aiogram 3.x)
"""

import os
from dotenv import load_dotenv
from aiogram.fsm.state import State, StatesGroup

load_dotenv()

BOT_TOKEN = "8055384836:AAEQcRD8JpY44XpH9SGrf_XFzzvkNs29a6E"
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://routr.swifttest.ru").strip()
BOT_USERNAME = os.getenv("BOT_USERNAME", "Routr_bot").strip().lstrip("@")
BOT_PROXY = os.getenv("BOT_PROXY", "185.168.250.249:8000:arzztY:z3yU5W").strip()

ADMIN_IDS = [
    int(item.strip())
    for item in os.getenv("ADMIN_IDS", "").split(",")
    if item.strip().isdigit()
]

DJANGO_SETTINGS_MODULE = "backend.settings"

class AdminBroadcast(StatesGroup):
    waiting_message = State()
    confirming = State()

DEFAULT_LANGUAGE = "ru"
