from decimal import Decimal

from django.core.management.base import BaseCommand

from api.models import Product


class Command(BaseCommand):
    help = "Sync product benefit fields from product names/descriptions"

    def handle(self, *args, **options):
        updated = 0
        for product in Product.objects.all():
            name = (product.name or "").lower()
            description = (product.description or "").lower()
            text = f"{name} {description}"

            is_premium = "премиум" in text or "premium" in text
            xp_multiplier = Decimal("1.0")
            extra_habits = 0
            shields = 0

            if "бустер xp" in text:
                if "×3" in text or "x3" in text:
                    xp_multiplier = Decimal("3.0")
                elif "×1.5" in text or "x1.5" in text or "x1,5" in text or "×1,5" in text:
                    xp_multiplier = Decimal("1.5")

            if "дополнительная привычка" in text:
                extra_habits = 1

            if "щит" in text and "streak" in text:
                if "5 шт" in text:
                    shields = 5
                else:
                    shields = 1

            changes = []
            if product.is_premium != is_premium:
                product.is_premium = is_premium
                changes.append("is_premium")
            if product.xp_multiplier != xp_multiplier:
                product.xp_multiplier = xp_multiplier
                changes.append("xp_multiplier")
            if product.extra_habit_slots != extra_habits:
                product.extra_habit_slots = extra_habits
                changes.append("extra_habit_slots")
            if product.streak_shields != shields:
                product.streak_shields = shields
                changes.append("streak_shields")

            if changes:
                product.save(update_fields=changes)
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated products: {updated}"))
