"""
patch_cover_images.py
---------------------
One-shot migration: writes the correct `cover_image` path into every
book row in synapse.db.  Safe to re-run - it only writes values that
differ from what's already stored.

Run from the project root:
    python backend/tools/patch_cover_images.py
"""

import sys
import os

# Make sure project root is on the path
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from backend.database import SessionLocal  # noqa: E402
from backend.models import Book            # noqa: E402

COVER_MAP: dict[str, str] = {
    "atomic-habits":         "assets/covers/atomic_habits.png",
    "seven-habits":          "assets/covers/seven_habits.png",
    "mindset":               "assets/covers/mindset.png",
    "cant-hurt-me":          "assets/covers/cant_hurt_me.png",
    "naval-almanack":        "assets/covers/almanack_of_naval.png",
    "meditations":           "assets/covers/meditations.png",
    "twelve-rules":          "assets/covers/12_rules_for_life.png",
    "mans-search":           "assets/covers/mans_search_for_meaning.png",
    "daily-stoic":           "assets/covers/the_daily_stoic.png",
    "letters-stoic":         "assets/covers/letters_from_stoic.png",
    "deep-work":             "assets/covers/deep_work.png",
    "essentialism":          "assets/covers/essentialism.png",
    "gtd":                   "assets/covers/getting_things_done.png",
    "make-time":             "assets/covers/make_time.png",
    "the-one-thing":         "assets/covers/the_one_thing.png",
    "thinking-fast-slow":    "assets/covers/thinking_fast_and_slow.png",
    "influence":             "assets/covers/influence.png",
    "flow":                  "assets/covers/flow.png",
    "predictably-irrational":"assets/covers/predictably_irrational.png",
    "body-keeps-score":      "assets/covers/body_keeps_the_score.png",
    "power-of-habit":        "assets/covers/the_power_of_habit.png",
    "tiny-habits":           "assets/covers/tiny_habits.png",
    "hooked":                "assets/covers/hooked.png",
    "indistractable":        "assets/covers/indistractable.png",
    "compound-effect":       "assets/covers/the_compound_effect.png",
    "huberman-lab":          "assets/covers/huberman_lab.png",
    "psychology-of-money":   "assets/covers/psychology_of_money.png",
    "zen-koan":              "assets/covers/zen_koan.png",
    "visual-model":          "assets/covers/visual_model.png",
    "micro-sandbox":         "assets/covers/micro_sandbox.png",
}


def main() -> None:
    db = SessionLocal()
    try:
        updated = 0
        skipped = 0
        missing = 0

        for book_id, cover_path in COVER_MAP.items():
            book = db.query(Book).filter(Book.id == book_id).first()
            if book is None:
                print(f"  MISSING  {book_id!r} - not in database, skipping")
                missing += 1
                continue
            if book.cover_image == cover_path:
                skipped += 1
                continue
            book.cover_image = cover_path
            updated += 1
            print(f"  UPDATED  {book_id!r}  →  {cover_path}")

        db.commit()
        print(f"\nDone. {updated} updated, {skipped} already correct, {missing} not in DB.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

