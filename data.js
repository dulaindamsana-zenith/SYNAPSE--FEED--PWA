/* ============================================================
   Synapse - data.js
   ------------------------------------------------------------
   CONTENTS
     1. TOPICS          - 10 topics, each with a slug + gradient
     2. BOOKS           - 25 curated books (5 per core topic)
     3. FLASHCARDS      - key ideas / rules per book
     4. TESTIMONIALS    - social proof for the landing page
     5. FAQS            - "What. The. FAQ?" accordion
     6. PRICING         - Free vs Pro comparison
     7. FEED CARDS      - the Variable Reward Engine pools
   ============================================================ */

/* ============================================================
   1) TOPICS
   schema: { slug, name, ico, grad, blurb }
   The first five are the "curated" topics with 5 primary books
   each; the rest are populated through book.relatedTopics.
   ============================================================ */
const TOPICS = [
  { slug: "personal-development", name: "Personal Development", ico: "🌱", grad: "linear-gradient(135deg,#ff6a3d,#ff3d7f)", ideas: "12.4k ideas", blurb: "Become the person the goal requires." },
  { slug: "philosophy",           name: "Philosophy",           ico: "🏛", grad: "linear-gradient(135deg,#7b2ff7,#3d7bff)", ideas: "9.8k ideas",  blurb: "Old answers to the questions you're still asking." },
  { slug: "productivity",         name: "Productivity",         ico: "⚡", grad: "linear-gradient(135deg,#fd9644,#f7b731)", ideas: "11.2k ideas", blurb: "Do less, but land it." },
  { slug: "psychology",           name: "Psychology",           ico: "🧠", grad: "linear-gradient(135deg,#e84393,#6c5ce7)", ideas: "10.1k ideas", blurb: "Why you do the things you swore you wouldn't." },
  { slug: "habits",               name: "Habits",               ico: "🔁", grad: "linear-gradient(135deg,#12c48b,#3dd6b0)", ideas: "7.7k ideas",  blurb: "The compounding machine you already own." },
  { slug: "money",                name: "Money",                ico: "💸", grad: "linear-gradient(135deg,#00b894,#0984e3)", ideas: "7.3k ideas",  blurb: "Behaviour beats spreadsheets." },
  { slug: "focus",                name: "Focus",                ico: "🎯", grad: "linear-gradient(135deg,#0984e3,#00cec9)", ideas: "6.4k ideas",  blurb: "The last rare skill." },
  { slug: "health",               name: "Health",               ico: "🫀", grad: "linear-gradient(135deg,#ff5e62,#ff9966)", ideas: "5.9k ideas",  blurb: "The body keeps the receipts." },
  { slug: "leadership",           name: "Leadership",           ico: "🚀", grad: "linear-gradient(135deg,#a55eea,#fd79a8)", ideas: "6.0k ideas",  blurb: "Clear is kind." },
  { slug: "creativity",           name: "Creativity",           ico: "🎨", grad: "linear-gradient(135deg,#6c5ce7,#00cec9)", ideas: "4.9k ideas",  blurb: "Steal, remix, ship." },
];

const COVERS = ["#ff3d7f", "#7b2ff7", "#0984e3", "#00b894", "#fd9644", "#e84393", "#6c5ce7", "#00cec9"];

/* ============================================================
   2) BOOKS
   schema: {
     id, title, author, coverColor, coverImage, glyph,
     description, topic, relatedTopics: [], similarBookIds: [],
     year, minutes
   }
   `coverImage: null` → app.js generates a deterministic SVG
   cover procedurally (offline-safe, no network requests).
   ============================================================ */
const BOOKS = [
  /* ---------- Personal Development ---------- */
  {
    id: "atomic-habits", title: "Atomic Habits", author: "James Clear",
    coverColor: "#ff6a3d", coverImage: "assets/covers/atomic_habits.png", year: 2018, minutes: 9,
    topic: "Personal Development", relatedTopics: ["Habits", "Productivity", "Focus"],
    similarBookIds: ["tiny-habits", "power-of-habit", "compound-effect"],
    description: "The definitive playbook on why tiny changes beat dramatic overhauls. Clear breaks behaviour into a four-step loop and shows how to redesign your environment so the right action becomes the path of least resistance.",
  },
  {
    id: "seven-habits", title: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey",
    coverColor: "#0984e3", coverImage: "assets/covers/seven_habits.png", glyph: "7", year: 1989, minutes: 11,
    topic: "Personal Development", relatedTopics: ["Leadership", "Productivity"],
    similarBookIds: ["essentialism", "daily-stoic", "the-one-thing"],
    description: "A character-first approach to effectiveness. Covey argues that lasting success comes from principles, not personality tricks - moving from dependence to independence, and finally to interdependence.",
  },
  {
    id: "mindset", title: "Mindset", author: "Carol S. Dweck",
    coverColor: "#e84393", coverImage: "assets/covers/mindset.png", glyph: "🌟", year: 2006, minutes: 8,
    topic: "Personal Development", relatedTopics: ["Psychology", "Leadership"],
    similarBookIds: ["cant-hurt-me", "flow", "atomic-habits"],
    description: "Decades of research distilled into one distinction: do you believe ability is fixed, or grown? Dweck shows how that single belief quietly decides which challenges you take and which you avoid.",
  },
  {
    id: "cant-hurt-me", title: "Can't Hurt Me", author: "David Goggins",
    coverColor: "#2d3436", coverImage: "assets/covers/cant_hurt_me.png", glyph: "🔥", year: 2018, minutes: 10,
    topic: "Personal Development", relatedTopics: ["Health", "Psychology"],
    similarBookIds: ["mindset", "meditations", "twelve-rules"],
    description: "A brutal memoir turned mental-toughness manual. Goggins argues most of us stop at 40% of our capacity and offers callousing rituals for the mind that make discomfort a tool rather than a wall.",
  },
  {
    id: "naval-almanack", title: "The Almanack of Naval Ravikant", author: "Eric Jorgenson",
    coverColor: "#0652DD", coverImage: "assets/covers/almanack_of_naval.png", glyph: "⛵", year: 2020, minutes: 9,
    topic: "Personal Development", relatedTopics: ["Money", "Philosophy", "Leadership"],
    similarBookIds: ["compound-effect", "daily-stoic", "essentialism"],
    description: "A curated collection of Naval's thinking on wealth and happiness. Its core claim: seek specific knowledge, take equity, play long-term games - and treat happiness as a skill rather than a destination.",
  },

  /* ---------- Philosophy ---------- */
  {
    id: "meditations", title: "Meditations", author: "Marcus Aurelius",
    coverColor: "#8e6e53", coverImage: "assets/covers/meditations.png", glyph: "🏛", year: 180, minutes: 10,
    topic: "Philosophy", relatedTopics: ["Personal Development", "Psychology"],
    similarBookIds: ["letters-stoic", "daily-stoic", "mans-search"],
    description: "The private notebook of a Roman emperor, never written for publication. Aurelius reminds himself - again and again - that opinion, not event, is the source of suffering.",
  },
  {
    id: "twelve-rules", title: "12 Rules for Life", author: "Jordan B. Peterson",
    coverColor: "#c0392b", coverImage: "assets/covers/12_rules_for_life.png", glyph: "🦞", year: 2018, minutes: 12,
    topic: "Philosophy", relatedTopics: ["Psychology", "Personal Development"],
    similarBookIds: ["meditations", "mans-search", "cant-hurt-me"],
    description: "Twelve blunt rules for keeping chaos at bay, drawn from mythology, clinical practice and evolutionary biology. Peterson's throughline: voluntarily accept responsibility, and meaning follows.",
  },
  {
    id: "mans-search", title: "Man's Search for Meaning", author: "Viktor E. Frankl",
    coverColor: "#636e72", coverImage: "assets/covers/mans_search_for_meaning.png", glyph: "🕯", year: 1946, minutes: 7,
    topic: "Philosophy", relatedTopics: ["Psychology", "Health"],
    similarBookIds: ["meditations", "twelve-rules", "letters-stoic"],
    description: "A psychiatrist's account of the camps, and the logotherapy it produced. Frankl's conclusion is stubbornly hopeful: when everything is stripped away, the freedom to choose your response remains.",
  },
  {
    id: "daily-stoic", title: "The Daily Stoic", author: "Ryan Holiday",
    coverColor: "#2f3640", coverImage: "assets/covers/the_daily_stoic.png", glyph: "🗿", year: 2016, minutes: 8,
    topic: "Philosophy", relatedTopics: ["Personal Development", "Focus", "Leadership"],
    similarBookIds: ["meditations", "letters-stoic", "seven-habits"],
    description: "366 short meditations translating Stoicism into daily practice, organised around perception, action and will - the three disciplines that turn ancient theory into a usable operating system.",
  },
  {
    id: "letters-stoic", title: "Letters from a Stoic", author: "Seneca",
    coverColor: "#786fa6", coverImage: "assets/covers/letters_from_stoic.png", glyph: "✒", year: 65, minutes: 9,
    topic: "Philosophy", relatedTopics: ["Personal Development", "Money"],
    similarBookIds: ["meditations", "daily-stoic", "mans-search"],
    description: "Letters to a friend on time, wealth, friendship and death. Seneca's most modern warning: we are not given a short life, we make it short by spending attention carelessly.",
  },

  /* ---------- Productivity ---------- */
  {
    id: "deep-work", title: "Deep Work", author: "Cal Newport",
    coverColor: "#7b2ff7", coverImage: "assets/covers/deep_work.png", glyph: "🧩", year: 2016, minutes: 10,
    topic: "Productivity", relatedTopics: ["Focus", "Creativity"],
    similarBookIds: ["indistractable", "essentialism", "the-one-thing"],
    description: "A case that undistracted concentration is both increasingly rare and increasingly valuable - plus four philosophies for scheduling it into a life full of shallow obligations.",
  },
  {
    id: "essentialism", title: "Essentialism", author: "Greg McKeown",
    coverColor: "#6c5ce7", coverImage: "assets/covers/essentialism.png", glyph: "◽", year: 2014, minutes: 8,
    topic: "Productivity", relatedTopics: ["Focus", "Leadership", "Creativity"],
    similarBookIds: ["the-one-thing", "deep-work", "seven-habits"],
    description: "The disciplined pursuit of less. McKeown reframes saying no as the core executive skill, and shows how trade-offs made deliberately beat trade-offs made by default.",
  },
  {
    id: "gtd", title: "Getting Things Done", author: "David Allen",
    coverColor: "#00b894", coverImage: "assets/covers/getting_things_done.png", glyph: "✅", year: 2001, minutes: 11,
    topic: "Productivity", relatedTopics: ["Focus", "Habits"],
    similarBookIds: ["make-time", "essentialism", "deep-work"],
    description: "A complete capture-and-review system built on one insight: your mind is for having ideas, not holding them. Externalise every commitment and the anxiety of forgetting dissolves.",
  },
  {
    id: "make-time", title: "Make Time", author: "Jake Knapp & John Zeratsky",
    coverColor: "#12c48b", coverImage: "assets/covers/make_time.png", glyph: "⏳", year: 2018, minutes: 7,
    topic: "Productivity", relatedTopics: ["Focus", "Habits", "Health", "Creativity"],
    similarBookIds: ["indistractable", "the-one-thing", "gtd"],
    description: "A four-step daily loop - Highlight, Laser, Energise, Reflect - designed by two ex-Google designers who built the very apps they now teach you to defend yourself against.",
  },
  {
    id: "the-one-thing", title: "The ONE Thing", author: "Gary Keller",
    coverColor: "#f7b731", coverImage: "assets/covers/the_one_thing.png", glyph: "1️⃣", year: 2013, minutes: 8,
    topic: "Productivity", relatedTopics: ["Focus", "Money"],
    similarBookIds: ["essentialism", "deep-work", "make-time"],
    description: "One focusing question - what's the one thing I can do such that everything else becomes easier or unnecessary? - applied ruthlessly to work, health and relationships.",
  },

  /* ---------- Psychology ---------- */
  {
    id: "thinking-fast-slow", title: "Thinking, Fast and Slow", author: "Daniel Kahneman",
    coverColor: "#0984e3", coverImage: "assets/covers/thinking_fast_and_slow.png", glyph: "🐢", year: 2011, minutes: 13,
    topic: "Psychology", relatedTopics: ["Money", "Philosophy"],
    similarBookIds: ["predictably-irrational", "influence", "flow"],
    description: "The Nobel-winning tour of System 1 and System 2 - the fast, intuitive mind and the slow, effortful one - and the dozens of predictable ways the fast one quietly misleads you.",
  },
  {
    id: "influence", title: "Influence", author: "Robert B. Cialdini",
    coverColor: "#e17055", coverImage: "assets/covers/influence.png", glyph: "🎯", year: 1984, minutes: 10,
    topic: "Psychology", relatedTopics: ["Leadership", "Money"],
    similarBookIds: ["thinking-fast-slow", "hooked", "predictably-irrational"],
    description: "Six weapons of persuasion - reciprocity, commitment, social proof, authority, liking, scarcity - documented from the inside of sales training rooms and used on you daily.",
  },
  {
    id: "flow", title: "Flow", author: "Mihaly Csikszentmihalyi",
    coverColor: "#00cec9", coverImage: "assets/covers/flow.png", glyph: "🌊", year: 1990, minutes: 9,
    topic: "Psychology", relatedTopics: ["Focus", "Creativity"],
    similarBookIds: ["deep-work", "mindset", "thinking-fast-slow"],
    description: "Thirty years of research into optimal experience: the state where challenge meets skill, self-consciousness disappears, and time distorts. Happiness, it turns out, is a by-product of absorption.",
  },
  {
    id: "predictably-irrational", title: "Predictably Irrational", author: "Dan Ariely",
    coverColor: "#fd79a8", coverImage: "assets/covers/predictably_irrational.png", glyph: "🎲", year: 2008, minutes: 9,
    topic: "Psychology", relatedTopics: ["Money", "Habits"],
    similarBookIds: ["thinking-fast-slow", "influence", "hooked"],
    description: "Field experiments showing our irrationality isn't random - it's systematic and repeatable. Which means it can be predicted, exploited by others, and occasionally designed around by you.",
  },
  {
    id: "body-keeps-score", title: "The Body Keeps the Score", author: "Bessel van der Kolk",
    coverColor: "#d63031", coverImage: "assets/covers/body_keeps_the_score.png", glyph: "🫀", year: 2014, minutes: 12,
    topic: "Psychology", relatedTopics: ["Health", "Philosophy"],
    similarBookIds: ["mans-search", "cant-hurt-me", "flow"],
    description: "How trauma reshapes body and brain, and why talking alone often fails. Van der Kolk makes the case for approaches that reach the parts of the nervous system language cannot.",
  },

  /* ---------- Habits ---------- */
  {
    id: "power-of-habit", title: "The Power of Habit", author: "Charles Duhigg",
    coverColor: "#fdcb6e", coverImage: "assets/covers/the_power_of_habit.png", glyph: "🔁", year: 2012, minutes: 10,
    topic: "Habits", relatedTopics: ["Psychology", "Personal Development"],
    similarBookIds: ["atomic-habits", "tiny-habits", "hooked"],
    description: "The cue–routine–reward loop, traced from toothpaste marketing to Olympic swimming to civil rights movements. Duhigg's key move: you don't extinguish a habit, you replace its routine.",
  },
  {
    id: "tiny-habits", title: "Tiny Habits", author: "BJ Fogg",
    coverColor: "#55efc4", coverImage: "assets/covers/tiny_habits.png", glyph: "🌱", year: 2019, minutes: 8,
    topic: "Habits", relatedTopics: ["Personal Development", "Health"],
    similarBookIds: ["atomic-habits", "power-of-habit", "compound-effect"],
    description: "A Stanford behaviour scientist's argument that motivation is unreliable and ability is the real lever. Shrink the behaviour until it's laughably small, anchor it to something you already do, celebrate immediately.",
  },
  {
    id: "hooked", title: "Hooked", author: "Nir Eyal",
    coverColor: "#a29bfe", coverImage: "assets/covers/hooked.png", glyph: "🪝", year: 2014, minutes: 8,
    topic: "Habits", relatedTopics: ["Psychology", "Creativity"],
    similarBookIds: ["indistractable", "influence", "predictably-irrational"],
    description: "The Hook Model - trigger, action, variable reward, investment - written for product builders. Read defensively, it's also the clearest map of exactly how your favourite apps hold you.",
  },
  {
    id: "indistractable", title: "Indistractable", author: "Nir Eyal",
    coverColor: "#74b9ff", coverImage: "assets/covers/indistractable.png", glyph: "🛡", year: 2019, minutes: 9,
    topic: "Habits", relatedTopics: ["Focus", "Productivity"],
    similarBookIds: ["deep-work", "make-time", "hooked"],
    description: "The sequel that undoes the first book. Eyal argues distraction starts as internal discomfort, not external pings - so the fix begins with the feeling you're trying to escape.",
  },
  { id: "compound-effect", title: "The Compound Effect", author: "Darren Hardy",
    coverColor: "#00b894", coverImage: "assets/covers/the_compound_effect.png", glyph: "📈", year: 2010, minutes: 7,
    topic: "Habits", relatedTopics: ["Money", "Personal Development"],
    similarBookIds: ["atomic-habits", "tiny-habits", "naval-almanack"],
    description: "Small, unsexy choices repeated over time beat dramatic bursts of effort. Hardy's contribution is the arithmetic: he makes the invisible middle of the curve concrete enough to stick with.",
  },

  /* ---------- Money & Investing ---------- */
  {
    id: "psychology-of-money", title: "The Psychology of Money", author: "Morgan Housel",
    coverColor: "#1e3a5f", coverImage: "assets/covers/psychology_of_money.png", glyph: "💰", year: 2020, minutes: 9,
    topic: "Money", relatedTopics: ["Psychology", "Personal Development"],
    similarBookIds: ["naval-almanack", "thinking-fast-slow", "compound-effect"],
    description: "Nineteen short stories about the ways people think about money - and how behaviour, not intelligence, is the biggest driver of financial outcomes. Housel's central lesson: being reasonable beats being rational.",
  },

  /* ---------- Health & Science ---------- */
  {
    id: "huberman-lab", title: "Huberman Lab Protocols", author: "Andrew Huberman",
    coverColor: "#1a1a2e", coverImage: "assets/covers/huberman_lab.png", glyph: "🧠", year: 2023, minutes: 10,
    topic: "Health", relatedTopics: ["Personal Development", "Focus", "Psychology"],
    similarBookIds: ["cant-hurt-me", "tiny-habits", "flow"],
    description: "Neuroscience-backed protocols for optimising sleep, focus, exercise and stress. Huberman distils peer-reviewed research into actionable daily routines anyone can implement without a lab coat.",
  },

  /* ---------- Creativity ---------- */
  {
    id: "zen-koan", title: "The Zen of Creativity", author: "John Daido Loori",
    coverColor: "#2c2c54", coverImage: "assets/covers/zen_koan.png", glyph: "☯", year: 2004, minutes: 8,
    topic: "Creativity", relatedTopics: ["Philosophy", "Focus", "Psychology"],
    similarBookIds: ["flow", "deep-work", "meditations"],
    description: "A Zen master and artist explores how the practices of zazen and mindfulness dissolve the inner critic and open a direct channel to authentic creative expression.",
  },
  {
    id: "visual-model", title: "The Back of the Napkin", author: "Dan Roam",
    coverColor: "#f39c12", coverImage: "assets/covers/visual_model.png", glyph: "✏️", year: 2008, minutes: 8,
    topic: "Creativity", relatedTopics: ["Leadership", "Productivity"],
    similarBookIds: ["essentialism", "deep-work", "thinking-fast-slow"],
    description: "A framework for solving any problem and selling any idea using a picture. Roam argues that if you can hold a marker, you can out-think and out-communicate anyone in the room.",
  },
  {
    id: "micro-sandbox", title: "Sprint", author: "Jake Knapp",
    coverColor: "#e74c3c", coverImage: "assets/covers/micro_sandbox.png", glyph: "⚡", year: 2016, minutes: 7,
    topic: "Creativity", relatedTopics: ["Productivity", "Leadership"],
    similarBookIds: ["make-time", "essentialism", "the-one-thing"],
    description: "A five-day process for answering critical business questions through prototyping and testing. Developed at Google Ventures, Sprint compresses months of work into a single focused week.",
  },
];

/* ============================================================
   3) FLASHCARDS  (key ideas / rules per book)
   schema: {
     id, bookId, ruleNumberOrChapter, title, body,
     imageUrl,               // null → procedural SVG visual
     zeigarnikCliffhanger,
     interactiveType         // null | "reflection" | "choice"
   }
   Built from terse tuples for readability:
     [ ruleLabel, title, body, cliffhanger, interactiveType? ]
   ============================================================ */
function buildCards(bookId, rows) {
  return rows.map((r, i) => ({
    id: bookId + "-" + (i + 1),
    bookId,
    kind: "core",
    ruleNumberOrChapter: r[0],
    title: r[1],
    body: r[2],
    zeigarnikCliffhanger: r[3],
    interactiveType: r[4] || null,
    imageUrl: r[5] || null,
  }));
}

const FLASHCARDS = [].concat(
  [
    {
      id: "atomic-habits-1", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 1", title: "The Goal Wasn’t the Problem",
      body: "Maya had written the goal on a sticky note above her desk: “Run a 5K.” She even picked a race six weeks away. Monday morning, she woke early, laced her shoes, and ran until her lungs burned. Tuesday, she skipped because she was tired. By Thursday, work ran late. By the second week, the sticky note had become wallpaper. She tried again the following Monday, this time promising herself she would “be more disciplined.” But the same pattern returned. Motivation appeared, disappeared, and left her staring at the same unfinished goal. Then Maya changed the question. Instead of asking, “How do I run a 5K?” she asked, “What would make running the normal thing I do?” She put her shoes beside the bed. She chose a ten-minute route around her block. Her only rule: never finish the morning without taking the first step. Ten minutes became fifteen. Fifteen became thirty. Weeks later, Maya crossed the 5K finish line—but the surprising part was that the race no longer felt like the achievement. The real victory had happened much earlier: she had built a system that made the behavior repeatable.",
      zeigarnikCliffhanger: "There's a reason goal-setting fails even for disciplined people. Clear names it in the next section…",
      insight: "Goals tell you where you want to go; systems determine whether you actually get there.",
      imageUrl: "assets/flash_covers/atomic_habits_1.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-2", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 2", title: "Every Action Casts a Vote",
      body: "The meeting room went quiet when Arjun’s manager asked, “Who do you think should lead this project?” Arjun wanted the role badly. He had spent weeks imagining himself as a confident, reliable leader—but yesterday, he had ignored a teammate’s message because he was too busy. That evening, he opened his laptop and stared at his to-do list. His old approach was simple: *When I become a better leader, I’ll start acting like one.* But something about that logic suddenly felt backwards. The next morning, Arjun arrived ten minutes early. He answered the message he had ignored. In the meeting, instead of waiting for someone else to solve a problem, he volunteered to handle it. None of these actions felt important. They were tiny, almost forgettable. But each one carried a quiet message: *this is the kind of person I am.* Weeks passed. Arjun stopped trying to prove he was a leader. He simply kept casting votes for that identity—one decision at a time. When his manager finally gave him the project, Arjun smiled. The promotion felt new. The identity behind it didn't.",
      zeigarnikCliffhanger: "Most people run this loop backwards their whole lives. The correct order is on the next page…",
      insight: "Every action is a vote for the person you’re becoming; repeated votes shape your identity.",
      imageUrl: "assets/flash_covers/atomic_habits_2.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-3", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 3", title: "Make Good Habits Inevitable",
      body: "At 10:47 p.m., Daniel opened his laptop to work on an important presentation. Five minutes later, he was watching short videos. He closed the app, opened his laptop again, and somehow ended up scrolling for another twenty minutes. Daniel blamed himself: *I need more discipline.* The next night, he tried harder. But his phone was still beside his laptop, notifications flashing every few minutes. His favorite apps were one tap away. Meanwhile, the presentation sat untouched. Then Daniel changed the setup instead of fighting himself. He turned off notifications, moved distracting apps off his home screen, and left his phone charging across the room. Before starting work, he opened the presentation and placed the first slide on the screen. Nothing about Daniel had magically become more disciplined. But the environment had changed. The next evening, he sat down and began working almost automatically. There was no battle with temptation because temptation had been moved out of reach. Daniel finally understood: sometimes the strongest willpower move is designing a world that requires less of it.",
      zeigarnikCliffhanger: "One of these four laws does most of the work. Clear reveals which one in Chapter 4…",
      insight: "Make good habits obvious and easy, while making bad habits invisible and difficult.",
      imageUrl: "assets/flash_covers/atomic_habits_3.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-4", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 6", title: "The Habit Begins Before You Act",
      body: "Nina walked into the kitchen to make coffee and saw the cookie jar sitting beside the machine. She hadn’t planned to eat anything. But before the coffee finished dripping, her hand was already inside the jar. She frowned at herself: *Why do I keep doing this?* She had promised to cut back on sweets, yet every afternoon the same thing happened. She blamed her lack of self-control and decided she simply needed to try harder. The next day, Nina noticed something different. The craving didn't begin when she tasted the cookie. It began when she saw the jar. So she changed the cue. She moved the cookies into an opaque container in a high cupboard and placed a bowl of fruit beside the coffee machine. The following afternoon, Nina walked into the kitchen and reached automatically—only this time, her eyes landed on the fruit. The urge for a cookie hadn't vanished because Nina had become stronger. She had simply stopped giving the habit its starting signal.",
      zeigarnikCliffhanger: "There's a one-sentence test for whether your environment is working against you…",
      insight: "Habits often begin with a cue, so changing what you see can change what you do.",
      imageUrl: "assets/flash_covers/atomic_habits_4.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-5", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 13", title: "Stack the Habit",
      body: "At 7:15 every morning, Leo made the same promise: *Tonight, I’ll finally read.* Then dinner happened. Messages arrived. One video became five. By bedtime, the book was still sitting untouched on his desk. Leo didn't need another motivational speech. He needed a trigger he couldn't ignore. The next morning, he changed the plan. He already had one habit he never missed: making coffee. So he attached the new habit to it. *“After I make my coffee, I’ll read one page.”* The first morning, he read one page and stopped. The second morning, he read three. A week later, the coffee machine had become a quiet signal: *Time to read.* Some mornings he read for twenty minutes. Other mornings, just one page. But the habit no longer depended on remembering or feeling motivated. It had a place in a routine that already existed. Months later, Leo realized something strange. He hadn't successfully started reading every day. He had made forgetting to read surprisingly difficult.",
      zeigarnikCliffhanger: "Why two minutes and not five? The threshold isn't arbitrary — the reasoning follows…",
      insight: "Attach a new habit to an existing habit: “After I do X, I will do Y.”",
      imageUrl: "assets/flash_covers/atomic_habits_5.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-6", bookId: "atomic-habits",
      ruleNumberOrChapter: "Chapter 16", title: "The Room Decided First",
      body: "Riya bought an expensive guitar and leaned it against the wall in her bedroom. She told everyone she was going to learn. Two weeks later, the guitar had become part of the furniture. Every evening, she came home exhausted, dropped onto the couch, and opened the TV remote that sat waiting on the coffee table. Hours disappeared without a thought. She blamed her “low motivation” for never practicing. One Saturday, Riya made a strange change. She moved the guitar to the living room—right beside the couch. The TV remote went into a drawer across the room. That evening, she reached for the remote out of habit... and her hand landed on the guitar instead. She played for five minutes. The next day, she played again. Not because she suddenly became more motivated, but because the easiest thing in the room had changed. Months later, Riya could play songs she once thought were impossible. She laughed at the idea that motivation had finally arrived. It hadn’t. Her environment had quietly been making the decision before she ever did.",
      zeigarnikCliffhanger: "Clear's own tracking method takes 10 seconds a day. It's described just ahead…",
      insight: "Design your environment so the good habit is the easiest option and the bad habit requires extra effort.",
      imageUrl: "assets/flash_covers/atomic_habits_6.jpeg",
      interactiveType: null
    },
    {
      id: "atomic-habits-7", bookId: "atomic-habits",
      ruleNumberOrChapter: "Bonus Chapter", title: "Two Minutes Is Enough",
      body: "At 6:30 a.m., Sam stood beside his yoga mat, staring at it like it had personally offended him. He had decided to exercise every morning. But the thought of a full workout felt exhausting before he had even started. So he skipped Monday. Then Tuesday. By Wednesday, the mat was back in the closet. On Thursday, Sam changed the rule. He didn’t have to work out. He only had to do two minutes. So he stepped onto the mat and stretched. Two minutes later, he could stop. The next morning, he did two push-ups. Then three. A few days later, two minutes naturally became ten. Eventually, the hardest part of exercising—the decision to begin—barely existed anymore. Sam discovered that the goal wasn't to squeeze a complete workout into every morning. It was to make showing up so easy that skipping felt stranger than starting. The tiny action looked almost laughable at first. But that was the point.",
      zeigarnikCliffhanger: "Master showing up before trying to master the entire routine…",
      insight: "When starting feels difficult, shrink the habit until it takes less than two minutes.",
      imageUrl: "assets/flash_covers/atomic_habits_7.jpeg",
      interactiveType: null
    },
  ],
  buildCards("twelve-rules", [
    ["Rule 1", "Stand up straight with your shoulders back", "Posture isn't cosmetic. Dominance hierarchies run on ancient serotonin circuitry - carrying yourself as though you belong changes the chemistry that decides how you're treated.", "The lobster comparison sounds absurd until you learn how old that circuitry is. Chapter 1 explains…"],
    ["Rule 2", "Treat yourself like someone you're responsible for helping", "People fill prescriptions for their dogs more reliably than for themselves. Self-contempt masquerades as humility and quietly sabotages the care you'd extend to anyone else.", "Peterson traces this to a specific belief about deserving. It's unpacked next…", "reflection"],
    ["Rule 4", "Compare yourself to who you were yesterday", "Comparison to others is a rigged game with infinite opponents. The only honest benchmark is your own prior state - a measure you can actually move.", "There's a question to ask when today's version feels hopeless. It appears in the next passage…"],
    ["Rule 6", "Set your house in order before you criticise the world", "Grand grievance is a comfortable way to avoid small responsibility. Fix what's within arm's reach first; the credibility to speak on larger things is earned there.", "Peterson's clinical example of this is uncomfortable and hard to forget…"],
    ["Rule 8", "Tell the truth - or at least don't lie", "Small deceptions compound into a life you didn't choose. Each one bends reality slightly until you're navigating by a map that no longer matches the terrain.", "The distinction between 'telling the truth' and 'not lying' matters more than it sounds…", "choice"],
    ["Rule 12", "Pet a cat when you encounter one on the street", "Suffering is structural, not incidental. Because of that, the small, unearned goods - a moment of beauty, an animal on a wall - aren't trivial. They're the counterweight.", "The chapter behind this rule is the most personal in the book…"],
  ]),
  buildCards("deep-work", [
    ["Rule 1", "Work deeply", "Concentration is a trainable capacity, not a mood. Choose a philosophy - monastic, bimodal, rhythmic or journalistic - and schedule depth rather than hoping for it.", "Newport time-blocks every minute of his day. The reason why is more interesting than the method…"],
    ["Rule 2", "Embrace boredom", "You can't train focus for 90 minutes then dissolve it in queues and lifts. Constant novelty-seeking rewires you toward distraction between the sessions that matter.", "There's a specific practice for the gaps in your day. It's described next…", "reflection"],
    ["Rule 3", "Quit social media", "Apply the craftsman's approach: adopt a tool only if its benefits substantially outweigh its costs for what you actually care about. 'Any benefit' is not a standard.", "The 30-day experiment Newport recommends is unusually revealing…"],
    ["Rule 4", "Drain the shallows", "Shallow work expands to fill the day. Quantify the depth of each task, then negotiate the shallow ones down - most matter far less than their urgency suggests.", "Newport's fixed-schedule productivity constraint sounds reckless until you see the second-order effect…"],
  ]),
  buildCards("seven-habits", [
    ["Habit 1", "Be proactive", "Between stimulus and response there's a space, and in that space lies your freedom. Focus on your circle of influence; the circle of concern only grows when you feed it.", "Covey's language experiment - swapping 'I have to' for 'I choose to' - changes more than tone…", "reflection"],
    ["Habit 2", "Begin with the end in mind", "All things are created twice: first mentally, then physically. Without a deliberate first creation, someone else's agenda writes your second one.", "The funeral exercise in this chapter has changed careers. It's laid out next…"],
    ["Habit 3", "Put first things first", "Urgency is a liar. Quadrant II - important but not urgent - is where prevention, planning and relationships live, and it's the first thing sacrificed to noise.", "There's a reason Quadrant II work never feels pressing enough to start…"],
    ["Habit 5", "Seek first to understand, then to be understood", "Most people listen with the intent to reply. Empathic listening - reflecting content and feeling before responding - is slower and disproportionately effective.", "Covey calls the alternative 'autobiographical listening'. You'll recognise yourself…"],
  ]),
  buildCards("mindset", [
    ["Part 1", "Two beliefs about ability", "A fixed mindset treats talent as allotted; a growth mindset treats it as developed. The belief itself determines which challenges you accept and which you quietly dodge.", "Dweck's classroom experiment reversed failing grades in weeks. The mechanism is next…"],
    ["Part 2", "Praise effort, not talent", "Children praised for being smart chose easier problems to protect the label. Those praised for effort chose harder ones. The compliment shaped the risk appetite.", "The same effect appears in performance reviews at work. The parallel is uncomfortable…", "choice"],
    ["Part 3", "Add the word 'yet'", "'I'm not good at this' is a verdict. 'I'm not good at this yet' is a position on a timeline. One word converts failure from identity into stage.", "There's a second word that does the opposite kind of damage. Dweck names it soon…"],
    ["Part 4", "Failure as information", "Fixed mindsets read setbacks as exposure; growth mindsets read them as data. The event is identical - the interpretation decides whether you return.", "Athletes at the top almost universally share one specific response to losing…", "reflection"],
  ]),
  buildCards("cant-hurt-me", [
    ["Chapter 3", "The 40% rule", "When your mind says you're finished, you're roughly 40% done. The governor in your head fires early to protect a comfort baseline you never consciously agreed to.", "Goggins found the number during a race that nearly killed him. The account is next…"],
    ["Chapter 5", "The accountability mirror", "Write your real, unflattering goals on sticky notes and put them on the mirror. Confrontation with the actual gap, daily, is more useful than any motivational content.", "The first note Goggins ever wrote was about something he'd hidden for years…", "reflection"],
    ["Chapter 7", "Callous your mind", "Comfort erodes capacity. Deliberately choosing the harder option in small daily moments builds tolerance the way repeated friction builds skin.", "There's a specific daily practice he recommends starting with…"],
    ["Chapter 9", "The cookie jar", "Bank your past victories deliberately. Under pressure, memory defaults to failure - a rehearsed inventory of proof is what you reach for instead.", "How he built his own jar after being told he'd never qualify…"],
  ]),
  buildCards("naval-almanack", [
    ["Wealth", "Seek specific knowledge", "Specific knowledge can't be trained - it's found by pursuing genuine curiosity. It feels like play to you and looks like work to everyone else.", "Naval's test for whether you've found yours is a single question…", "reflection"],
    ["Wealth", "Play long-term games with long-term people", "All returns - wealth, relationships, knowledge - come from compound interest. Compounding requires repetition with the same people over years, not clever one-off wins.", "The corollary about who to avoid is blunter than the rule itself…"],
    ["Wealth", "Earn with your mind, not your time", "Trading hours for money caps you at 24 a day. Seek leverage: capital, labour, and the permissionless kind - code and media that work while you sleep.", "Naval calls one form of leverage 'the most democratic'. It's cheaper than you think…"],
    ["Happiness", "Happiness is a skill, not a destination", "Happiness is the absence of the sense that something is missing. It's less about acquiring and more about noticing desire - every want is a contract with unhappiness.", "The definition Naval landed on took him a decade to phrase…"],
  ]),
  buildCards("meditations", [
    ["Book 2", "You could leave life right now", "Let that determine what you do, say and think. Not morbid - clarifying. Mortality is the only deadline that reliably reorders priorities.", "Aurelius wrote this to himself on campaign, surrounded by people who would…", "reflection"],
    ["Book 4", "The obstacle is the way", "Impediments to action advance action. What blocks the path becomes the path, because adapting to the obstacle is itself the progress you were seeking.", "This line launched an entire modern philosophy movement. Its context is stranger…"],
    ["Book 5", "You have power over your mind", "Not over outside events. Realise this, and you find strength. The dichotomy of control is the whole of Stoicism compressed into two sentences.", "Aurelius returns to this idea more than any other - the repetition is the point…"],
    ["Book 8", "Waste no more time arguing what a good man should be", "Be one. The gap between deliberating about virtue and practising it is where most philosophy quietly dies.", "The emperor was, by his own account, failing at this daily…", "choice"],
  ]),
  buildCards("mans-search", [
    ["Part 1", "The last of the human freedoms", "Everything can be taken but one thing: the freedom to choose your attitude in any given circumstances. Frankl watched this hold under conditions designed to disprove it.", "What he noticed about who survived contradicts every assumption…"],
    ["Part 1", "Meaning, not pleasure, sustains", "Those who had a why to live could bear almost any how. Purpose functioned as physical resilience, not sentiment.", "Frankl's own why was a manuscript hidden in a coat lining…", "reflection"],
    ["Part 2", "Suffering ceases to be suffering when it has meaning", "Pain isn't reduced by meaning, but it changes character. Meaningless suffering breaks people; meaningful suffering can be carried.", "The distinction has since been tested clinically, with surprising results…"],
    ["Part 2", "Don't aim at success", "The more you aim at it, the more you miss. Success, like happiness, must ensue as the unintended side-effect of dedication to something larger than yourself.", "Frankl's advice to his students on this is one sentence long…"],
  ]),
  buildCards("daily-stoic", [
    ["Perception", "You control the interpretation", "Events are neutral until judged. The Stoics didn't deny pain - they questioned the automatic story layered on top of it within the first second.", "There's a practical drill for catching that first-second story…", "reflection"],
    ["Action", "Do the right thing, now", "Philosophy that stays theoretical is entertainment. The Stoic measure is behavioural: what did you actually do in the small moment nobody witnessed?", "Holiday's morning and evening routine bookends this idea…"],
    ["Will", "Amor fati - love your fate", "Not mere acceptance but appetite for what happens. Wishing events were otherwise is the one guaranteed way to add suffering to suffering.", "Nietzsche took this phrase from the Stoics and sharpened it…"],
    ["Perception", "Premeditatio malorum", "Rehearse loss deliberately. Imagining the setback in advance strips it of ambush value and, oddly, increases gratitude for what's currently intact.", "The exercise takes 90 seconds and most people avoid it for one reason…"],
  ]),
  buildCards("letters-stoic", [
    ["Letter 1", "We are not given a short life", "We make it short. Time is the one asset we treat as infinite while guarding trivial possessions - most of life leaks out through inattention, not tragedy.", "Seneca's audit of how his friend actually spent a week is brutal…", "reflection"],
    ["Letter 2", "Read deeply, not widely", "Everywhere means nowhere. A person who spends life travelling ends with acquaintances, not friends - and the same is true of books skimmed rather than absorbed.", "His rule for how many books to keep in rotation is stricter than expected…"],
    ["Letter 5", "We suffer more in imagination", "There are more things likely to frighten us than to crush us. Anticipated catastrophe consumes far more life than actual catastrophe ever does.", "Seneca's remedy involves deliberately practising poverty for a few days…"],
    ["Letter 7", "Retire into yourself as much as you can", "Crowds are contagious. Time with many people returns you slightly less yourself than you arrived - vices transfer more easily than virtues.", "The exception he makes to this rule matters as much as the rule…"],
  ]),
  buildCards("essentialism", [
    ["Part 1", "If it isn't a clear yes, it's a clear no", "Score options 0–100; anything under 90 is a zero. Refusing a decent 7 is what preserves capacity for the rare 10.", "McKeown's 90% rule feels wasteful until you see what the 7s cost…", "choice"],
    ["Part 2", "Explore more, commit to less", "Essentialists explore far more options than non-essentialists - then commit to dramatically fewer. Wide search, narrow selection.", "The counterintuitive step most people skip is the first one…"],
    ["Part 3", "The power of a graceful no", "A clear no said early is kinder than a vague yes that collapses later. Separate the decision from the relationship and the conversation gets easier.", "There are eight specific scripts for this. The first is the most useful…", "reflection"],
    ["Part 4", "Protect the asset", "The most valuable asset in your work is you - and it's the one routinely sacrificed to short-term output. Sleep is a performance strategy, not a moral failing.", "McKeown's data on sleep and executive judgement is hard to argue with…"],
  ]),
  buildCards("gtd", [
    ["Chapter 2", "Your mind is for having ideas", "Not for holding them. Every unrecorded commitment consumes background attention - the anxiety isn't about the task, it's about the risk of forgetting it.", "Allen calls the resulting state 'mind like water'. The metaphor is precise…"],
    ["Chapter 5", "Capture everything, first", "One trusted inbox, zero exceptions. Partial capture keeps the background process running, which means partial capture delivers almost none of the relief.", "The initial brain-dump takes hours and Allen insists you do it in one sitting…", "reflection"],
    ["Chapter 6", "The two-minute rule", "If it takes under two minutes, do it now. The overhead of tracking a tiny task exceeds the cost of simply finishing it.", "Where this rule breaks down is more interesting than where it works…"],
    ["Chapter 8", "The weekly review is the system", "Without it, the lists rot and trust collapses. Everything else in GTD is maintenance for this single recurring appointment.", "Allen's checklist for the review has eleven steps. Step one surprises people…"],
  ]),
  buildCards("make-time", [
    ["Highlight", "Pick one thing that defines the day", "Not a to-do list - a single highlight. If nothing else happens, this made the day worthwhile. It's a filter, not a target.", "The authors' test for choosing between three candidates takes 10 seconds…", "choice"],
    ["Laser", "Design distraction out, not willpower in", "Remove apps, log out, use a distraction-free phone. The authors built these products; they know willpower loses to good design every time.", "Their most extreme tactic is deleting your browser. It's less mad than it sounds…"],
    ["Energise", "Treat the body as the battery", "Focus is physiological before it's psychological. Movement, food, caffeine timing and sleep set the ceiling that no productivity system can raise.", "Their caffeine timing chart contradicts how almost everyone drinks coffee…"],
    ["Reflect", "Keep a daily one-line note", "Record what you did and how you felt. Tuning the system requires data, and memory is an unreliable narrator by the following morning.", "Three questions turn this from journaling into an experiment…", "reflection"],
  ]),
  buildCards("the-one-thing", [
    ["Part 1", "The focusing question", "What's the ONE thing I can do such that by doing it everything else becomes easier or unnecessary? Ask it of the decade, the year, the day, the hour.", "Keller's domino metaphor explains why sequence beats effort…"],
    ["Part 2", "Multitasking is a lie", "Task-switching carries a measurable resumption cost. What feels like parallel progress is serial progress with tax deducted at every switch.", "The measured cost per switch is higher than most people guess…", "choice"],
    ["Part 2", "Willpower has a battery, not a switch", "Decision quality declines through the day. Schedule your one thing when the battery is full, not when the calendar happens to be empty.", "Which is why Keller does his one thing before email. The reasoning follows…"],
    ["Part 3", "Time-block, then defend", "Blocking is easy; defending is the skill. Build a bunker around the block and treat interruption as the default that must be actively refused.", "His scripts for defending blocked time are worth memorising…", "reflection"],
  ]),
  buildCards("thinking-fast-slow", [
    ["Part 1", "Two systems, one narrator", "System 1 is fast, automatic and always on. System 2 is slow, effortful and lazy. Most 'thinking' is System 1 with System 2 signing off afterwards.", "The bat-and-ball problem catches roughly half of Ivy League students…"],
    ["Part 2", "What You See Is All There Is", "The mind builds a coherent story from available information and rarely asks what's missing. Confidence tracks story quality, not evidence quality.", "Kahneman's own decades-long error with this bias is instructive…", "reflection"],
    ["Part 3", "Anchoring moves you without consent", "An arbitrary number shifts subsequent estimates - even when you know it's arbitrary, even when you're an expert being paid to be accurate.", "Judges' sentencing shifted after rolling dice. The study is real…"],
    ["Part 4", "Losses loom larger than gains", "Roughly twice as large. Loss aversion explains inertia, sunk costs and why 'don't lose what you have' outsells 'gain something better'.", "The asymmetry has a specific ratio, and it's stable across cultures…"],
  ]),
  buildCards("influence", [
    ["Weapon 1", "Reciprocity", "An unrequested favour creates obligation. The free sample, the mint with the bill, the small gift before the ask - all exploit a rule older than commerce.", "The mint experiment tripled tips with a two-cent change…"],
    ["Weapon 3", "Social proof", "Under uncertainty we look sideways. The more ambiguous the situation, the more heavily we weight what similar others appear to be doing.", "Which is why 'most guests reuse their towels' beats every environmental appeal…", "choice"],
    ["Weapon 4", "Authority", "Symbols of authority - titles, uniforms, credentials - trigger compliance faster than the substance behind them. The costume often outperforms the expertise.", "The Milgram parallel Cialdini draws is uncomfortable but fair…"],
    ["Weapon 6", "Scarcity", "Opportunities feel more valuable as availability drops. Notably, it isn't the item we crave - it's the loss of the option to have it.", "Cialdini's rule for resisting this one is a physical sensation, not a thought…", "reflection"],
  ]),
  buildCards("flow", [
    ["Chapter 3", "Challenge must match skill", "Too easy is boredom, too hard is anxiety. Flow lives on the narrow diagonal where difficulty rises just ahead of competence.", "Which is why flow is unstable by design - the channel keeps moving…"],
    ["Chapter 4", "Clear goals, immediate feedback", "Flow requires knowing what to do next and whether it worked. Ambiguity is the single most common reason absorbing work stops being absorbing.", "This is why surgeons and climbers report flow more than office workers…", "reflection"],
    ["Chapter 5", "The self disappears, then returns larger", "Self-consciousness costs attention. In flow that overhead drops away, and afterwards the self reassembles with more complexity than before.", "Csikszentmihalyi calls this the paradox of losing yourself…"],
    ["Chapter 6", "The autotelic personality", "Some people find flow in circumstances that bore everyone else. The capacity is trainable - it's mostly about how finely you set your own goals.", "His interviews with assembly-line workers make this concrete…"],
  ]),
  buildCards("predictably-irrational", [
    ["Chapter 1", "Everything is relative", "We can't judge value in isolation, so we compare. Introduce a deliberately inferior third option and preferences between the original two shift predictably.", "The Economist subscription experiment is the cleanest demonstration…", "choice"],
    ["Chapter 2", "Arbitrary coherence", "First prices anchor all later ones. Once an anchor is set, subsequent judgements become internally consistent - and entirely disconnected from real worth.", "Ariely used social security digits to set prices. It worked…"],
    ["Chapter 4", "Social norms vs market norms", "Introduce money and a favour becomes a transaction - permanently. The two norm systems don't blend; the market one overwrites the social one.", "Which is why a small payment produced worse effort than no payment…", "reflection"],
    ["Chapter 6", "We over-value keeping options open", "Doors that might close command irrational effort. Keeping every path available costs more than the paths are worth, and we do it anyway.", "The door-clicking experiment mirrors most career indecision…"],
  ]),
  buildCards("body-keeps-score", [
    ["Part 1", "Trauma lives in the body", "It isn't stored as narrative but as physiology - heart rate, muscle tension, startle response. This is why recounting the story alone often fails to resolve it.", "Brain scans during flashback show Broca's area going quiet…"],
    ["Part 2", "The brain's alarm outruns language", "The amygdala fires before the prefrontal cortex can weigh in. Rational reassurance arrives after the body has already committed to a response.", "Van der Kolk calls this the tyranny of a smoke detector that can't be reset…", "reflection"],
    ["Part 4", "Safety must be felt, not argued", "Recovery starts with a nervous system that registers safety - through breath, movement and rhythm - before insight becomes usable.", "Which is why yoga outperformed some medications in his trials…"],
    ["Part 5", "Agency is the antidote", "Trauma is the experience of helplessness. Interventions that restore a sense of effective action - theatre, drumming, martial arts - do disproportionate work.", "The prison theatre programme results are hard to believe…"],
  ]),
  buildCards("power-of-habit", [
    ["Chapter 1", "The habit loop", "Cue, routine, reward - then craving, which is what makes the loop self-sustaining. The brain stops fully participating once the loop is established.", "The rats-in-a-maze scans show exactly when thinking switches off…"],
    ["Chapter 3", "The golden rule of habit change", "You can't extinguish a habit, only replace its routine. Keep the same cue and the same reward, swap what happens in between.", "AA has used this structure for decades without naming it…", "choice"],
    ["Chapter 4", "Keystone habits", "Some habits carry others with them. Exercise, food journalling and making your bed correlate with unrelated improvements because they shift self-perception.", "Alcoa's safety obsession accidentally quintupled profits. That story is next…"],
    ["Chapter 5", "Willpower is a muscle", "It fatigues with use and strengthens with training. Which explains why decisions made late in the day are reliably worse than the same decisions made early.", "The Starbucks response-plan training turned this into a system…", "reflection"],
  ]),
  buildCards("tiny-habits", [
    ["Chapter 1", "B = MAP", "Behaviour happens when Motivation, Ability and a Prompt converge. Motivation is the least reliable of the three - so engineer the other two.", "Fogg's model predicts failure better than it predicts success…"],
    ["Chapter 3", "Shrink it until it's laughable", "Two push-ups. One page. Flossing a single tooth. The goal is to make the behaviour so small that motivation becomes irrelevant to whether it happens.", "The size Fogg recommends is smaller than almost everyone chooses…", "choice"],
    ["Chapter 4", "Anchor to what already happens", "'After I pour my coffee, I will…' Existing routines are reliable prompts. Inventing new ones is where most habit plans quietly fail.", "The anchor recipe format matters more than the wording suggests…", "reflection"],
    ["Chapter 5", "Celebrate immediately", "Emotions create habits, not repetition. A genuine flash of positive feeling right after the behaviour is what wires it in - most people skip this entirely.", "Fogg's own celebration is embarrassing and he does it anyway…"],
  ]),
  buildCards("hooked", [
    ["Step 1", "Triggers, external then internal", "Products start with external prompts - notifications, emails. Success is when an internal trigger takes over and boredom itself becomes the cue.", "The transition point is measurable, and it's the whole business model…"],
    ["Step 2", "Action must be trivially easy", "Reduce the effort between impulse and behaviour to near zero. Every removed step multiplies conversion far more than added motivation would.", "Eyal's ranking of which friction to remove first is counterintuitive…"],
    ["Step 3", "Variable rewards", "Predictable rewards lose power; unpredictable ones sustain it. The scroll works because you don't know what the next card holds.", "This is the mechanism behind almost every feed you use - including this one…", "reflection"],
    ["Step 4", "Investment loads the next trigger", "Small user investments - data, followers, reputation - store value that makes the next return more likely. The product improves with use, so leaving costs more.", "Eyal's ethical framework for this arrives late in the book, and it's contested…", "choice"],
  ]),
  buildCards("indistractable", [
    ["Part 1", "Distraction starts inside", "The ping isn't the cause. Distraction is the escape route from an uncomfortable internal state - boredom, anxiety, uncertainty - that arrived first.", "Eyal's reversal of his own previous book begins here…", "reflection"],
    ["Part 1", "The opposite of distraction is traction", "Not focus - traction. Any action pulling you toward your intent counts, including rest you actually planned. Unplanned is the real problem.", "Which makes 'wasting time' a scheduling question, not a moral one…"],
    ["Part 2", "Timebox your values, not your tasks", "Schedule against who you want to be across three domains - you, relationships, work. A calendar without white space is a calendar that will be hijacked.", "The three-domain audit takes 20 minutes and usually stings…"],
    ["Part 3", "Use pacts, not willpower", "Effort, price and identity pacts pre-commit you when future-you is weak. Design the constraint while motivated; rely on it when you aren't.", "The identity pact is the most durable of the three. Here's why…", "choice"],
  ]),
  buildCards("compound-effect", [
    ["Chapter 1", "Small, smart choices + consistency + time", "That's the whole formula. Its weakness is also its power: the results are invisible for long enough that most people quit before the curve bends.", "Hardy's penny-doubling comparison makes the invisible middle concrete…"],
    ["Chapter 2", "Track one behaviour ruthlessly", "You can't improve what you don't measure. Hardy's clients who tracked a single metric outperformed those who optimised many.", "The half-percent daily change he tracked first was about food…", "reflection"],
    ["Chapter 3", "Momentum takes longer than you think", "Big Mo arrives only after unglamorous repetition. The routine that feels pointless in week three is the one producing results in month nine.", "The flywheel takes a specific number of reps to spin up…"],
    ["Chapter 5", "Your average is your reality", "You're the average of the five people you spend most time with, the inputs you consume, and the habits you repeat. Change the average, not the intention.", "Hardy's audit of his own inputs cut three friendships…", "choice"],
  ]),
);

function cardsForBook(bookId) { return FLASHCARDS.filter(c => c.bookId === bookId); }
function bookById(id) { return BOOKS.find(b => b.id === id); }
function topicBySlug(slug) { return TOPICS.find(t => t.slug === slug); }
function booksForTopic(name) {
  return BOOKS.filter(b => b.topic === name || (b.relatedTopics || []).includes(name));
}

/* ============================================================
   4) TESTIMONIALS
   ============================================================ */
const TESTIMONIALS = [
  { name: "Maya R.",    handle: "@mayabuilds",   avatar: "MR", color: "#ff3d7f", rating: 5, quote: "I deleted two social apps and replaced them with this. Six weeks later I've actually finished three books instead of doom-scrolling through zero." },
  { name: "Daniel K.",  handle: "@dank",         avatar: "DK", color: "#7b2ff7", rating: 5, quote: "The spaced repetition is the part nobody else does. Ideas come back exactly when I'm about to forget them. It's genuinely changed what sticks." },
  { name: "Priya S.",   handle: "@priyareads",   avatar: "PS", color: "#00b894", rating: 5, quote: "The focus timer kicking me out after 15 minutes felt insulting at first. Now it's the only app I trust, because it's the only one that wants me to leave." },
  { name: "Tom A.",     handle: "@tomalvarez",   avatar: "TA", color: "#0984e3", rating: 4, quote: "I read maybe four books a year. I now get through the key ideas of four a week and buy the ones that hit. My reading budget has never been higher." },
  { name: "Leila N.",   handle: "@leilan",       avatar: "LN", color: "#fd9644", rating: 5, quote: "Started connecting dots between behavioural econ and my own product work within days. It's the first learning app that made me feel smarter, not busier." },
  { name: "Sam O.",     handle: "@samotieno",    avatar: "SO", color: "#e84393", rating: 5, quote: "The interactive cards are unreasonably good. Dragging a slider and watching expected value flip negative taught me more than a whole finance chapter." },
];

/* ============================================================
   5) FAQ
   ============================================================ */
const FAQS = [
  { q: "Is this just book summaries?", a: "No. Summaries hand you a compressed plot; we hand you individual ideas engineered to stick - with cliffhangers that push you toward the real book, interactive models you can play with, and spaced repetition that resurfaces each idea right before you'd forget it." },
  { q: "How long does it take each day?", a: "Most people do 10–15 minutes. The Focus Stamina meter caps a deep session at 15 minutes and then actively encourages you to close the app and read the actual book. That's not a bug." },
  { q: "Why does the app try to get rid of me?", a: "Because attention is the product you're spending, not the one we're selling. Every feed you use is optimised for time-on-app. This one is optimised for ideas retained per minute - and after a point, the best next step is the physical book." },
  { q: "What is spaced repetition, exactly?", a: "It's the SuperMemo SM-2 algorithm - the same engine behind Anki. Each idea you grade gets an interval (1 day, then 6, then multiplied by an ease factor). Cards quietly re-enter your feed on the day you're most likely to be about to forget them." },
  { q: "Does it work offline?", a: "Yes. Your review schedule lives in IndexedDB on your device, and your progress in local storage. Nothing is required from a server to keep learning, and nothing about your reading leaves your browser." },
  { q: "Do I still need to buy books?", a: "We hope so - that's the point. Every cliffhanger deliberately stops short and tells you which chapter to open. Think of this as the index to a library you'll actually use, not a replacement for it." },
  { q: "What's actually in Pro?", a: "Unlimited daily ideas, the full 25-book library with every deep-dive flashcard, custom growth plans, AI-generated visuals on every card, and export of your stash to Markdown or Anki. Free covers the daily feed and core spaced repetition forever." },
];

/* ============================================================
   6) PRICING
   ============================================================ */
const PRICING = {
  tiers: [
    { id: "free", name: "Free", price: "$0", period: "forever", cta: "Start free", note: "No card required." },
    { id: "pro",  name: "Pro",  price: "$4", period: "/ month", cta: "Get Smarter", note: "Cancel anytime.", featured: true },
  ],
  features: [
    { label: "Daily idea feed",                    free: true,  pro: true },
    { label: "Spaced repetition (SM-2)",           free: true,  pro: true },
    { label: "Focus Stamina & Rewire levels",      free: true,  pro: true },
    { label: "Ideas per day",                      free: "5",   pro: "Unlimited" },
    { label: "Full 25-book deep-dive library",     free: false, pro: true },
    { label: "Interactive micro-sandboxes",        free: "3 / week", pro: "Unlimited" },
    { label: "AI visuals on every card",           free: false, pro: true },
    { label: "Custom growth plans",                free: false, pro: true },
    { label: "Export stash to Markdown / Anki",    free: false, pro: true },
    { label: "Offline library caching",            free: false, pro: true },
  ],
};

/* ============================================================
   7) LANDING COPY BLOCKS
   ============================================================ */
const BENEFIT_PILLS = [
  { ico: "📵", text: "Replace mindless scrolling" },
  { ico: "🔗", text: "Start connecting dots" },
  { ico: "✨", text: "Become the interesting person" },
  { ico: "📈", text: "Confidence from continuous growth" },
];

const FEATURES = [
  { ico: "🧠", title: "Ideas engineered to stick", body: "Every card is one mental model, written to be understood in 40 seconds and remembered for months." },
  { ico: "🔁", title: "Spaced repetition built in", body: "The SM-2 algorithm decides when each idea returns - right before your memory would have dropped it." },
  { ico: "🧪", title: "Play with the concept", body: "Interactive sandboxes let you drag the variables and watch the model react, instead of just reading about it." },
  { ico: "🚪", title: "An app that shows you the door", body: "At 100% focus stamina we pause the feed and point you at a specific chapter. Attention returned, not harvested." },
];

/* ============================================================
   8) FEED CARDS - Variable Reward Engine pools
   ============================================================ */
const REWARD_WEIGHTS = { core: 0.6, sandbox: 0.2, diagram: 0.2 };

const CORE_CARDS = [
  { id: "c1", kind: "core", topic: "Habits", source: "Atomic Habits", type: "Book", author: "James Clear", cover: "⚛", coverColor: "#ff6a3d",
    title: "You don't rise to your goals - you fall to your systems",
    body: "Goals set your direction, but your daily systems decide how far you actually get. Winners and losers share the same goals; the difference is the process they repeat.",
    cliffhanger: "There's a 4-step loop that rewires almost any habit - it's laid out in Chapter 3…",
    unlock: "Cue → Craving → Response → Reward. Make the cue obvious and the reward immediate, and the loop runs itself.",
    likes: 3120, saves: 1890 },
  { id: "c2", kind: "core", topic: "Focus", source: "Deep Work", type: "Book", author: "Cal Newport", cover: "🧩", coverColor: "#7b2ff7",
    title: "The ability to focus is becoming a superpower",
    body: "As distraction becomes the default, the rare skill of concentrating without interruption on hard problems is turning into the most valuable currency of the knowledge economy.",
    cliffhanger: "Newport swears by one scheduling ritual most people never try - it hides in Rule #1…",
    unlock: "Time-block every minute of your day in advance. A flawed plan you revise beats an open day you drift through.",
    likes: 2740, saves: 2010 },
  { id: "c3", kind: "core", topic: "Psychology", source: "Thinking, Fast and Slow", type: "Book", author: "Daniel Kahneman", cover: "🐢", coverColor: "#0984e3",
    title: "What You See Is All There Is",
    body: "Your mind builds a confident story from whatever information is in front of it - and almost never pauses to ask what it's missing. Coherence, not evidence, is what feels like truth.",
    cliffhanger: "Why do the most confident experts get it wrong so often? The answer sits in the next section…",
    unlock: "Because confidence tracks how neatly the story fits, not how much data supports it. Ask 'what would I need to be wrong?'",
    likes: 1980, saves: 1420 },
  { id: "c4", kind: "core", topic: "Money", source: "The Psychology of Money", type: "Book", author: "Morgan Housel", cover: "💰", coverColor: "#00b894",
    title: "Wealth is what you don't see",
    body: "Wealth is the cars not bought, the upgrades declined, the money kept invested instead of spent. It's invisible by definition - which is exactly why it's so easy to mistake income for it.",
    cliffhanger: "One ordinary behavior beats raw intelligence with money almost every time - revealed just ahead…",
    unlock: "Patience. Staying invested and not touching it lets compounding do the heavy lifting your brains never could.",
    likes: 2560, saves: 1770 },
  { id: "c5", kind: "core", topic: "Health", source: "Huberman Lab", type: "Podcast", author: "Andrew Huberman", cover: "🎙", coverColor: "#e84393",
    title: "Morning light sets your entire day",
    body: "Natural light early in the day anchors your circadian clock, sharpens focus, lifts mood, and quietly programs how easily you'll fall asleep that night - hours before you're tired.",
    cliffhanger: "There's a precise window that flips your cortisol switch on. The exact timing is coming up…",
    unlock: "5–10 minutes of outdoor light within 30–60 minutes of waking. No sunglasses, and a cloudy sky still counts.",
    likes: 3410, saves: 2900 },
  { id: "c6", kind: "core", topic: "Psychology", source: "Mindset", type: "Book", author: "Carol Dweck", cover: "🌟", coverColor: "#ff3d7f",
    title: "The most powerful word is 'yet'",
    body: "\"I'm not good at this\" is a verdict. \"I'm not good at this yet\" is a stage. One word reframes failure from an identity into a step on a longer path.",
    cliffhanger: "A single classroom experiment turned failing students around in weeks - it's on the next page…",
    unlock: "Kids praised for effort ('you worked hard') chose harder problems; kids praised for being 'smart' avoided risk to protect the label.",
    likes: 2980, saves: 2240 },
  { id: "c7", kind: "core", topic: "Productivity", source: "Essentialism", type: "Book", author: "Greg McKeown", cover: "◽", coverColor: "#6c5ce7",
    title: "If it isn't a clear yes, it's a clear no",
    body: "The disciplined pursuit of less means treating almost everything as noise so the vital few can get everything you've got. Most options aren't bad - they're just not essential.",
    cliffhanger: "There's a '90% rule' that makes hard choices almost automatic - it waits in Part 2…",
    unlock: "Score any option 0–100. If it's below 90, it's a 0. Refusing to settle for a 'pretty good' 7 protects room for a 10.",
    likes: 2110, saves: 1560 },
  { id: "c8", kind: "core", topic: "Money", source: "The Almanack of Naval Ravikant", type: "Book", author: "Eric Jorgenson", cover: "⛵", coverColor: "#0984e3",
    title: "Play long-term games with long-term people",
    body: "Every real return in life - wealth, relationships, mastery - is compound interest. The people you keep showing up for and the skills you keep sharpening pay off exponentially, not linearly.",
    cliffhanger: "Which kind of knowledge compounds fastest and can't be trained out of you? He names it soon…",
    unlock: "Specific knowledge - the stuff you learn by obsession and play, not schooling. It feels like a hobby to you and like work to others.",
    likes: 2670, saves: 2100 },
];

const SANDBOX_CARDS = [
  { id: "s1", kind: "sandbox", mode: "slider", topic: "Money", source: "Micro-sandbox", type: "Risk vs. Reward", cover: "🎲", coverColor: "#00b894",
    title: "The bet that looks smart",
    prompt: "Risk $100 for a shot at winning $150. Drag to your honest odds of winning and watch the math decide.",
    slider: { min: 0, max: 100, step: 1, value: 50, unit: "%", leftLabel: "Hopeless", rightLabel: "Certain" },
    compute: function (v) {
      const f = v / 100, ev = 250 * f - 100, good = ev > 8, bad = ev < -8;
      return { main: (ev >= 0 ? "+$" : "−$") + Math.abs(ev).toFixed(0), sub: "expected value per play",
        verdict: bad ? "Walk away - below 40% odds, courage is just a slow leak."
              : good ? "Take it. Repeated enough times, the math pays you."
                     : "A near coin-toss. The edge has vanished - the koan is knowing when not to play.",
        tone: bad ? "bad" : good ? "good" : "neutral" };
    }, likes: 1240, saves: 860 },
  { id: "s2", kind: "sandbox", mode: "slider", topic: "Habits", source: "Micro-sandbox", type: "Compounding", cover: "📈", coverColor: "#fd9644",
    title: "1% better, every day",
    prompt: "Nudge how much you improve each day and watch a single year compound. Small numbers get loud.",
    slider: { min: 0, max: 3, step: 0.1, value: 1, unit: "% / day", leftLabel: "Idle", rightLabel: "Relentless" },
    compute: function (v) {
      const mult = Math.pow(1 + v / 100, 365), good = mult >= 3, bad = mult < 1.4;
      return { main: mult.toFixed(1) + "×", sub: "you, one year later",
        verdict: bad ? "Barely moving. Consistency this low is almost indistinguishable from standing still."
              : good ? `Compounding is quietly violent - ${v.toFixed(1)}% a day becomes ${mult.toFixed(0)}× a year.`
                     : "Real, but slow. The gap between 1% and 2% a day is an entire different person.",
        tone: bad ? "bad" : good ? "good" : "neutral" };
    }, likes: 1980, saves: 1510 },
  { id: "s3", kind: "sandbox", mode: "choice", topic: "Productivity", source: "Zen koan", type: "Decision tree", cover: "🌀", coverColor: "#6c5ce7",
    title: "A free hour appears",
    prompt: "An unclaimed hour lands in your lap. Follow it and meet the version of you at the other end.",
    start: "a",
    nodes: {
      a: { q: "An empty, unplanned hour opens up. What wins?", options: [{ label: "Rest", to: "rest" }, { label: "Build", to: "build" }] },
      rest: { q: "You rest - and the guilt shows up right on schedule.", options: [{ label: "Let it go", to: "peace" }, { label: "Fight it", to: "grind" }] },
      build: { q: "You build. Momentum feels great - until it starts to fray.", options: [{ label: "Sprint harder", to: "burn" }, { label: "Stop while it's fun", to: "sustain" }] },
      peace: { insight: "Rest without guilt is the rarest productivity skill there is. The chapter on strategic idleness would nod." },
      grind: { insight: "You reclaimed the hour but spent the energy fighting yourself. Recovery you resist isn't recovery." },
      burn: { insight: "You got more done today and less done this month. Sprinting past the fun is how good work quietly dies." },
      sustain: { insight: "Leaving on a high keeps the door open for tomorrow. The Zeigarnik pull of an unfinished good thing is your friend." },
    }, likes: 1450, saves: 990 },
  { id: "s4", kind: "sandbox", mode: "choice", topic: "Money", source: "Zen koan", type: "Decision tree", cover: "🃏", coverColor: "#0984e3",
    title: "$100 now, or $200 in a year",
    prompt: "The classic marshmallow, grown up. Choose - then meet the trade-off you actually made.",
    start: "a",
    nodes: {
      a: { q: "Take $100 today, or $200 twelve months from now?", options: [{ label: "$100 now", to: "now" }, { label: "$200 later", to: "later" }] },
      now: { q: "Present-you wins. Present-you always votes first. Now what?", options: [{ label: "Spend it", to: "spend" }, { label: "Invest it", to: "invest" }] },
      later: { q: "You waited - a guaranteed 100% return, better than almost any fund.", options: [{ label: "Feel clever", to: "clever" }, { label: "Stay humble", to: "humble" }] },
      spend: { insight: "The dopamine was real and gone by Tuesday. Impatience isn't wrong - it's just expensive when it's the default." },
      invest: { insight: "You turned an impulse into an asset. The magic wasn't the $100; it was refusing to let it stay $100." },
      clever: { insight: "Delayed gratification is a superpower - right up until smugness makes you skip the next easy win." },
      humble: { insight: "You noticed the choice was easy only because the numbers were clear. Most real ones aren't. That awareness is the reward." },
    }, likes: 1120, saves: 740 },
];

const DIAGRAM_CARDS = [
  { id: "d1", kind: "diagram", topic: "Psychology", source: "Visual model", type: "Fact diagram", cover: "📉", coverColor: "#ff3d7f",
    title: "The forgetting curve",
    caption: "Memory of new material decays fast - unless you interrupt it.",
    insight: "One quick review on day 1 flattens the whole curve. Spacing beats cramming, every time.",
    svg: `<svg viewBox="0 0 320 170" class="dgm">
      <style>.ax{stroke:var(--border);stroke-width:1}.gl{fill:var(--text-faint);font:600 10px Inter,system-ui,sans-serif}
        .decay{fill:none;stroke:#ff3d7f;stroke-width:3;stroke-linecap:round}
        .review{fill:none;stroke:#7b2ff7;stroke-width:2.5;stroke-dasharray:5 5}
        .lg{fill:var(--text-soft);font:600 10px Inter,system-ui,sans-serif}</style>
      <defs><linearGradient id="fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3d7f" stop-opacity=".22"/><stop offset="1" stop-color="#ff3d7f" stop-opacity="0"/></linearGradient></defs>
      <line class="ax" x1="34" y1="12" x2="34" y2="140"/><line class="ax" x1="34" y1="140" x2="306" y2="140"/>
      <path d="M40 26 C110 74 150 120 300 134 L300 140 L40 140 Z" fill="url(#fc)"/>
      <path class="decay" d="M40 26 C110 74 150 120 300 134"/>
      <path class="review" d="M40 26 C92 40 122 44 150 40 C210 32 252 46 300 42"/>
      <text class="gl" x="6" y="30">100%</text><text class="gl" x="22" y="150">0</text><text class="gl" x="238" y="158">30 days</text>
      <circle cx="52" cy="150" r="4" fill="#ff3d7f"/><text class="lg" x="62" y="154">no review</text>
      <circle cx="150" cy="150" r="4" fill="#7b2ff7"/><text class="lg" x="160" y="154">with review</text></svg>`,
    likes: 2210, saves: 1680 },
  { id: "d2", kind: "diagram", topic: "Money", source: "Visual model", type: "Mental model", cover: "🧊", coverColor: "#0984e3",
    title: "Wealth is an iceberg",
    caption: "You judge people by the tip. The mass that matters is underwater.",
    insight: "Spending is visible; wealth is the part deliberately kept out of sight.",
    svg: `<svg viewBox="0 0 320 190" class="dgm">
      <style>.wl{stroke:#7b2ff7;stroke-width:2;stroke-dasharray:4 4;opacity:.6}
        .lbl{fill:var(--text);font:700 12px Inter,system-ui,sans-serif}
        .sub{fill:var(--text-faint);font:600 10px Inter,system-ui,sans-serif}</style>
      <rect x="0" y="72" width="320" height="118" fill="#0984e3" opacity=".07"/>
      <line class="wl" x1="0" y1="72" x2="320" y2="72"/>
      <polygon points="150,30 122,72 178,72" fill="#8fb4ff"/>
      <polygon points="122,72 178,72 208,178 92,178" fill="#3a63c9" opacity=".9"/>
      <text class="lbl" x="212" y="52">What you see</text><text class="sub" x="212" y="66">the spending</text>
      <text class="lbl" x="212" y="120">What you don't</text><text class="sub" x="212" y="134">the wealth</text></svg>`,
    likes: 1890, saves: 1520 },
  { id: "d3", kind: "diagram", topic: "Productivity", source: "Visual model", type: "Mental model", cover: "⛰", coverColor: "#12c48b",
    title: "You must climb down to climb higher",
    caption: "Stuck on a local peak? The only way up is a stretch of down.",
    insight: "The best next move often looks like a step backward. Comfort is a summit that traps you.",
    svg: `<svg viewBox="0 0 320 168" class="dgm">
      <style>.curve{fill:none;stroke:#12c48b;stroke-width:3;stroke-linecap:round}
        .note{fill:var(--text-faint);font:600 10px Inter,system-ui,sans-serif}
        .arw{stroke:var(--text-faint);stroke-width:1.5;fill:none}</style>
      <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="var(--text-faint)"/></marker></defs>
      <path class="curve" d="M12 138 C58 44 92 44 132 96 C168 142 206 22 306 22"/>
      <circle cx="76" cy="52" r="7" fill="#ff3d7f"/>
      <text class="note" x="40" y="34">you are here</text><text class="note" x="222" y="16">global peak</text>
      <path class="arw" d="M112 74 C128 90 150 92 168 80" marker-end="url(#ah)"/>
      <text class="note" x="112" y="120">the dip you must accept</text></svg>`,
    likes: 1640, saves: 1180 },
  { id: "d4", kind: "diagram", topic: "Productivity", source: "Visual model", type: "Fact diagram", cover: "📊", coverColor: "#e84393",
    title: "The 80 / 20 anomaly",
    caption: "A lopsided few inputs drive almost all the output.",
    insight: "Find the vital 20% and the rest is mostly polite noise. Cut accordingly.",
    chart: { type: "bar", unit: "%", data: [{ label: "Vital 20% of effort", value: 80 }, { label: "Trivial 80% of effort", value: 20 }] },
    likes: 1720, saves: 1290 },
];

const SEED_CARDS = [...CORE_CARDS, ...SANDBOX_CARDS, ...DIAGRAM_CARDS];

/* ============================================================
   9) ONBOARDING & PERSONALIZATION DATA
   ============================================================ */
const GROWTH_AREAS = [
  { id: "emotions",      label: "Emotions & Motivation",         ico: "❤️", topics: ["Psychology", "Personal Development"] },
  { id: "habits",        label: "Habits & Mindset",              ico: "🔁", topics: ["Habits", "Productivity"] },
  { id: "confidence",    label: "Confidence & Self-Care",        ico: "🌟", topics: ["Personal Development", "Health"] },
  { id: "exercise",      label: "Exercise & Empathy",            ico: "🫀", topics: ["Health", "Psychology"] },
  { id: "relationships", label: "Relationships & Love",          ico: "💞", topics: ["Leadership", "Psychology"] },
  { id: "finance",       label: "Personal Finance & Creativity", ico: "💸", topics: ["Money", "Creativity"] },
];

const INSPIRING_FIGURES = [
  { id: "steve-jobs",      name: "Steve Jobs",      ico: "🍎", blurb: "Obsessive focus & taste" },
  { id: "marcus-aurelius", name: "Marcus Aurelius", ico: "🏛", blurb: "Stoic discipline" },
  { id: "naval",           name: "Naval Ravikant",  ico: "⛵", blurb: "Wealth & clear thinking" },
  { id: "michelle-obama",  name: "Michelle Obama",  ico: "🎓", blurb: "Purpose-driven leadership" },
  { id: "einstein",        name: "Albert Einstein", ico: "🧠", blurb: "Curiosity over certainty" },
  { id: "maya-angelou",    name: "Maya Angelou",    ico: "🕊", blurb: "Resilience & voice" },
];

const HABIT_QUIZ_QUESTIONS = [
  { id: "q1", q: "Do you think regular workouts improve your daily performance?" },
  { id: "q2", q: "Do you usually plan your day before it starts?" },
  { id: "q3", q: "Do you find it easy to say no to distractions?" },
  { id: "q4", q: "Do you review what you learned at the end of the day?" },
  { id: "q5", q: "Do you sleep on a consistent schedule?" },
  { id: "q6", q: "Do you set specific, measurable goals for yourself?" },
];

const MICRO_CHECK_QUESTIONS = [
  { id: "giveUp", q: "Do you want to give up when things get hard?" },
  { id: "listen", q: "Do you like to learn by listening?" },
  { id: "finish", q: "Are you inclined to finish what you start?" },
];

const DISCOVERY_BOOK_IDS = ["atomic-habits", "twelve-rules", "deep-work", "meditations", "thinking-fast-slow"];
const SAMPLE_BOOK_IDS = ["atomic-habits", "twelve-rules", "meditations"];

const PACE_OPTIONS = [
  { id: "easy",      label: "Easy",      minutes: 5,  desc: "5 mins / day" },
  { id: "common",    label: "Common",    minutes: 10, desc: "10 mins / day" },
  { id: "serious",   label: "Serious",   minutes: 15, desc: "15 mins / day" },
  { id: "intensive", label: "Intensive", minutes: 20, desc: "20 mins / day" },
];

const LEARNING_FORMATS = [
  { id: "reading",     label: "Reading",     ico: "📖" },
  { id: "listening",   label: "Listening",   ico: "🎧" },
  { id: "video",       label: "Video",       ico: "🎬" },
  { id: "visual",      label: "Visual",      ico: "📊" },
  { id: "interactive", label: "Interactive", ico: "🧪" },
];

const THINKING_STYLES = [
  { id: "big-picture", label: "Big Picture",     ico: "🔭", feedback: "💡 Big picture thinking helps you quickly connect ideas and solve problems others miss." },
  { id: "detail",      label: "Detail-Oriented", ico: "🔬", feedback: "💡 Detail-oriented thinkers catch what others overlook - precision compounds into expertise." },
];

const PERSONALITY_TYPES = [
  { id: "introvert", label: "Introvert", ico: "🌙", feedback: "Team Introvert: a great listener and thoughtful thinker. You'll get the most from deep, quiet reps." },
  { id: "extrovert", label: "Extrovert", ico: "☀️", feedback: "Team Extrovert: energised by people and momentum. You'll get the most from applying ideas out loud." },
];

// Average minutes to complete one book's flashcard set - used to project pace -> books/month.
function avgBookMinutes() {
  return BOOKS.reduce((s, b) => s + b.minutes, 0) / BOOKS.length;
}
function projectBooksPerMonth(dailyMinutes) {
  const perMonth = (dailyMinutes * 30) / avgBookMinutes();
  const lo = Math.max(1, Math.floor(perMonth * 0.85));
  const hi = Math.max(lo + 1, Math.ceil(perMonth * 1.15));
  return { lo, hi };
}

/* ============================================================
   10) DEFAULT USER / PROFILE FACTORY
   ------------------------------------------------------------
   NOTE: This is a fully client-side demo. "Accounts" persist in
   localStorage purely for prototyping the funnel end-to-end -
   never store real passwords like this in a production system.
   ============================================================ */
function createGuestUser() {
  return {
    isAuthenticated: false,
    onboardingComplete: false,
    onboardingStep: 1,
    tier: "guest",
    guestPreviewCount: {},   // { [bookId]: number of cards opened }
    profile: {
      firstName: "", lastName: "", phone: "", email: "",
      bio: "", avatarUrl: "",
      ageGroup: "", gender: "",
      growthAreas: [], roleModel: "", thinkingStyle: "", personality: "",
      habits: {}, brandAware: null, bookInterests: [],
      dailyPace: "", learningFormats: [], notifyEnabled: true,
    },
  };
}

/* ============================================================
   11) AUTHENTICATED HOME - collections, creators, daily picks,
       notifications. Collections link back into the existing
       SEED_CARDS / BOOKS pools rather than duplicating content.
   ============================================================ */
const COLLECTIONS = [
  { id: "productivity-hacks",     title: "Productivity Hacks",                 ico: "⚡", grad: "linear-gradient(135deg,#ff6a3d,#ff3d7f)", cardIds: ["c7", "s2"],       bookIds: ["essentialism", "the-one-thing", "make-time", "gtd"] },
  { id: "beat-procrastination",   title: "Beat Procrastination",               ico: "⏳", grad: "linear-gradient(135deg,#fd9644,#f7b731)", cardIds: ["c1", "d3"],       bookIds: ["atomic-habits", "tiny-habits", "compound-effect"] },
  { id: "remote-work",            title: "Making Remote Work",                 ico: "💻", grad: "linear-gradient(135deg,#0984e3,#00cec9)", cardIds: ["c2"],             bookIds: ["deep-work", "indistractable", "make-time"] },
  { id: "outside-the-box",        title: "Think Outside the Box",              ico: "🧩", grad: "linear-gradient(135deg,#a55eea,#fd79a8)", cardIds: ["d4", "s3"],       bookIds: ["predictably-irrational", "hooked"] },
  { id: "mental-models",          title: "Mental Models for Clarity",          ico: "🔭", grad: "linear-gradient(135deg,#7b2ff7,#3d7bff)", cardIds: ["c3", "d1"],       bookIds: ["thinking-fast-slow", "predictably-irrational"] },
  { id: "habits-routines",        title: "Mastering Habits & Routines",        ico: "🔁", grad: "linear-gradient(135deg,#12c48b,#3dd6b0)", cardIds: ["c1", "s2"],       bookIds: ["atomic-habits", "power-of-habit", "tiny-habits"] },
  { id: "emotional-intelligence", title: "Emotional Intelligence & Empathy",   ico: "❤️", grad: "linear-gradient(135deg,#e84393,#6c5ce7)", cardIds: ["c6"],             bookIds: ["body-keeps-score", "mans-search"] },
  { id: "stoic-philosophy",       title: "Stoic Philosophy in Action",         ico: "🏛", grad: "linear-gradient(135deg,#8e6e53,#2f3640)", cardIds: [],                 bookIds: ["meditations", "daily-stoic", "letters-stoic"] },
  { id: "speed-learning",         title: "Speed Learning & Memory Retention",  ico: "🧠", grad: "linear-gradient(135deg,#ff3d7f,#7b2ff7)", cardIds: ["d1"],             bookIds: ["flow", "thinking-fast-slow"] },
  { id: "deep-focus",             title: "Deep Focus & Flow State",            ico: "🎯", grad: "linear-gradient(135deg,#0ea5a3,#0984e3)", cardIds: ["c2"],             bookIds: ["deep-work", "flow"] },
  { id: "wealth-psychology",      title: "Wealth & Financial Psychology",      ico: "💸", grad: "linear-gradient(135deg,#00b894,#0984e3)", cardIds: ["c4", "c8", "s1", "d2"], bookIds: ["naval-almanack", "compound-effect"] },
  { id: "leadership-influence",   title: "Leadership & Influence",             ico: "🚀", grad: "linear-gradient(135deg,#e84393,#a55eea)", cardIds: [],                 bookIds: ["seven-habits", "influence", "twelve-rules"] },
  { id: "resilience",             title: "Resilience Under Pressure",          ico: "🛡", grad: "linear-gradient(135deg,#c0392b,#e17055)", cardIds: ["d3"],             bookIds: ["cant-hurt-me", "meditations"] },
  { id: "creative-problem-solving", title: "Creative Problem Solving",         ico: "🎨", grad: "linear-gradient(135deg,#6c5ce7,#00cec9)", cardIds: ["d4", "s3"],       bookIds: ["predictably-irrational"] },
  { id: "mindfulness-stress",     title: "Mindfulness & Stress Relief",        ico: "🧘", grad: "linear-gradient(135deg,#00cec9,#55efc4)", cardIds: [],                 bookIds: ["flow", "body-keeps-score", "meditations"] },
];
function collectionById(id) { return COLLECTIONS.find(c => c.id === id); }

const CREATORS = [
  { id: "cr-utsa",   name: "Utsa Maity",     avatar: "UM", color: "#ff3d7f", bio: "Curates ideas from spiritual & growth books.", followers: "18.2k" },
  { id: "cr-daniel", name: "Daniel Cross",   avatar: "DC", color: "#7b2ff7", bio: "Deep work, focus, and building slower.", followers: "9.4k" },
  { id: "cr-priya",  name: "Priya Nair",     avatar: "PN", color: "#0984e3", bio: "Behavioural psychology, made bite-sized.", followers: "12.7k" },
  { id: "cr-marcus", name: "Marcus Diallo",  avatar: "MD", color: "#00b894", bio: "Stoicism for people who hate self-help.", followers: "6.1k" },
  { id: "cr-lena",   name: "Lena Ostrowski", avatar: "LO", color: "#fd9644", bio: "Wealth, habits, and the boring middle.", followers: "15.0k" },
  { id: "cr-theo",   name: "Theo Bramwell",  avatar: "TB", color: "#e84393", bio: "Leadership lessons from bad managers.", followers: "4.8k" },
  { id: "cr-aiko",   name: "Aiko Tanaka",    avatar: "AT", color: "#00cec9", bio: "Flow, creativity, and deliberate rest.", followers: "8.3k" },
  { id: "cr-sam",    name: "Sam Okafor",     avatar: "SO", color: "#6c5ce7", bio: "Reads the books so your feed doesn't have to.", followers: "21.5k" },
];
const DEFAULT_FOLLOWING = ["cr-utsa", "cr-priya"];

const DAILY_PICKS_IDS = ["atomic-habits", "meditations", "thinking-fast-slow", "flow", "naval-almanack", "twelve-rules", "deep-work", "mindset"];

const NOTIFICATIONS_SEED = [
  { id: "n1", ico: "🔥", title: "7-day streak!", body: "Keep it going - one idea today keeps it alive.", time: "2h ago" },
  { id: "n2", ico: "🧠", title: "Cards due for review", body: "3 ideas are ready for spaced repetition.", time: "5h ago" },
  { id: "n3", ico: "👤", title: "Utsa Maity followed you back", body: "Check out their latest curated ideas.", time: "1d ago" },
  { id: "n4", ico: "✨", title: "New collection", body: "\"Deep Focus & Flow State\" just launched.", time: "2d ago" },
  { id: "n5", ico: "🎉", title: "Level up!", body: "You reached Level 3: Active Learner.", time: "3d ago" },
];

/* ============================================================
   12) PWA DATA LAYER
   a) CUSTOM STASHES  - seeded user-curated stash collections
   b) CARD COMMENTS   - seeded discussion threads per card
   c) TTS FIELDS      - narration text injected into each card
      (no schema change to FLASHCARDS array; resolved at runtime
       via getTtsScript(card) so existing card objects are
       unchanged and the field is computed-on-demand)
   ============================================================ */

/* ---- 12a) Custom Stashes ---- */
const SEED_STASHES = [
  {
    id: "stash-morning",
    title: "Morning Brain Priming",
    description: "Ideas I re-read with coffee before 8 AM to set the frame for the day.",
    color: "#fd9644",
    ico: "☀️",
    cardIds: ["c1", "d1", "atomic-habits-2"],
    createdAt: Date.now() - 14 * 86400000,
    updatedAt: Date.now() - 2 * 86400000,
  },
  {
    id: "stash-systems",
    title: "Systems > Goals",
    description: "Every card that convinces me to redesign the process instead of white-knuckling the target.",
    color: "#7b2ff7",
    ico: "⚙️",
    cardIds: ["c2", "atomic-habits-1", "atomic-habits-4", "s2"],
    createdAt: Date.now() - 30 * 86400000,
    updatedAt: Date.now() - 5 * 86400000,
  },
  {
    id: "stash-stoic-core",
    title: "Stoic Operating System",
    description: "The six ideas I reach for when things go sideways.",
    color: "#2f3640",
    ico: "🏛",
    cardIds: ["meditations-1", "meditations-2", "meditations-3", "d4"],
    createdAt: Date.now() - 60 * 86400000,
    updatedAt: Date.now() - 1 * 86400000,
  },
  {
    id: "stash-money-clarity",
    title: "Money & Wealth Clarity",
    description: "Mental models about money that actually changed my behaviour.",
    color: "#00b894",
    ico: "💸",
    cardIds: ["naval-almanack-1", "naval-almanack-2", "s1", "d2"],
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now() - 7 * 86400000,
  },
  {
    id: "stash-focus-stack",
    title: "Deep Focus Stack",
    description: "Pre-session reminders to eliminate distraction before I open my editor.",
    color: "#0984e3",
    ico: "🎯",
    cardIds: ["c2", "deep-work-1", "deep-work-2", "deep-work-3"],
    createdAt: Date.now() - 21 * 86400000,
    updatedAt: Date.now() - 3 * 86400000,
  },
];
function stashById(id) { return SEED_STASHES.find(s => s.id === id); }

/* ---- 12b) Card Comments / Discussion Threads ---- */
const SEED_CARD_COMMENTS = {
  "c1": [
    { id: "cm-c1-1", author: "cr-utsa",   avatar: "UM", color: "#ff3d7f", text: "This one rewired how I think about New Year's resolutions. Stopped making them entirely - just audit the system.", likes: 47, ts: Date.now() - 3 * 86400000 },
    { id: "cm-c1-2", author: "cr-priya",  avatar: "PN", color: "#0984e3", text: "The feedback loop matters more than the goal. Once you see it that way you stop blaming motivation.", likes: 31, ts: Date.now() - 2 * 86400000 },
    { id: "cm-c1-3", author: "cr-sam",    avatar: "SO", color: "#6c5ce7", text: "\"Winners and losers share identical goals.\" That sentence alone is worth the whole book.", likes: 88, ts: Date.now() - 1 * 86400000 },
  ],
  "atomic-habits-2": [
    { id: "cm-ah2-1", author: "cr-daniel", avatar: "DC", color: "#7b2ff7", text: "Identity-based habits are underrated. Most people try to motivate behaviour with outcomes, never touching the belief layer.", likes: 64, ts: Date.now() - 5 * 86400000 },
    { id: "cm-ah2-2", author: "cr-lena",   avatar: "LO", color: "#fd9644", text: "I journalled 'I am someone who exercises' for 30 days before I started. Sounds woo but it worked.", likes: 52, ts: Date.now() - 4 * 86400000 },
  ],
  "d1": [
    { id: "cm-d1-1", author: "cr-aiko",   avatar: "AT", color: "#00cec9", text: "Ebbinghaus proved this in 1885 and we still teach by cramming. The evidence gap in education is wild.", likes: 103, ts: Date.now() - 6 * 86400000 },
    { id: "cm-d1-2", author: "cr-marcus", avatar: "MD", color: "#00b894", text: "Day-1 review flattens the curve dramatically. That's exactly what the SM-2 engine in this app does.", likes: 79, ts: Date.now() - 2 * 86400000 },
  ],
  "s2": [
    { id: "cm-s2-1", author: "cr-theo",   avatar: "TB", color: "#e84393", text: "Tried 0.5% on the slider. The compound still beats zero after a year. That's the real insight.", likes: 38, ts: Date.now() - 1 * 86400000 },
  ],
  "meditations-1": [
    { id: "cm-med1-1", author: "cr-marcus", avatar: "MD", color: "#00b894", text: "Marcus wrote this as a private journal. He never intended it to be published. That's what makes it hit different.", likes: 144, ts: Date.now() - 10 * 86400000 },
    { id: "cm-med1-2", author: "cr-utsa",   avatar: "UM", color: "#ff3d7f", text: "The Stoic practice of journalling isn't therapy - it's pre-mortems on your own character. Big difference.", likes: 91, ts: Date.now() - 7 * 86400000 },
  ],
  "naval-almanack-1": [
    { id: "cm-nav1-1", author: "cr-sam",  avatar: "SO", color: "#6c5ce7", text: "Specific knowledge is the one that gets slept on. Most people chase skills that are infinitely copiable.", likes: 72, ts: Date.now() - 4 * 86400000 },
    { id: "cm-nav1-2", author: "cr-lena", avatar: "LO", color: "#fd9644", text: "I've re-read this card monthly for two years and find something different each time. The density is insane.", likes: 55, ts: Date.now() - 2 * 86400000 },
  ],
  "c2": [
    { id: "cm-c2-1", author: "cr-daniel", avatar: "DC", color: "#7b2ff7", text: "Newport is polarising but the core thesis is empirically solid. Shallow work is genuinely cheap to automate.", likes: 49, ts: Date.now() - 3 * 86400000 },
  ],
};
function commentsForCard(cardId) { return SEED_CARD_COMMENTS[cardId] || []; }

/* ---- 12c) TTS (Text-to-Speech) Narration Scripts ----
   getTtsScript(card) returns a narration-ready plain-text
   string for the card. For Core cards this is a slightly
   expanded read-aloud version of title + body; for Diagram
   and Sandbox cards it describes the visual/interactive so
   a listener without sight can follow along.

   The returned object has:
     { intro, body, outro, durationEstSec }

   intro  - short scene-setter (<15 words)
   body   - full narration text (read aloud)
   outro  - closing sentence bridging to next card
   durationEstSec - rough estimate at 150 wpm
*/
function getTtsScript(card) {
  function wc(s) { return s ? s.trim().split(/\s+/).length : 0; }
  function dur(s) { return Math.ceil(wc(s) / 150 * 60); }

  if (!card) return null;

  if (card.kind === "diagram") {
    const body = `${card.title}. ${card.caption || ""} ${card.insight || ""}`.trim();
    return {
      intro: "Visual model.",
      body,
      outro: card.insight ? card.insight : "Take a moment to let that picture settle.",
      durationEstSec: Math.max(8, dur(body)),
    };
  }

  if (card.kind === "sandbox") {
    const body = `${card.title}. ${card.prompt || ""}`.trim();
    return {
      intro: card.mode === "slider" ? "Interactive model." : "Decision scenario.",
      body,
      outro: "Pause here and try the interactive version - it'll make the numbers concrete.",
      durationEstSec: Math.max(8, dur(body)),
    };
  }

  // Core card
  const titleText  = card.title  || card.ruleNumberOrChapter || "";
  const bodyText   = card.body   || "";
  const cliffText  = card.zeigarnikCliffhanger || card.cliffhanger || "";
  const unlockText = card.unlock || "";
  const full       = [bodyText, unlockText].filter(Boolean).join(" ");
  const outro      = cliffText ? cliffText : "That's the idea - let it sit for a moment.";

  return {
    intro: `From ${card.source || card.author || "the book"}.`,
    body: full || titleText,
    outro,
    durationEstSec: Math.max(6, dur(full)),
  };
}
