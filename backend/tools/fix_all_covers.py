import sqlite3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "synapse.db"
SEED_PATH = ROOT / "backend" / "seed_data.json"
DATA_JS_PATH = ROOT / "data.js"

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

print("1. Updating live synapse.db...")
if DB_PATH.exists():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    for book_id, path in COVER_MAP.items():
        c.execute("UPDATE books SET cover_image = ? WHERE id = ?", (path, book_id))
    conn.commit()
    conn.close()
    print("   Done.")
else:
    print("   Not found.")

print("2. Updating seed_data.json...")
if SEED_PATH.exists():
    data = json.loads(SEED_PATH.read_text())
    for book in data.get("books", []):
        if book["id"] in COVER_MAP:
            book["cover_image"] = COVER_MAP[book["id"]]
    SEED_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    print("   Done.")

print("3. Updating data.js...")
if DATA_JS_PATH.exists():
    js_content = DATA_JS_PATH.read_text()
    # Replace all coverImage: "assets/covers/..." with the .png extension
    js_content = re.sub(r'coverImage:\s*"assets/covers/([^"]+)\.(jpg|jpeg|webp|png)"', 
                        r'coverImage: "assets/covers/\1.png"', 
                        js_content)
    DATA_JS_PATH.write_text(js_content)
    print("   Done.")

print("\nAll fixed! Everything is now strictly .png")

