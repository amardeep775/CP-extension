# ⚡ CF Recall - Codeforces Solve & Mastery Tracker

> Track whether you solved Codeforces problems **Solo**, with **Editorial / Hints**, or with **Full Solution**. Includes a **Chrome Extension** for direct in-page tracking and a rich **Web Dashboard** with Codeforces API sync & spaced repetition!

---

## 🎯 The Problem it Solves
When preparing on Codeforces, an **Accepted (AC)** verdict does NOT tell the full story:
- Did you solve it completely on your own with 0 hints?
- Did you need a small observation from the editorial?
- Did you look at someone's implementation code or watch a video solution?
- Did you write down what you learned and schedule it for a re-attempt?

**CF Recall** gives you true honesty in your competitive programming practice.

---

## 📦 What's Included

1. **`cf-recall-extension/`**:
   - Manifest V3 Chrome Extension ready to load into Google Chrome.
   - **Injected Floating HUD**: Appears on problem pages (`codeforces.com/problemset/problem/*`, `codeforces.com/contest/*/problem/*`).
   - **Problem Title Badge**: Injects status badge directly next to the problem statement title.
   - **Problemset Table Badges**: Shows color-coded badges in the main problem list table (`codeforces.com/problemset`) so you can see your mastery at a glance.
   - **Stopwatch**: Track time spent on each problem.
   - **Notes & Tags**: Quick notes on key tricks, invariants, and algorithms (DP, Greedy, Trees, etc.).
   - **Extension Popup**: Instant search, recent solves, stats summary, and backup export/import.

2. **`cf-recall-dashboard/`** (and also accessible inside the extension):
   - Standalone modern Web App (Dark Mode + Glassmorphism).
   - **True Mastery Ratio**: Real solo-solve % vs editorial % across rating tiers (800 to 2400+).
   - **Spaced Repetition Queue**: Dedicated revision tab for problems solved with editorial.
   - **Codeforces Live API Sync**: Enter your CF handle to automatically fetch all your accepted submissions!
   - **Filter & Search**: Filter by rating, tag, solve method, and text search.
   - **Data Backup**: One-click JSON export and import.

3. **`demo/mock-codeforces.html`**:
   - A realistic offline simulation of a Codeforces problem page (`1800C2`) to test the injection, dock, badges, and notes immediately without opening Codeforces!

---

## 🚀 Quick Setup Instructions

### Option 1: Load the Chrome Extension (Recommended)
1. Open Google Chrome.
2. In the address bar, type `chrome://extensions` and press Enter.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (button in top-left).
5. Select the folder:
   ```
   cf-recall-extension
   ```
6. Open any problem on [Codeforces](https://codeforces.com/problemset)!
   - You will see the floating **⚡ Track CF Recall** pill in the bottom right and the title badge next to the problem name!

### Option 2: Run the Web Dashboard & Localhost Database
The backend uses native Python with a persistent SQLite database (`cf_recall.db`).

**To manage the background service:**
```bash
./manage.sh status            # Check if running and view connected account
./manage.sh enable-autostart   # ⚡ Runs ALL THE TIME whenever you open your MacBook!
./manage.sh disable-autostart  # Disable autostart
./manage.sh start             # Start manually in background
./manage.sh stop              # Stop the server
```

Then visit anytime:
- **Web Dashboard**: [http://localhost:3344](http://localhost:3344)
- **Codeforces Mock Demo**: [http://localhost:3344/demo/mock-codeforces.html](http://localhost:3344/demo/mock-codeforces.html)

---

## 🏷️ Status Classifications

| Status | Color | Meaning |
|---|---|---|
| **🟢 Solo** | Emerald | Solved 100% on your own with zero hints. |
| **🟡 Hint / Tutorial** | Amber | Read editorial or hint to get the idea, but coded yourself. |
| **🔴 Watched Solution** | Red | Needed to read code or watch a video solution. |
| **🟣 In Progress** | Purple | Currently attempting or taking a break. |
| **⭐ Revisit** | Rose | Bookmarked for spaced repetition to re-solve in 3–7 days. |

---

## 🔒 Privacy & Local Storage
All your notes, classifications, and times are stored locally on your device (`chrome.storage.local` and `localStorage`). No external servers, no tracking, 100% private. You can export a JSON backup anytime.
