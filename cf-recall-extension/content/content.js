/**
 * CF Recall - Codeforces Solve Tracker
 * Injected Content Script for Codeforces with Persistent Mac SQLite Sync
 */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3344/api';

  // --- Hybrid Storage: Syncs with Mac SQLite Backend + Chrome Storage fallback ---
  const Storage = {
    async getAll() {
      // 1. Try Mac SQLite Database API first
      try {
        const res = await fetch(`${API_BASE}/problems`, { signal: AbortSignal.timeout(1200) });
        if (res.ok) {
          const data = await res.json();
          // Cache to chrome.storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ cfr_problems: data });
          } else {
            localStorage.setItem('cfr_problems', JSON.stringify(data));
          }
          return data;
        }
      } catch (e) {
        // Localhost server offline, fallback to cached Chrome storage
      }

      // 2. Fallback to Chrome storage / localStorage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['cfr_problems'], (res) => resolve(res.cfr_problems || {}));
        });
      }
      try {
        const item = localStorage.getItem('cfr_problems');
        return item ? JSON.parse(item) : {};
      } catch (e) {
        return {};
      }
    },

    async saveOne(problemRecord) {
      // 1. Send to persistent Mac SQLite DB
      let dbSaved = false;
      try {
        const res = await fetch(`${API_BASE}/problems`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(problemRecord),
          signal: AbortSignal.timeout(2000)
        });
        if (res.ok) dbSaved = true;
      } catch (e) {
        // server offline, saved locally
      }

      // 2. Cache locally in Chrome storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cfr_problems'], (res) => {
          const all = res.cfr_problems || {};
          all[problemRecord.id] = problemRecord;
          chrome.storage.local.set({ cfr_problems: all });
        });
      } else {
        try {
          const all = JSON.parse(localStorage.getItem('cfr_problems') || '{}');
          all[problemRecord.id] = problemRecord;
          localStorage.setItem('cfr_problems', JSON.stringify(all));
        } catch (e) {}
      }

      return dbSaved;
    }
  };

  // --- Problem URL Detection & Parsing ---
  function parseProblemUrl(pathname = window.location.pathname) {
    let match = pathname.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
    if (match) {
      return { contestId: match[1], index: match[2].toUpperCase(), id: `${match[1]}${match[2].toUpperCase()}` };
    }
    match = pathname.match(/\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (match) {
      return { contestId: match[1], index: match[2].toUpperCase(), id: `${match[1]}${match[2].toUpperCase()}` };
    }
    match = pathname.match(/\/gym\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (match) {
      return { contestId: match[1], index: match[2].toUpperCase(), id: `GYM${match[1]}${match[2].toUpperCase()}` };
    }
    return null;
  }

  function isProblemsetListPage() {
    return window.location.pathname.startsWith('/problemset') && !window.location.pathname.includes('/problem/');
  }

  function isSubmitPage() {
    return window.location.pathname.includes('/submit');
  }

  // --- Main Execution Flow ---
  const problemInfo = parseProblemUrl();
  if (problemInfo) {
    initProblemPage(problemInfo);
  } else if (isProblemsetListPage()) {
    initProblemsetPage();
  } else if (isSubmitPage()) {
    initSubmitPage();
  }

  function initSubmitPage() {
    const area = document.querySelector('#sourceCodeTextarea') || document.querySelector('textarea[name="source"]');
    if (!area) return;

    const banner = document.createElement('div');
    banner.style.cssText = 'background: linear-gradient(135deg, #4f46e5, #06b6d4); color:#fff; padding:10px 14px; border-radius:8px; margin-bottom:12px; font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:space-between; box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    banner.innerHTML = `
      <span>⚡ <b>CF Recall Helper</b>: Code from your Practice Arena Notepad is in your clipboard!</span>
      <button type="button" style="background:#fff; color:#4f46e5; border:none; padding:5px 12px; border-radius:6px; font-weight:700; cursor:pointer; font-size:11px;">📋 Paste Code Here</button>
    `;
    const btn = banner.querySelector('button');
    btn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          area.value = text;
          area.dispatchEvent(new Event('input', { bubbles: true }));
          area.dispatchEvent(new Event('change', { bubbles: true }));
          btn.innerText = '✓ Pasted!';
        }
      } catch (e) {
        area.focus();
      }
    };
    area.parentNode.insertBefore(banner, area);
  }

  // ============================================================================
  // PROBLEM PAGE LOGIC
  // ============================================================================
  async function initProblemPage(info) {
    const allData = await Storage.getAll();
    let problemRecord = allData[info.id] || {
      id: info.id,
      contestId: info.contestId,
      index: info.index,
      title: extractProblemTitle(),
      rating: extractRating(),
      tags: extractTags(),
      status: null, // 'solo' | 'hint' | 'solution' | 'progress'
      revisit: false,
      notes: '',
      timeSpentSec: 0,
      updatedAt: Date.now(),
      url: window.location.href
    };

    if (!problemRecord.title) problemRecord.title = extractProblemTitle();
    if (!problemRecord.rating) problemRecord.rating = extractRating();
    if (!problemRecord.tags || problemRecord.tags.length === 0) problemRecord.tags = extractTags();

    renderTitleBadge(problemRecord, () => toggleDock(true));
    renderFloatingDock(problemRecord, async (updated) => {
      problemRecord = updated;
      const dbSaved = await Storage.saveOne(problemRecord);
      renderTitleBadge(problemRecord, () => toggleDock(true));
      updateDockUI(problemRecord);
      showSaveToast(dbSaved);
    });
  }

  function extractProblemTitle() {
    const el = document.querySelector('.problem-statement .header .title');
    if (el) {
      return el.innerText.replace(/^[A-Z0-9]+\.\s*/, '').trim();
    }
    return document.title.split('-')[0].trim() || 'Codeforces Problem';
  }

  function extractRating() {
    const tagEls = document.querySelectorAll('.tag-box');
    for (const tag of tagEls) {
      const match = tag.innerText.match(/\*(\d{3,4})/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  function extractTags() {
    const tags = [];
    const tagEls = document.querySelectorAll('.tag-box');
    for (const tag of tagEls) {
      const text = tag.innerText.trim();
      if (!text.startsWith('*') && text.length > 0) {
        tags.push(text);
      }
    }
    return tags;
  }

  // --- Title Badge ---
  function renderTitleBadge(record, onClick) {
    let badge = document.getElementById('cfr-title-badge');
    if (!badge) {
      const titleEl = document.querySelector('.problem-statement .header .title');
      if (!titleEl) return;
      badge = document.createElement('span');
      badge.id = 'cfr-title-badge';
      titleEl.appendChild(badge);
    }

    badge.className = 'cfr-title-badge';
    badge.onclick = onClick;

    if (record.status === 'solo') {
      badge.className += ' cfr-badge-solo';
      badge.innerHTML = `🟢 Solved Solo ${record.revisit ? '⭐' : ''}`;
      badge.title = 'Saved in Mac Database as Solo Solve! Click to edit.';
    } else if (record.status === 'hint') {
      badge.className += ' cfr-badge-hint';
      badge.innerHTML = `🟡 Solved with Hint/Tutorial ${record.revisit ? '⭐' : ''}`;
      badge.title = 'Saved in Mac Database with Hint. Click to edit.';
    } else if (record.status === 'solution') {
      badge.className += ' cfr-badge-solution';
      badge.innerHTML = `🔴 Solution Upsolved ${record.revisit ? '⭐' : ''}`;
      badge.title = 'Saved in Mac Database. Click to edit.';
    } else if (record.status === 'progress') {
      badge.className += ' cfr-badge-progress';
      badge.innerHTML = `🟣 In Progress ${record.revisit ? '⭐' : ''}`;
      badge.title = 'Attempting problem. Click to edit.';
    } else {
      badge.className += ' cfr-badge-untracked';
      badge.innerHTML = `⚡ Track CF Recall`;
      badge.title = 'Click to record whether you solved solo or with tutorial!';
    }
  }

  // --- Floating Dock UI ---
  let timerInterval = null;
  let isTimerRunning = false;

  function renderFloatingDock(record, onSave) {
    let container = document.getElementById('cfr-dock-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'cfr-dock-container';

    container.innerHTML = `
      <div id="cfr-card-panel">
        <div class="cfr-header">
          <div class="cfr-title-row">
            <span class="cfr-logo-tag">CF Recall</span>
            <span class="cfr-problem-tag">${record.id}</span>
          </div>
          <button class="cfr-close-btn" id="cfr-close-panel" title="Minimize">✕</button>
        </div>

        <div>
          <div class="cfr-label" style="margin-bottom:6px;">How did you solve this?</div>
          <div class="cfr-status-grid">
            <button class="cfr-btn-status" data-status="solo">
              🟢 Solo (0 Hints)
            </button>
            <button class="cfr-btn-status" data-status="hint">
              🟡 Hint / Tutorial
            </button>
            <button class="cfr-btn-status" data-status="solution">
              🔴 Watched Solution
            </button>
            <button class="cfr-btn-status" data-status="progress">
              🟣 In Progress
            </button>
          </div>
        </div>

        <div class="cfr-tools-row">
          <button class="cfr-revisit-toggle ${record.revisit ? 'active' : ''}" id="cfr-revisit-btn">
            ${record.revisit ? '★ Revisit Later' : '☆ Mark for Revisit'}
          </button>
          <div class="cfr-timer-box">
            <span>⏱️</span>
            <span class="cfr-timer-display" id="cfr-timer-text">00:00</span>
            <button class="cfr-timer-btn" id="cfr-timer-toggle" title="Start/Pause">▶</button>
            <button class="cfr-timer-btn" id="cfr-timer-reset" title="Reset">↺</button>
          </div>
        </div>

        <div class="cfr-notes-group">
          <label class="cfr-label" for="cfr-notes-input">Key Takeaway / Mistakes / Algorithm:</label>
          <textarea id="cfr-notes-input" class="cfr-textarea" rows="3" placeholder="e.g. DP on trees, greedy with max-heap, overflow bug..."></textarea>
        </div>

        <div>
          <div class="cfr-label" style="margin-bottom: 4px;">Quick Tags:</div>
          <div class="cfr-tags-wrap" id="cfr-tags-container">
            ${['DP', 'Greedy', 'Binary Search', 'Graphs', 'Trees', 'Math', 'Data Structures', 'Two Pointers', 'Constructive', 'Bitmasks']
              .map(tag => `<span class="cfr-chip" data-tag="${tag}">${tag}</span>`)
              .join('')}
          </div>
        </div>

        <div class="cfr-footer">
          <span class="cfr-save-status" id="cfr-save-msg">✓ Saved in Database</span>
          <span class="cfr-dash-link" id="cfr-open-dash-btn">Open Dashboard ↗</span>
        </div>
      </div>

      <div id="cfr-toggle-btn">
        <span class="cfr-badge-icon" id="cfr-btn-icon">⚡</span>
        <span class="cfr-status-text" id="cfr-btn-label">Track CF Recall</span>
      </div>
    `;

    document.body.appendChild(container);

    const toggleBtn = container.querySelector('#cfr-toggle-btn');
    const closeBtn = container.querySelector('#cfr-close-panel');
    const notesInput = container.querySelector('#cfr-notes-input');
    const revisitBtn = container.querySelector('#cfr-revisit-btn');
    const statusBtns = container.querySelectorAll('.cfr-btn-status');
    const tagChips = container.querySelectorAll('.cfr-chip');
    const timerText = container.querySelector('#cfr-timer-text');
    const timerToggle = container.querySelector('#cfr-timer-toggle');
    const timerReset = container.querySelector('#cfr-timer-reset');
    const openDashBtn = container.querySelector('#cfr-open-dash-btn');

    notesInput.value = record.notes || '';
    updateTimerDisplay(record.timeSpentSec || 0, timerText);

    const activeTags = new Set(record.tags || []);
    tagChips.forEach(chip => {
      if (activeTags.has(chip.dataset.tag)) chip.classList.add('active');
    });

    updateDockUI(record);

    toggleBtn.onclick = () => toggleDock();
    closeBtn.onclick = () => toggleDock(false);

    // Status clicks
    statusBtns.forEach(btn => {
      btn.onclick = () => {
        const targetStatus = btn.dataset.status;
        record.status = (record.status === targetStatus) ? null : targetStatus;
        record.updatedAt = Date.now();
        onSave(record);
      };
    });

    // Revisit click
    revisitBtn.onclick = () => {
      record.revisit = !record.revisit;
      record.updatedAt = Date.now();
      onSave(record);
    };

    // Tag click
    tagChips.forEach(chip => {
      chip.onclick = () => {
        const tag = chip.dataset.tag;
        if (!record.tags) record.tags = [];
        const idx = record.tags.indexOf(tag);
        if (idx >= 0) {
          record.tags.splice(idx, 1);
          chip.classList.remove('active');
        } else {
          record.tags.push(tag);
          chip.classList.add('active');
        }
        record.updatedAt = Date.now();
        onSave(record);
      };
    });

    // Notes auto-save with debounce
    let notesTimeout = null;
    notesInput.oninput = () => {
      clearTimeout(notesTimeout);
      notesTimeout = setTimeout(() => {
        record.notes = notesInput.value;
        record.updatedAt = Date.now();
        onSave(record);
      }, 350);
    };

    // Timer logic
    timerToggle.onclick = () => {
      if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerToggle.innerText = '▶';
        onSave(record);
      } else {
        isTimerRunning = true;
        timerToggle.innerText = '⏸';
        timerInterval = setInterval(() => {
          record.timeSpentSec = (record.timeSpentSec || 0) + 1;
          updateTimerDisplay(record.timeSpentSec, timerText);
        }, 1000);
      }
    };

    timerReset.onclick = () => {
      if (confirm('Reset timer for this problem?')) {
        record.timeSpentSec = 0;
        updateTimerDisplay(0, timerText);
        onSave(record);
      }
    };

    // Open Dashboard (localhost)
    openDashBtn.onclick = () => {
      window.open('http://localhost:3344/cf-recall-dashboard/index.html', '_blank');
    };
  }

  function toggleDock(forceOpen = null) {
    const panel = document.getElementById('cfr-card-panel');
    if (!panel) return;
    if (forceOpen === true) panel.classList.add('cfr-show');
    else if (forceOpen === false) panel.classList.remove('cfr-show');
    else panel.classList.toggle('cfr-show');
  }

  function updateDockUI(record) {
    const panel = document.getElementById('cfr-card-panel');
    const toggleBtn = document.getElementById('cfr-toggle-btn');
    if (!panel || !toggleBtn) return;

    panel.querySelectorAll('.cfr-btn-status').forEach(btn => {
      if (btn.dataset.status === record.status) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    const revisitBtn = panel.querySelector('#cfr-revisit-btn');
    if (revisitBtn) {
      revisitBtn.className = `cfr-revisit-toggle ${record.revisit ? 'active' : ''}`;
      revisitBtn.innerText = record.revisit ? '★ Revisit Later' : '☆ Mark for Revisit';
    }

    const btnLabel = toggleBtn.querySelector('#cfr-btn-label');
    const btnIcon = toggleBtn.querySelector('#cfr-btn-icon');

    if (record.status === 'solo') {
      btnLabel.innerText = `Solo Solved ${record.revisit ? '⭐' : ''}`;
      btnLabel.style.color = '#10b981';
      btnIcon.innerText = '🟢';
    } else if (record.status === 'hint') {
      btnLabel.innerText = `With Tutorial ${record.revisit ? '⭐' : ''}`;
      btnLabel.style.color = '#f59e0b';
      btnIcon.innerText = '🟡';
    } else if (record.status === 'solution') {
      btnLabel.innerText = `Upsolved ${record.revisit ? '⭐' : ''}`;
      btnLabel.style.color = '#ef4444';
      btnIcon.innerText = '🔴';
    } else if (record.status === 'progress') {
      btnLabel.innerText = `In Progress ${record.revisit ? '⭐' : ''}`;
      btnLabel.style.color = '#8b5cf6';
      btnIcon.innerText = '🟣';
    } else {
      btnLabel.innerText = 'Track CF Recall';
      btnLabel.style.color = '#f8fafc';
      btnIcon.innerText = '⚡';
    }
  }

  function updateTimerDisplay(totalSeconds, textEl) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    textEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function showSaveToast(dbSaved = true) {
    const toast = document.getElementById('cfr-save-msg');
    if (!toast) return;
    toast.innerText = dbSaved ? '✓ Saved in Mac DB' : '✓ Saved locally';
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 1400);
  }

  // ============================================================================
  // PROBLEMSET LIST PAGE
  // ============================================================================
  async function initProblemsetPage() {
    const allData = await Storage.getAll();
    if (Object.keys(allData).length === 0) return;

    const rows = document.querySelectorAll('table.problems tr');
    rows.forEach(row => {
      const link = row.querySelector('a[href*="/problemset/problem/"]');
      if (!link) return;

      const parsed = parseProblemUrl(link.getAttribute('href'));
      if (!parsed) return;

      const record = allData[parsed.id];
      if (!record || !record.status) return;

      if (row.querySelector(`.cfr-table-pill[data-id="${parsed.id}"]`)) return;

      const pill = document.createElement('span');
      pill.className = `cfr-table-pill ${record.status}`;
      pill.dataset.id = parsed.id;

      if (record.status === 'solo') pill.innerHTML = `🟢 Solo`;
      else if (record.status === 'hint') pill.innerHTML = `🟡 Hint`;
      else if (record.status === 'solution') pill.innerHTML = `🔴 Solution`;
      else if (record.status === 'progress') pill.innerHTML = `🟣 Attempt`;

      if (record.revisit) {
        const revBadge = document.createElement('span');
        revBadge.className = 'cfr-table-pill revisit';
        revBadge.innerText = '⭐ Revise';
        pill.appendChild(revBadge);
      }

      if (record.notes) {
        pill.title = `Notes: ${record.notes}`;
      }

      link.parentNode.appendChild(pill);
    });
  }
})();
