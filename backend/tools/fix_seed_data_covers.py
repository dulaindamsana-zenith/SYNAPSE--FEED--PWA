"""
fix_seed_data_covers.py - run once to patch seed_data.json cover_image fields.
Usage:  python backend/tools/fix_seed_data_covers.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "backend" / "seed_data.json"

COVER_MAP = {
    "atomic-habits":          "assets/covers/atomic_habits.png",
    "seven-habits":           "assets/covers/seven_habits.png",
    "mindset":                "assets/covers/mindset.png",
    "cant-hurt-me":           "assets/covers/cant_hurt_me.png",
    "naval-almanack":         "assets/covers/almanack_of_naval.png",
    "meditations":            "assets/covers/meditations.png",
    "twelve-rules":           "assets/covers/12_rules_for_life.png",
    "mans-search":            "assets/covers/mans_search_for_meaning.png",
    "daily-stoic":            "assets/covers/the_daily_stoic.png",
    "letters-stoic":          "assets/covers/letters_from_stoic.png",
    "deep-work":              "assets/covers/deep_work.png",
    "essentialism":           "assets/covers/essentialism.png",
    "gtd":                    "assets/covers/getting_things_done.png",
    "make-time":              "assets/covers/make_time.png",
    "the-one-thing":          "assets/covers/the_one_thing.png",
    "thinking-fast-slow":     "assets/covers/thinking_fast_and_slow.png",
    "influence":              "assets/covers/influence.png",
    "flow":                   "assets/covers/flow.png",
    "predictably-irrational": "assets/covers/predictably_irrational.png",
    "body-keeps-score":       "assets/covers/body_keeps_the_score.png",
    "power-of-habit":         "assets/covers/the_power_of_habit.png",
    "tiny-habits":            "assets/covers/tiny_habits.png",
    "hooked":                 "assets/covers/hooked.png",
    "indistractable":         "assets/covers/indistractable.png",
    "compound-effect":        "assets/covers/the_compound_effect.png",
    "huberman-lab":           "assets/covers/huberman_lab.png",
    "psychology-of-money":    "assets/covers/psychology_of_money.png",
    "zen-koan":               "assets/covers/zen_koan.png",
    "visual-model":           "assets/covers/visual_model.png",
    "micro-sandbox":          "assets/covers/micro_sandbox.png",
}

data = json.loads(SEED.read_text())
updated = 0
for book in data["books"]:
    path = COVER_MAP.get(book["id"])
    if path and book.get("cover_image") != path:
        book["cover_image"] = path
        updated += 1
        print(f"  SET  {book['id']}  →  {path}")

SEED.write_text(json.dumps(data, indent=1, ensure_ascii=False))
print(f"\nWrote {SEED}  ({updated} books updated)")

