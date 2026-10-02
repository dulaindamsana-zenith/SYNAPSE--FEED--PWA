# 🧠 Synapse Feed 

> **Built to guide you off the screen.**
> Synapse Feed is a zero-friction, responsive Progressive Web Application (PWA) designed to hijack doomscrolling habits directly in web browsers. 

---


## The Problem: The Doomscrolling Trap
Modern short-form social media feeds are engineered to maximize screen time through low-friction dopamine loops. Existing educational alternatives fail to replace doomscrolling because of high entry friction, cognitive fatigue, and the illusion of competence. 


## The Solution: Attention Stacking Pipeline
Synapse Feed captures users with zero-friction visual framework cards, progressively scales reading stamina, and actively hands the user off to long-form books (e.g., *Atomic Habits*, *Deep Work*).

---

## Massive Feature Set

### 1. Zero-Friction Launch
*   **Instant First Card:** Eliminates decision fatigue by bypassing sign-in forms and onboarding surveys.
*   **Lightning Fast:** Loads the first visual mental model card in under 800ms directly in mobile and desktop browsers.

### 2. Variable Reward Engine (60/20/20 Mix)
Algorithmically varies card types to prevent cognitive habituation:
*   **60% Core Knowledge Cards:** Concise, high-value behavioral framework breakdowns (15s-45s read).
*   **20% Interactive Micro-Sandboxes:** Runnable decision sliders, cognitive bias checkers, and Stoic choice trees.
*   **20% Visual Fact Diagrams:** Visual anomalies and "Aha!" insights that stimulate curiosity.

### 3. Advanced Cognitive Mechanics
*   **Zeigarnik Curiosity Cliffhangers:** Leaves cards incomplete at peak curiosity moments (e.g., "The solution is in Chapter 3..."), creating cognitive tension that drives real reading.
*   **Invisible Spaced Repetition:** Runs an underlying Anki-style memory decay engine (SM-2 Algorithm) in browser memory (IndexedDB) to quietly re-inject previously viewed concepts at calculated intervals.
*   **IKEA Effect & Haptics:** Requires 1-second physical interactions (dragging sliders, binary choices) paired with device Haptic Feedback for intrinsic satisfaction.

### 4. Identity Rewiring Metrics
*   **Focus Stamina Meter:** Displays cumulative deep focus time instead of vanity metrics.
*   **Brain Rewire Level:** Measures user transition from a passive swiper to an active deep reader.
*   **The App-as-a-Bridge Exit:** Employs intentional high-friction exit prompts when focus stamina peaks, explicitly instructing users to close the app and read a physical book.

---


## Technical Architecture & Tech Stack

### Access Layer (Web First)
*   **Frontend:** HTML, CSS, JavaScript (React + Vite) targeting 60fps smooth gestures.
*   **Storage:** Local IndexedDB / Web Cache for offline-first capabilities at zero operational cost.

### Backend API
*   **Framework:** Python (FastAPI).
*   **Hosting:** Deployed on Render / Railway / Fly.io free tiers.

### Database & Auth
*   **Platform:** Supabase (Free Tier) for PostgreSQL database, authentication, and real-time sync.

### AI Non-Fiction Ingestion Pipeline
*   **Stack:** LangChain + Groq API / Hugging Face.
*   **Function:** Extracts text from PDFs/books, runs through a parsing pipeline, and generates atomic notes, questions, and summaries.

---


## Installation & Local Development

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/dulaindamsana-zenith/SYNAPSE--FEED--PWA.git
cd SYNAPSE--FEED--PWA
\`\`\`

### 2. Frontend Setup (React + Vite)
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
*The frontend will run on \`http://localhost:5173\`.*

### 3. Backend Setup (FastAPI)
\`\`\`bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
\`\`\`
*The API will be available at \`http://127.0.0.1:8001\`.*

### 4. Environment Variables
Create a \`.env\` file in the root of your frontend and backend directories:
\`\`\`env
# Frontend (.env)
VITE_API_BASE_URL=http://127.0.0.1:8001

# Backend (.env)
DATABASE_URL=your_supabase_postgresql_url
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
\`\`\`

---


## Deployment Strategy
1.  **Database:** Hosted on **Supabase** (PostgreSQL).
2.  **Backend:** Hosted on **Render** (using `render.yaml`).
3.  **Frontend:** Hosted on **Vercel** (using `vercel.json` for SPA routing).

---

## License
This project is licensed under the Apache License 2.0.