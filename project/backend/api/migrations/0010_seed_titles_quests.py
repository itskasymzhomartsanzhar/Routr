from django.db import migrations


def seed_titles_and_quests(apps, schema_editor):
    Title = apps.get_model("api", "Title")
    Quest = apps.get_model("api", "Quest")

    titles = [
        {
            "code": "novice",
            "name": "Новичок",
            "level_min": 1,
            "level_max": 10,
            "requires_premium": False,
            "order": 1,
            "privileges": {
                "daily_active_habits": 2,
                "total_habits": 3,
                "public_habits": 0,
                "public_join_only": True,
                "stats_days": 7,
            },
        },
        {
            "code": "explorer",
            "name": "Исследователь",
            "level_min": 10,
            "level_max": 40,
            "requires_premium": False,
            "order": 2,
            "privileges": {
                "daily_active_habits": 5,
                "total_habits": 8,
                "public_habits": 3,
                "stats_days": 30,
            },
        },
        {
            "code": "leader",
            "name": "Лидер",
            "level_min": 40,
            "level_max": 70,
            "requires_premium": False,
            "order": 3,
            "privileges": {
                "daily_active_habits": 10,
                "total_habits": 15,
                "public_habits": 10,
                "stats_days": 90,
            },
        },
        {
            "code": "mentor",
            "name": "Наставник",
            "level_min": 70,
            "level_max": 100,
            "requires_premium": True,
            "order": 4,
            "privileges": {
                "daily_active_habits": 50,
                "total_habits": 50,
                "public_habits": 10,
                "stats_days": 365,
            },
        },
    ]

    for item in titles:
        Title.objects.update_or_create(code=item["code"], defaults=item)

    quests = [
        {
            "code": "novice_create_habit",
            "title": "Создай первую привычку",
            "description": "После двух стандартных",
            "xp": 25,
            "group": "novice",
            "type": "create_habit",
            "target": 1,
            "order": 1,
        },
        {
            "code": "novice_streak_3",
            "title": "Стрик 3 дня",
            "description": "На любой привычке",
            "xp": 20,
            "group": "novice",
            "type": "streak_days",
            "target": 3,
            "order": 2,
        },
        {
            "code": "novice_balance",
            "title": "Изучи Колесо баланса",
            "description": "Набери 10 баллов в 2 категориях",
            "xp": 15,
            "group": "novice",
            "type": "balance_points",
            "target": 10,
            "metadata": {"categories": 2},
            "order": 3,
        },
        {
            "code": "novice_level_10",
            "title": "Достигни уровня 10",
            "description": "Авто-триггер",
            "xp": 30,
            "group": "novice",
            "type": "level_reached",
            "target": 10,
            "order": 4,
        },
        {
            "code": "explorer_public_create",
            "title": "Создай публичную привычку",
            "description": "Видна всем",
            "xp": 30,
            "group": "explorer",
            "type": "public_habit_created",
            "target": 1,
            "order": 1,
        },
        {
            "code": "explorer_join_public",
            "title": "Присоединись к публичной привычке",
            "description": "Возьми чужую привычку",
            "xp": 25,
            "group": "explorer",
            "type": "join_public_habit",
            "target": 1,
            "order": 2,
        },
        {
            "code": "explorer_share",
            "title": "Поделись привычкой с другом",
            "description": "По ссылке или пригласить",
            "xp": 20,
            "group": "explorer",
            "type": "share_habit",
            "target": 1,
            "order": 3,
        },
        {
            "code": "explorer_streak_7",
            "title": "Стрик 7 дней",
            "description": "На любой привычке",
            "xp": 40,
            "group": "explorer",
            "type": "streak_days",
            "target": 7,
            "order": 4,
        },
        {
            "code": "explorer_level_40",
            "title": "Достигни уровня 40",
            "description": "Авто-триггер",
            "xp": 50,
            "group": "explorer",
            "type": "level_reached",
            "target": 40,
            "order": 5,
        },
        {
            "code": "leader_popular_habit",
            "title": "Популярная привычка",
            "description": "Ее добавили 50+ пользователей",
            "xp": 60,
            "group": "leader",
            "type": "popular_habit",
            "target": 50,
            "metadata": {"min_users": 50},
            "order": 1,
        },
        {
            "code": "leader_streak_14",
            "title": "Стрик 14 дней",
            "description": "На одной привычке",
            "xp": 50,
            "group": "leader",
            "type": "streak_days",
            "target": 14,
            "order": 2,
        },
        {
            "code": "leader_trend_setter",
            "title": "Тренд-сеттер",
            "description": "3 привычки по 10+ добавлений каждая",
            "xp": 75,
            "group": "leader",
            "type": "trend_setter",
            "target": 3,
            "metadata": {"min_additions": 10},
            "order": 3,
        },
        {
            "code": "leader_monthly_1000",
            "title": "Месячный эксперт",
            "description": "1,000 XP за календарный месяц",
            "xp": 80,
            "group": "leader",
            "type": "monthly_xp",
            "target": 1000,
            "metadata": {"period": "month"},
            "order": 4,
        },
        {
            "code": "leader_level_70",
            "title": "Достигни уровня 70",
            "description": "Авто-триггер",
            "xp": 100,
            "group": "leader",
            "type": "level_reached",
            "target": 70,
            "order": 5,
        },
        {
            "code": "mentor_community_support",
            "title": "Поддержка сообщества",
            "description": "5 привычек на 250+ добавлений в сумме",
            "xp": 100,
            "group": "mentor",
            "type": "community_support",
            "target": 250,
            "metadata": {"habits": 5},
            "order": 1,
        },
        {
            "code": "mentor_streak_mentorship",
            "title": "Стрик менторства",
            "description": "10+ человек с 5+ дневным стриком на твоих открытых привычках",
            "xp": 90,
            "group": "mentor",
            "type": "mentor_streak",
            "target": 10,
            "metadata": {"min_user_streak": 5},
            "order": 2,
        },
        {
            "code": "mentor_monthly_2000",
            "title": "Опыта эксперт",
            "description": "2,000 XP за календарный месяц",
            "xp": 120,
            "group": "mentor",
            "type": "monthly_xp",
            "target": 2000,
            "metadata": {"period": "month"},
            "order": 3,
        },
        {
            "code": "mentor_level_100",
            "title": "Достигни уровня 100",
            "description": "Авто-триггер",
            "xp": 150,
            "group": "mentor",
            "type": "level_reached",
            "target": 100,
            "order": 4,
        },
        {
            "code": "mentor_influential",
            "title": "Влиятельный игрок",
            "description": "Привычку добавили 200+ пользователей",
            "xp": 110,
            "group": "mentor",
            "type": "influential_habit",
            "target": 200,
            "order": 5,
        },
    ]

    for item in quests:
        Quest.objects.update_or_create(code=item["code"], defaults=item)


def unseed_titles_and_quests(apps, schema_editor):
    Title = apps.get_model("api", "Title")
    Quest = apps.get_model("api", "Quest")
    Title.objects.filter(code__in=["novice", "explorer", "leader", "mentor"]).delete()
    Quest.objects.filter(code__startswith=("novice_", "explorer_", "leader_", "mentor_")).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_xp_and_quests"),
    ]

    operations = [
        migrations.RunPython(seed_titles_and_quests, unseed_titles_and_quests),
    ]

