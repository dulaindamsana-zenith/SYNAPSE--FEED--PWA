import json
import sqlite3
import re
from pathlib import Path

ROOT = Path('/home/sandaruwan/Videos/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv')
DATA_JS = ROOT / 'data.js'
SEED_JSON = ROOT / 'backend' / 'seed_data.json'
DB_PATH = ROOT / 'synapse.db'

# The 7 new cards
CARDS = [
    {
        "id": "atomic-habits-1",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 1",
        "title": "The Goal Wasn’t the Problem",
        "body": "Maya had written the goal on a sticky note above her desk: “Run a 5K.” She even picked a race six weeks away. Monday morning, she woke early, laced her shoes, and ran until her lungs burned. Tuesday, she skipped because she was tired. By Thursday, work ran late. By the second week, the sticky note had become wallpaper.\n\nShe tried again the following Monday, this time promising herself she would “be more disciplined.” But the same pattern returned. Motivation appeared, disappeared, and left her staring at the same unfinished goal.\n\nThen Maya changed the question. Instead of asking, “How do I run a 5K?” she asked, “What would make running the normal thing I do?” She put her shoes beside the bed. She chose a ten-minute route around her block. Her only rule: never finish the morning without taking the first step.\n\nTen minutes became fifteen. Fifteen became thirty. Weeks later, Maya crossed the 5K finish line—but the surprising part was that the race no longer felt like the achievement.\n\nThe real victory had happened much earlier: she had built a system that made the behavior repeatable.",
        "zeigarnik_cliffhanger": "There's a reason goal-setting fails even for disciplined people. Clear names it in the next section…",
        "insight": "Goals tell you where you want to go; systems determine whether you actually get there.",
        "image_url": "assets/flash_covers/atomic_habits_1.jpeg"
    },
    {
        "id": "atomic-habits-2",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 2",
        "title": "Every Action Casts a Vote",
        "body": "The meeting room went quiet when Arjun’s manager asked, “Who do you think should lead this project?” Arjun wanted the role badly. He had spent weeks imagining himself as a confident, reliable leader—but yesterday, he had ignored a teammate’s message because he was too busy.\n\nThat evening, he opened his laptop and stared at his to-do list. His old approach was simple: *When I become a better leader, I’ll start acting like one.* But something about that logic suddenly felt backwards.\n\nThe next morning, Arjun arrived ten minutes early. He answered the message he had ignored. In the meeting, instead of waiting for someone else to solve a problem, he volunteered to handle it. None of these actions felt important. They were tiny, almost forgettable.\n\nBut each one carried a quiet message: *this is the kind of person I am.*\n\nWeeks passed. Arjun stopped trying to prove he was a leader. He simply kept casting votes for that identity—one decision at a time.\n\nWhen his manager finally gave him the project, Arjun smiled. The promotion felt new.\n\nThe identity behind it didn't.",
        "zeigarnik_cliffhanger": "Most people run this loop backwards their whole lives. The correct order is on the next page…",
        "insight": "Every action is a vote for the person you’re becoming; repeated votes shape your identity.",
        "image_url": "assets/flash_covers/atomic_habits_2.jpeg"
    },
    {
        "id": "atomic-habits-3",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 3",
        "title": "Make Good Habits Inevitable",
        "body": "At 10:47 p.m., Daniel opened his laptop to work on an important presentation. Five minutes later, he was watching short videos. He closed the app, opened his laptop again, and somehow ended up scrolling for another twenty minutes.\n\nDaniel blamed himself: *I need more discipline.*\n\nThe next night, he tried harder. But his phone was still beside his laptop, notifications flashing every few minutes. His favorite apps were one tap away. Meanwhile, the presentation sat untouched.\n\nThen Daniel changed the setup instead of fighting himself. He turned off notifications, moved distracting apps off his home screen, and left his phone charging across the room. Before starting work, he opened the presentation and placed the first slide on the screen.\n\nNothing about Daniel had magically become more disciplined.\n\nBut the environment had changed.\n\nThe next evening, he sat down and began working almost automatically. There was no battle with temptation because temptation had been moved out of reach.\n\nDaniel finally understood: sometimes the strongest willpower move is designing a world that requires less of it.",
        "zeigarnik_cliffhanger": "One of these four laws does most of the work. Clear reveals which one in Chapter 4…",
        "insight": "Make good habits obvious and easy, while making bad habits invisible and difficult.",
        "image_url": "assets/flash_covers/atomic_habits_3.jpeg"
    },
    {
        "id": "atomic-habits-4",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 6",
        "title": "The Habit Begins Before You Act",
        "body": "Nina walked into the kitchen to make coffee and saw the cookie jar sitting beside the machine. She hadn’t planned to eat anything. But before the coffee finished dripping, her hand was already inside the jar.\n\nShe frowned at herself: *Why do I keep doing this?* She had promised to cut back on sweets, yet every afternoon the same thing happened. She blamed her lack of self-control and decided she simply needed to try harder.\n\nThe next day, Nina noticed something different. The craving didn't begin when she tasted the cookie. It began when she saw the jar.\n\nSo she changed the cue. She moved the cookies into an opaque container in a high cupboard and placed a bowl of fruit beside the coffee machine. The following afternoon, Nina walked into the kitchen and reached automatically—only this time, her eyes landed on the fruit.\n\nThe urge for a cookie hadn't vanished because Nina had become stronger.\n\nShe had simply stopped giving the habit its starting signal.",
        "zeigarnik_cliffhanger": "There's a one-sentence test for whether your environment is working against you…",
        "insight": "Habits often begin with a cue, so changing what you see can change what you do.",
        "image_url": "assets/flash_covers/atomic_habits_4.jpeg"
    },
    {
        "id": "atomic-habits-5",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 13",
        "title": "Stack the Habit",
        "body": "At 7:15 every morning, Leo made the same promise: *Tonight, I’ll finally read.*\n\nThen dinner happened. Messages arrived. One video became five. By bedtime, the book was still sitting untouched on his desk.\n\nLeo didn't need another motivational speech. He needed a trigger he couldn't ignore.\n\nThe next morning, he changed the plan. He already had one habit he never missed: making coffee. So he attached the new habit to it.\n\n*“After I make my coffee, I’ll read one page.”*\n\nThe first morning, he read one page and stopped. The second morning, he read three. A week later, the coffee machine had become a quiet signal: *Time to read.*\n\nSome mornings he read for twenty minutes. Other mornings, just one page. But the habit no longer depended on remembering or feeling motivated. It had a place in a routine that already existed.\n\nMonths later, Leo realized something strange.\n\nHe hadn't successfully started reading every day.\n\nHe had made forgetting to read surprisingly difficult.",
        "zeigarnik_cliffhanger": "Why two minutes and not five? The threshold isn't arbitrary — the reasoning follows…",
        "insight": "Attach a new habit to an existing habit: “After I do X, I will do Y.”",
        "image_url": "assets/flash_covers/atomic_habits_5.jpeg"
    },
    {
        "id": "atomic-habits-6",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Chapter 16",
        "title": "The Room Decided First",
        "body": "Riya bought an expensive guitar and leaned it against the wall in her bedroom. She told everyone she was going to learn. Two weeks later, the guitar had become part of the furniture.\n\nEvery evening, she came home exhausted, dropped onto the couch, and opened the TV remote that sat waiting on the coffee table. Hours disappeared without a thought. She blamed her “low motivation” for never practicing.\n\nOne Saturday, Riya made a strange change. She moved the guitar to the living room—right beside the couch. The TV remote went into a drawer across the room. That evening, she reached for the remote out of habit... and her hand landed on the guitar instead.\n\nShe played for five minutes.\n\nThe next day, she played again. Not because she suddenly became more motivated, but because the easiest thing in the room had changed.\n\nMonths later, Riya could play songs she once thought were impossible. She laughed at the idea that motivation had finally arrived.\n\nIt hadn’t.\n\nHer environment had quietly been making the decision before she ever did.",
        "zeigarnik_cliffhanger": "Clear's own tracking method takes 10 seconds a day. It's described just ahead…",
        "insight": "Design your environment so the good habit is the easiest option and the bad habit requires extra effort.",
        "image_url": "assets/flash_covers/atomic_habits_6.jpeg"
    },
    {
        "id": "atomic-habits-7",
        "book_id": "atomic-habits",
        "rule_or_chapter": "Bonus Chapter",
        "title": "Two Minutes Is Enough",
        "body": "At 6:30 a.m., Sam stood beside his yoga mat, staring at it like it had personally offended him.\n\nHe had decided to exercise every morning. But the thought of a full workout felt exhausting before he had even started. So he skipped Monday. Then Tuesday. By Wednesday, the mat was back in the closet.\n\nOn Thursday, Sam changed the rule.\n\nHe didn’t have to work out.\n\nHe only had to do two minutes.\n\nSo he stepped onto the mat and stretched. Two minutes later, he could stop.\n\nThe next morning, he did two push-ups. Then three. A few days later, two minutes naturally became ten. Eventually, the hardest part of exercising—the decision to begin—barely existed anymore.\n\nSam discovered that the goal wasn't to squeeze a complete workout into every morning.\n\nIt was to make showing up so easy that skipping felt stranger than starting.\n\nThe tiny action looked almost laughable at first.\n\nBut that was the point.",
        "zeigarnik_cliffhanger": "Master showing up before trying to master the entire routine…",
        "insight": "When starting feels difficult, shrink the habit until it takes less than two minutes.",
        "image_url": "assets/flash_covers/atomic_habits_7.jpeg"
    }
]

def update_seed_data():
    with open(SEED_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Remove existing atomic-habits cards
    data["cards"] = [c for c in data["cards"] if c.get("book_id") != "atomic-habits"]
    
    # Add new cards
    for idx, c in enumerate(CARDS):
        new_card = {
            "id": c["id"],
            "book_id": c["book_id"],
            "kind": "core",
            "position": idx + 1,
            "rule_or_chapter": c["rule_or_chapter"],
            "title": c["title"],
            "body": c["body"],
            "topic": "Personal Development",
            "zeigarnik_cliffhanger": c["zeigarnik_cliffhanger"],
            "unlock_text": "",
            "interactive_type": None,
            "interactive_data": None,
            "diagram_svg": None,
            "caption": "",
            "insight": c["insight"],
            "image_url": c["image_url"],
            "likes": 0,
            "saves": 0
        }
        data["cards"].append(new_card)
        
    with open(SEED_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print("seed_data.json updated.")

def update_database():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Delete existing
    c.execute("DELETE FROM flashcards WHERE book_id = 'atomic-habits'")
    
    import time
    now_ms = int(time.time() * 1000)
    for idx, card in enumerate(CARDS):
        c.execute('''
            INSERT INTO flashcards (
                id, book_id, kind, position, rule_or_chapter, title, body, topic,
                zeigarnik_cliffhanger, unlock_text, interactive_type, interactive_data,
                diagram_svg, caption, insight, image_url, likes, saves, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            card["id"], card["book_id"], "core", idx + 1, card["rule_or_chapter"],
            card["title"], card["body"], "Personal Development", card["zeigarnik_cliffhanger"],
            "", None, None, None, "", card["insight"], card["image_url"], 0, 0, now_ms
        ))
    conn.commit()
    conn.close()
    print("synapse.db updated.")

def update_data_js():
    with open(DATA_JS, 'r', encoding='utf-8') as f:
        content = f.read()

    # The regex to match the old buildCards("atomic-habits", [...]) block
    # We will replace it with a literal array of objects
    js_objects = "[\n"
    for c in CARDS:
        escaped_body = c["body"].replace('\\', '\\\\').replace('\"', '\\\"').replace('\n', '\\n')
        js_objects += f'''    {{
      id: "{c["id"]}", bookId: "{c["book_id"]}",
      ruleNumberOrChapter: "{c["rule_or_chapter"]}", title: "{c["title"]}",
      body: "{escaped_body}",
      zeigarnikCliffhanger: "{c["zeigarnik_cliffhanger"]}",
      insight: "{c["insight"]}",
      imageUrl: "{c["image_url"]}",
      interactiveType: null
    }},\n'''
    js_objects += "  ]"

    pattern = r'buildCards\("atomic-habits",\s*\[.*?\]\),'
    # re.DOTALL to match across lines
    new_content = re.sub(pattern, js_objects + ',', content, flags=re.DOTALL)
    
    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("data.js updated.")

if __name__ == "__main__":
    update_seed_data()
    update_database()
    update_data_js()
