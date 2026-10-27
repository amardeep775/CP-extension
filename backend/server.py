#!/usr/bin/env python3
"""
CF Recall - Persistent Localhost Backend & Database Server
Stores Codeforces solve history, notes, and connected account in SQLite.
Provides in-app Codeforces problemset explorer with rating & topic filtering,
live Codeforces submissions verdict polling, and code submission integration.
"""

import os
import sys
import json
import sqlite3
import time
import urllib.request
import urllib.parse
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import mimetypes

PORT = 3344
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "cf_recall.db")

print(f"[CF Recall] Starting server from: {BASE_DIR}")
print(f"[CF Recall] Database file: {DB_PATH}")

# In-memory problemset cache to avoid rate limits
PROBLEMSET_CACHE = {}

# ==============================================================================
# DATABASE MANAGEMENT (SQLite)
# ==============================================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    # Settings table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    # Problems table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS problems (
            id TEXT PRIMARY KEY,
            contest_id TEXT,
            index_char TEXT,
            title TEXT,
            rating INTEGER,
            tags TEXT,
            status TEXT,
            revisit INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            time_spent_sec INTEGER DEFAULT 0,
            created_at INTEGER,
            updated_at INTEGER,
            url TEXT
        )
    """)
    # Default handle if not set
    cur.execute("SELECT value FROM settings WHERE key = 'cf_handle'")
    if not cur.fetchone():
        cur.execute("INSERT INTO settings (key, value) VALUES ('cf_handle', 'asp775')")

    conn.commit()
    conn.close()
    print("[CF Recall] SQLite database initialized successfully.")

init_db()

# ==============================================================================
# CODEFORCES API HELPERS
# ==============================================================================
def fetch_cf_user_profile(handle):
    try:
        url = f"https://codeforces.com/api/user.info?handles={urllib.parse.quote(handle)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; CFRecall)'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            if data.get('status') == 'OK' and data.get('result'):
                return data['result'][0]
    except Exception as e:
        print(f"[CF Recall] Error fetching CF user profile: {e}")
    return None

def fetch_cf_submissions(handle, count=1000):
    try:
        url = f"https://codeforces.com/api/user.status?handle={urllib.parse.quote(handle)}&from=1&count={count}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; CFRecall)'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
            if data.get('status') == 'OK':
                return data.get('result', [])
    except Exception as e:
        print(f"[CF Recall] Error fetching CF submissions: {e}")
    return None

def fetch_cf_problemset(tags_str=""):
    cache_key = tags_str.strip().lower()
    now = time.time()
    if cache_key in PROBLEMSET_CACHE:
        entry = PROBLEMSET_CACHE[cache_key]
        if now - entry['timestamp'] < 600: # 10 minute cache
            return entry['problems'], entry['stats']

    try:
        q = urllib.parse.quote(tags_str) if tags_str else ""
        url = f"https://codeforces.com/api/problemset.problems" + (f"?tags={q}" if q else "")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; CFRecall)'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
            if data.get('status') == 'OK':
                probs = data['result'].get('problems', [])
                stats = data['result'].get('problemStatistics', [])
                PROBLEMSET_CACHE[cache_key] = {'timestamp': now, 'problems': probs, 'stats': stats}
                return probs, stats
    except Exception as e:
        print(f"[CF Recall] Error fetching CF problemset: {e}")
    return [], []

# ==============================================================================
# HTTP REQUEST HANDLER (REST API + Static Files)
# ==============================================================================
class CFRecallHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                raw_data = self.rfile.read(content_length).decode('utf-8')
                return json.loads(raw_data)
        except Exception as e:
            print(f"[CF Recall] Error parsing JSON body: {e}")
        return {}

    # --------------------------------------------------------------------------
    # GET Endpoints
    # --------------------------------------------------------------------------
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        url_path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # 1. API: Server Health & Status
        if url_path == '/api/status':
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM problems")
            count = cur.fetchone()[0]
            cur.execute("SELECT value FROM settings WHERE key = 'cf_handle'")
            row = cur.fetchone()
            handle = row[0] if row else "asp775"
            cur.execute("SELECT value FROM settings WHERE key = 'email'")
            email_row = cur.fetchone()
            email = email_row[0] if email_row else ""
            conn.close()
            return self.send_json(200, {
                "status": "online",
                "database": "sqlite",
                "total_problems": count,
                "connected_handle": handle,
                "email": email,
                "port": PORT
            })

        # 2. API: Get User Settings & Profile
        if url_path == '/api/settings' or url_path == '/api/user':
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM settings")
            settings_map = dict(cur.fetchall())
            conn.close()

            handle = settings_map.get('cf_handle', 'asp775')
            email = settings_map.get('email', '')
            preferred_language = settings_map.get('preferred_language', 'cpp20')
            profile = None
            if 'cf_profile' in settings_map:
                try: profile = json.loads(settings_map['cf_profile'])
                except: profile = None

            return self.send_json(200, {
                "handle": handle,
                "email": email,
                "preferred_language": preferred_language,
                "profile": profile
            })

        # 3. API: Get All Tracked Problems from Database
        if url_path == '/api/problems':
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM problems ORDER BY updated_at DESC")
            rows = cur.fetchall()
            conn.close()

            problems_dict = {}
            for r in rows:
                p_id = r['id']
                tags_list = []
                if r['tags']:
                    try: tags_list = json.loads(r['tags'])
                    except: tags_list = [t.strip() for t in r['tags'].split(',') if t.strip()]

                problems_dict[p_id] = {
                    "id": p_id,
                    "contestId": r['contest_id'],
                    "index": r['index_char'],
                    "title": r['title'],
                    "rating": r['rating'],
                    "tags": tags_list,
                    "status": r['status'],
                    "revisit": bool(r['revisit']),
                    "notes": r['notes'],
                    "timeSpentSec": r['time_spent_sec'],
                    "createdAt": r['created_at'],
                    "updatedAt": r['updated_at'],
                    "url": r['url'] or f"https://codeforces.com/problemset/problem/{r['contest_id']}/{r['index_char']}"
                }
            return self.send_json(200, problems_dict)

        # 4. API: Live Codeforces Problemset Explorer with Rating & Tag Filters
        if url_path == '/api/problemset':
            tags_arg = query_params.get('tags', [''])[0].strip()
            min_r = query_params.get('minRating', [None])[0]
            max_r = query_params.get('maxRating', [None])[0]
            status_filter = query_params.get('statusFilter', ['all'])[0]
            search_query = query_params.get('q', [''])[0].strip().lower()

            min_rating = int(min_r) if min_r and min_r.isdigit() else None
            max_rating = int(max_r) if max_r and max_r.isdigit() else None

            # Fetch Codeforces problemset
            cf_problems, stats = fetch_cf_problemset(tags_arg)

            # Get user's local database statuses
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, status, revisit, notes FROM problems")
            user_db_map = {row['id']: dict(row) for row in cur.fetchall()}
            conn.close()

            results = []
            for p in cf_problems:
                c_id = str(p.get('contestId', ''))
                idx = str(p.get('index', ''))
                p_id = f"{c_id}{idx}"
                name = p.get('name', '')
                rating = p.get('rating')
                tags = p.get('tags', [])

                # Filter by rating
                if min_rating is not None and (rating is None or rating < min_rating):
                    continue
                if max_rating is not None and (rating is None or rating > max_rating):
                    continue

                # User status
                tracked = user_db_map.get(p_id)
                user_status = tracked['status'] if tracked else 'unsolved'
                is_revisit = bool(tracked['revisit']) if tracked else False
                user_notes = tracked['notes'] if tracked else ''

                # Filter by status
                if status_filter == 'unsolved' and user_status != 'unsolved':
                    continue
                elif status_filter == 'solo' and user_status != 'solo':
                    continue
                elif status_filter == 'hint' and user_status != 'hint':
                    continue
                elif status_filter == 'solution' and user_status != 'solution':
                    continue
                elif status_filter == 'solved' and user_status == 'unsolved':
                    continue

                # Filter by text search
                if search_query:
                    if (search_query not in p_id.lower() and 
                        search_query not in name.lower() and 
                        not any(search_query in t.lower() for t in tags)):
                        continue

                results.append({
                    "id": p_id,
                    "contestId": c_id,
                    "index": idx,
                    "name": name,
                    "rating": rating,
                    "tags": tags,
                    "userStatus": user_status,
                    "revisit": is_revisit,
                    "notes": user_notes,
                    "url": f"https://codeforces.com/problemset/problem/{c_id}/{idx}"
                })

                if len(results) >= 100:  # limit to top 100 per search for snappy performance
                    break

            return self.send_json(200, {
                "total": len(results),
                "problems": results
            })

        # 5. API: Live Polling for Latest Submissions / Verdict
        if url_path == '/api/submissions/latest':
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT value FROM settings WHERE key = 'cf_handle'")
            row = cur.fetchone()
            conn.close()
            handle = row[0] if row else "asp775"

            subs = fetch_cf_submissions(handle, count=10) or []
            clean_subs = []
            for s in subs:
                p = s.get('problem', {})
                c_id = str(p.get('contestId', ''))
                idx = str(p.get('index', ''))
                clean_subs.append({
                    "id": s.get('id'),
                    "problemId": f"{c_id}{idx}",
                    "problemName": p.get('name', ''),
                    "verdict": s.get('verdict', 'TESTING'),
                    "passedCount": s.get('passedTestCount', 0),
                    "programmingLanguage": s.get('programmingLanguage', ''),
                    "timeSeconds": s.get('creationTimeSeconds', 0)
                })
            return self.send_json(200, clean_subs)

        # Default static file routing
        if url_path == '/' or url_path == '' or url_path == '/index.html':
            self.path = '/index.html'
        elif url_path == '/styles.css':
            self.path = '/styles.css'
        elif url_path == '/app.js':
            self.path = '/app.js'
        elif url_path == '/dashboard':
            self.path = '/index.html'

        return super().do_GET()

    # --------------------------------------------------------------------------
    # POST Endpoints
    # --------------------------------------------------------------------------
    def do_POST(self):
        url_path = self.path.split('?')[0]
        payload = self.read_json_body()

        # 1. API: Save Settings (Handle + Email + Preferences)
        if url_path == '/api/settings' or url_path == '/api/user':
            handle = payload.get('handle', '').strip()
            email = payload.get('email', '').strip()
            pref_lang = payload.get('preferred_language', '').strip()

            conn = get_db()
            cur = conn.cursor()
            if handle:
                cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('cf_handle', ?)", (handle,))
                profile = fetch_cf_user_profile(handle)
                if profile:
                    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('cf_profile', ?)", (json.dumps(profile),))
            if email:
                cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('email', ?)", (email,))
            if pref_lang:
                cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('preferred_language', ?)", (pref_lang,))

            conn.commit()
            conn.close()

            print(f"[CF Recall] Saved settings: handle='{handle}', email='{email}'")
            return self.send_json(200, {
                "success": True,
                "handle": handle,
                "email": email
            })

        # 2. API: Upsert Problem Record
        if url_path == '/api/problems':
            prob_id = payload.get('id', '').strip().upper()
            if not prob_id:
                return self.send_json(400, {"error": "Problem ID is required"})

            contest_id = str(payload.get('contestId', ''))
            index_char = str(payload.get('index', ''))
            title = payload.get('title', f"Problem {prob_id}")
            rating = payload.get('rating')
            if rating is not None:
                try: rating = int(rating)
                except: rating = None

            tags = payload.get('tags', [])
            tags_json = json.dumps(tags) if isinstance(tags, list) else json.dumps([])
            status = payload.get('status')
            revisit = 1 if payload.get('revisit') else 0
            notes = payload.get('notes', '')
            time_spent = int(payload.get('timeSpentSec', 0))
            now_ms = int(time.time() * 1000)
            url = payload.get('url', f"https://codeforces.com/problemset/problem/{contest_id}/{index_char}" if contest_id and index_char else "")

            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO problems (id, contest_id, index_char, title, rating, tags, status, revisit, notes, time_spent_sec, created_at, updated_at, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = COALESCE(excluded.title, problems.title),
                    rating = COALESCE(excluded.rating, problems.rating),
                    tags = CASE WHEN length(excluded.tags) > 2 THEN excluded.tags ELSE problems.tags END,
                    status = excluded.status,
                    revisit = excluded.revisit,
                    notes = excluded.notes,
                    time_spent_sec = excluded.time_spent_sec,
                    updated_at = excluded.updated_at,
                    url = COALESCE(excluded.url, problems.url)
            """, (prob_id, contest_id, index_char, title, rating, tags_json, status, revisit, notes, time_spent, now_ms, now_ms, url))
            conn.commit()
            conn.close()

            print(f"[CF Recall] Saved problem {prob_id} (status: {status}) in SQLite database.")
            return self.send_json(200, {"success": True, "id": prob_id})

        # 3. API: Batch Sync with Codeforces Account
        if url_path == '/api/sync':
            handle = payload.get('handle', '').strip()
            if not handle:
                conn = get_db()
                cur = conn.cursor()
                cur.execute("SELECT value FROM settings WHERE key = 'cf_handle'")
                row = cur.fetchone()
                conn.close()
                handle = row[0] if row else "asp775"

            subs = fetch_cf_submissions(handle, count=1000)
            if subs is None:
                return self.send_json(500, {"error": f"Failed to fetch submissions for handle '{handle}' from Codeforces"})

            ac_map = {}
            for s in subs:
                if s.get('verdict') == 'OK' and 'problem' in s:
                    p = s['problem']
                    c_id = str(p.get('contestId', ''))
                    idx = str(p.get('index', ''))
                    if c_id and idx:
                        k = f"{c_id}{idx}"
                        if k not in ac_map:
                            ac_map[k] = p

            conn = get_db()
            cur = conn.cursor()
            inserted_count = 0
            for k, p in ac_map.items():
                c_id = str(p.get('contestId', ''))
                idx = str(p.get('index', ''))
                title = p.get('name', f"Problem {k}")
                rating = p.get('rating')
                tags_json = json.dumps(p.get('tags', []))
                url = f"https://codeforces.com/problemset/problem/{c_id}/{idx}"

                cur.execute("SELECT id FROM problems WHERE id = ?", (k,))
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO problems (id, contest_id, index_char, title, rating, tags, status, revisit, notes, time_spent_sec, created_at, updated_at, url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', 0, ?, ?, ?)
                    """, (k, c_id, idx, title, rating, tags_json, 'solo', int(time.time()*1000), int(time.time()*1000), url))
                    inserted_count += 1

            conn.commit()
            conn.close()

            print(f"[CF Recall] Synced {handle}: {len(ac_map)} total AC, {inserted_count} newly added.")
            return self.send_json(200, {
                "success": True,
                "handle": handle,
                "total_solved_on_cf": len(ac_map),
                "newly_added": inserted_count
            })

        return self.send_json(404, {"error": "Endpoint not found"})

    # --------------------------------------------------------------------------
    # DELETE Endpoints
    # --------------------------------------------------------------------------
    def do_DELETE(self):
        url_path = self.path.split('?')[0]
        if url_path.startswith('/api/problems/'):
            prob_id = url_path.replace('/api/problems/', '').strip().upper()
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM problems WHERE id = ?", (prob_id,))
            conn.commit()
            conn.close()
            print(f"[CF Recall] Deleted problem {prob_id} from database.")
            return self.send_json(200, {"success": True, "deleted": prob_id})

        return self.send_json(404, {"error": "Endpoint not found"})

# ==============================================================================
# MAIN ENTRYPOINT
# ==============================================================================
def run():
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, CFRecallHandler)
    print("=" * 60)
    print(f"🚀 CF Recall Database Server running on: http://localhost:{PORT}")
    print(f"📁 Web Dashboard available at:           http://localhost:{PORT}/cf-recall-dashboard/index.html")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[CF Recall] Server stopping...")
        httpd.server_close()

if __name__ == '__main__':
    run()
