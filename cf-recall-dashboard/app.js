/**
 * CF Recall - Web Dashboard Application Logic
 * Persistent Mac SQLite Backend (localhost:3344)
 * Featuring Practice Arena, In-App Problemset Explorer & 1-Click Submitter
 */

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://localhost:3344/api';

  // --- Backend API Service ---
  const Backend = {
    async isOnline() {
      try {
        const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
      } catch (e) {
        return false;
      }
    },

    async getSettings() {
      try {
        const res = await fetch(`${API_BASE}/settings`);
        if (res.ok) return await res.json();
      } catch (e) {}
      const saved = localStorage.getItem('cfr_settings');
      return saved ? JSON.parse(saved) : { handle: 'asp775', email: '', preferred_language: 'cpp20' };
    },

    async saveSettings(settingsObj) {
      try {
        const res = await fetch(`${API_BASE}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsObj)
        });
        if (res.ok) return await res.json();
      } catch (e) {}
      localStorage.setItem('cfr_settings', JSON.stringify(settingsObj));
      return { success: true };
    },

    async getProblems() {
      try {
        const res = await fetch(`${API_BASE}/problems`);
        if (res.ok) return await res.json();
      } catch (e) {}
      const saved = localStorage.getItem('cfr_problems');
      return saved ? JSON.parse(saved) : {};
    },

    async saveProblem(prob) {
      try {
        await fetch(`${API_BASE}/problems`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prob)
        });
      } catch (e) {}
      const local = JSON.parse(localStorage.getItem('cfr_problems') || '{}');
      local[prob.id] = prob;
      localStorage.setItem('cfr_problems', JSON.stringify(local));
    },

    async deleteProblem(id) {
      try {
        await fetch(`${API_BASE}/problems/${id}`, { method: 'DELETE' });
      } catch (e) {}
      const local = JSON.parse(localStorage.getItem('cfr_problems') || '{}');
      delete local[id];
      localStorage.setItem('cfr_problems', JSON.stringify(local));
    },

    async searchProblemset({ tags = '', minRating = null, maxRating = null, statusFilter = 'all', query = '' }) {
      const params = new URLSearchParams();
      if (tags) params.append('tags', tags);
      if (minRating) params.append('minRating', minRating);
      if (maxRating) params.append('maxRating', maxRating);
      if (statusFilter) params.append('statusFilter', statusFilter);
      if (query) params.append('q', query);

      const res = await fetch(`${API_BASE}/problemset?${params.toString()}`);
      if (res.ok) return await res.json();
      return { total: 0, problems: [] };
    },

    async getLatestSubmissions() {
      try {
        const res = await fetch(`${API_BASE}/submissions/latest`);
        if (res.ok) return await res.json();
      } catch (e) {}
      return [];
    },

    async syncCF(handle) {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle })
      });
      return await res.json();
    }
  };

  // --- App State ---
  let problems = {};
  let settings = { handle: 'asp775', email: '', preferred_language: 'cpp20' };
  let currentActiveTab = 'dashboard';
  let activeDashFilter = 'all';
  let activeModalProblemId = null;

  // Arena State
  let arenaState = {
    tag: '',
    minRating: 800,
    maxRating: 800,
    statusFilter: 'unsolved',
    keyword: '',
    selectedProblem: null,
    arenaStatusChoice: 'solo',
    pollInterval: null
  };

  // DOM Elements - Sidebar & Nav
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const globalSearch = document.getElementById('globalSearch');
  const navTotalCount = document.getElementById('navTotalCount');
  const navRevCount = document.getElementById('navRevCount');
  const navToArenaBtn = document.getElementById('navToArenaBtn');

  // User Card in Sidebar
  const cfUserCard = document.getElementById('cfUserCard');
  const cfUserAvatar = document.getElementById('cfUserAvatar');
  const cfUserHandle = document.getElementById('cfUserHandle');
  const cfUserRank = document.getElementById('cfUserRank');
  const cfUserEmailTag = document.getElementById('cfUserEmailTag');
  const syncNowBtn = document.getElementById('syncNowBtn');

  // Dashboard Metrics
  const metricTotal = document.getElementById('metricTotal');
  const metricSolo = document.getElementById('metricSolo');
  const metricHint = document.getElementById('metricHint');
  const metricSol = document.getElementById('metricSol');
  const metricSoloRate = document.getElementById('metricSoloRate');
  const ratioBarSolo = document.getElementById('ratioBarSolo');
  const ratioBarHint = document.getElementById('ratioBarHint');
  const ratioBarSol = document.getElementById('ratioBarSol');
  const legSoloPct = document.getElementById('legSoloPct');
  const legHintPct = document.getElementById('legHintPct');
  const legSolPct = document.getElementById('legSolPct');

  // Tables
  const dashboardTableBody = document.getElementById('dashboardTableBody');
  const allProblemsTableBody = document.getElementById('allProblemsTableBody');
  const problemsCardsWrap = document.getElementById('problemsCardsWrap');
  const problemsTableWrap = document.getElementById('problemsTableWrap');
  const revisionMiniList = document.getElementById('revisionMiniList');
  const revisionFullList = document.getElementById('revisionFullList');

  // Arena Elements
  const arenaTableBody = document.getElementById('arenaTableBody');
  const arenaResultsCount = document.getElementById('arenaResultsCount');
  const topicChips = document.querySelectorAll('#topicChips .chip-filter');
  const ratingChips = document.querySelectorAll('.rating-chips-row .rating-chip');
  const customMinRating = document.getElementById('customMinRating');
  const customMaxRating = document.getElementById('customMaxRating');
  const arenaKeywordInput = document.getElementById('arenaKeywordInput');
  const applyArenaFilterBtn = document.getElementById('applyArenaFilterBtn');
  const arenaStatusToggles = document.querySelectorAll('.status-toggle-btn');

  // Notepad Elements
  const notepadProblemTitle = document.getElementById('notepadProblemTitle');
  const notepadProblemCode = document.getElementById('notepadProblemCode');
  const selectedProbBar = document.getElementById('selectedProbBar');
  const barCode = document.getElementById('barCode');
  const barTitle = document.getElementById('barTitle');
  const barRating = document.getElementById('barRating');
  const barLink = document.getElementById('barLink');
  const notepadLanguageSelect = document.getElementById('notepadLanguageSelect');
  const notepadCodeArea = document.getElementById('notepadCodeArea');
  const pasteCodeBtn = document.getElementById('pasteCodeBtn');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const clearCodeBtn = document.getElementById('clearCodeBtn');
  const oneClickSubmitBtn = document.getElementById('oneClickSubmitBtn');
  const pollVerdictBtn = document.getElementById('pollVerdictBtn');
  const verdictBanner = document.getElementById('verdictBanner');
  const verdictIcon = document.getElementById('verdictIcon');
  const verdictMain = document.getElementById('verdictMain');
  const verdictSub = document.getElementById('verdictSub');
  const dismissVerdictBtn = document.getElementById('dismissVerdictBtn');
  const arenaClassButtons = document.querySelectorAll('.btn-mini-status');
  const notepadNotesInput = document.getElementById('notepadNotesInput');
  const notepadRevisitCheck = document.getElementById('notepadRevisitCheck');
  const saveToDbFromNotepadBtn = document.getElementById('saveToDbFromNotepadBtn');

  // Settings Elements
  const settingsHandleInput = document.getElementById('settingsHandleInput');
  const settingsEmailInput = document.getElementById('settingsEmailInput');
  const settingsLangSelect = document.getElementById('settingsLangSelect');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsStatusMsg = document.getElementById('settingsStatusMsg');

  // Modal Elements
  const modalBackdrop = document.getElementById('problemModalBackdrop');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCode = document.getElementById('modalCode');
  const modalTitle = document.getElementById('modalTitle');
  const modalNotesInput = document.getElementById('modalNotesInput');
  const modalRatingInput = document.getElementById('modalRatingInput');
  const modalTimeInput = document.getElementById('modalTimeInput');
  const modalTagsInput = document.getElementById('modalTagsInput');
  const modalRevisitCheck = document.getElementById('modalRevisitCheck');
  const modalSaveBtn = document.getElementById('modalSaveBtn');
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');
  const modalCfLink = document.getElementById('modalCfLink');
  const choiceBtns = document.querySelectorAll('.btn-choice');

  // View switches
  const viewTableBtn = document.getElementById('viewTableBtn');
  const viewCardsBtn = document.getElementById('viewCardsBtn');
  const filterStatusSelect = document.getElementById('filterStatusSelect');
  const filterRatingSelect = document.getElementById('filterRatingSelect');
  const filterTagSelect = document.getElementById('filterTagSelect');
  const addManualBtn = document.getElementById('addManualBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const dashboardFileInput = document.getElementById('dashboardFileInput');
  const viewAllRevisionBtn = document.getElementById('viewAllRevisionBtn');

  init();

  async function init() {
    // 1. Health check & DB Status indicator
    const online = await Backend.isOnline();
    renderDbStatusIndicator(online);

    // 2. Load settings (Handle + Email) from SQLite
    settings = await Backend.getSettings();
    applySettingsToUI();

    // 3. Load problems from SQLite
    problems = await Backend.getProblems();

    // 4. Setup listeners & render initial views
    setupEventListeners();
    renderAll();

    // 5. Pre-load Arena problems (e.g. 800 - 800)
    loadArenaProblems();
  }

  function renderDbStatusIndicator(isOnline) {
    let indicator = document.getElementById('dbStatusIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'dbStatusIndicator';
      indicator.style.cssText = 'padding: 8px 12px; margin-bottom: 12px; border-radius: 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 8px;';
      const sidebarNav = document.querySelector('.sidebar-nav');
      if (sidebarNav) sidebarNav.parentNode.insertBefore(indicator, sidebarNav);
    }
    if (isOnline) {
      indicator.style.background = 'rgba(16, 185, 129, 0.12)';
      indicator.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      indicator.style.color = '#34d399';
      indicator.innerHTML = `🟢 <b>Mac SQLite DB</b>: Connected (Port 3344)`;
    } else {
      indicator.style.background = 'rgba(239, 68, 68, 0.12)';
      indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      indicator.style.color = '#f87171';
      indicator.innerHTML = `⚠️ <b>Local Server</b>: Offline (Run ./manage.sh start)`;
    }
  }

  function applySettingsToUI() {
    const handle = settings.handle || 'asp775';
    cfUserCard.style.display = 'flex';
    cfUserHandle.innerText = handle;
    settingsHandleInput.value = handle;
    settingsEmailInput.value = settings.email || '';
    cfUserEmailTag.innerText = settings.email ? settings.email : 'No email set';

    if (settings.preferred_language) {
      settingsLangSelect.value = settings.preferred_language;
      notepadLanguageSelect.value = settings.preferred_language;
    }

    if (settings.profile) {
      cfUserAvatar.src = settings.profile.avatar || settings.profile.titlePhoto || 'https://userpic.codeforces.org/no-title.jpg';
      cfUserRank.innerText = settings.profile.rank || 'Student';
    } else {
      cfUserAvatar.src = 'https://userpic.codeforces.org/no-title.jpg';
      cfUserRank.innerText = 'Connected';
    }
  }

  function setupEventListeners() {
    // Navigation
    navItems.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    navToArenaBtn.addEventListener('click', () => switchTab('arena'));
    viewAllRevisionBtn.addEventListener('click', () => switchTab('revision'));

    // Sidebar Collapse / Expand Toggle Logic
    const appLayout = document.querySelector('.app-layout');
    const toggleSidebarTopBtn = document.getElementById('toggleSidebarTopBtn');
    const collapseSidebarBtn = document.getElementById('collapseSidebarBtn');

    function setSidebarState(collapsed) {
      if (!appLayout) return;
      if (collapsed) {
        appLayout.classList.add('sidebar-collapsed');
        localStorage.setItem('cfr_sidebar_collapsed', 'true');
        if (toggleSidebarTopBtn) {
          toggleSidebarTopBtn.classList.remove('active');
          toggleSidebarTopBtn.title = 'Open Left Tab Bar (Ctrl+B)';
        }
      } else {
        appLayout.classList.remove('sidebar-collapsed');
        localStorage.setItem('cfr_sidebar_collapsed', 'false');
        if (toggleSidebarTopBtn) {
          toggleSidebarTopBtn.classList.add('active');
          toggleSidebarTopBtn.title = 'Close Left Tab Bar (Ctrl+B)';
        }
      }
    }

    if (toggleSidebarTopBtn) {
      toggleSidebarTopBtn.addEventListener('click', () => {
        const isCollapsed = appLayout.classList.contains('sidebar-collapsed');
        setSidebarState(!isCollapsed);
      });
    }

    if (collapseSidebarBtn) {
      collapseSidebarBtn.addEventListener('click', () => {
        setSidebarState(true);
      });
    }

    // Keyboard shortcut: Ctrl+B or Cmd+B toggles sidebar
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        const isCollapsed = appLayout.classList.contains('sidebar-collapsed');
        setSidebarState(!isCollapsed);
      }
    });

    // Restore saved state
    if (localStorage.getItem('cfr_sidebar_collapsed') === 'true') {
      setSidebarState(true);
    }

    // Dashboard filter pills
    document.querySelectorAll('.pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeDashFilter = pill.dataset.dashFilter;
        renderDashboardTable();
      });
    });

    // Global Search
    globalSearch.addEventListener('input', () => {
      renderDashboardTable();
      renderAllProblemsView();
    });

    // ========================================================================
    // ARENA LISTENERS
    // ========================================================================
    // Topic Chips
    topicChips.forEach(chip => {
      chip.addEventListener('click', () => {
        topicChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        arenaState.tag = chip.dataset.tag;
        loadArenaProblems();
      });
    });

    // Rating Chips
    ratingChips.forEach(chip => {
      chip.addEventListener('click', () => {
        ratingChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const min = parseInt(chip.dataset.min, 10);
        const max = parseInt(chip.dataset.max, 10);
        arenaState.minRating = min;
        arenaState.maxRating = max;
        customMinRating.value = min;
        customMaxRating.value = max;
        loadArenaProblems();
      });
    });

    // Status Toggle (Unsolved Only, All, Solved)
    arenaStatusToggles.forEach(btn => {
      btn.addEventListener('click', () => {
        arenaStatusToggles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        arenaState.statusFilter = btn.dataset.arenaStatus;
        loadArenaProblems();
      });
    });

    // Search button & Custom Inputs
    applyArenaFilterBtn.addEventListener('click', () => {
      ratingChips.forEach(c => c.classList.remove('active'));
      arenaState.minRating = customMinRating.value ? parseInt(customMinRating.value, 10) : null;
      arenaState.maxRating = customMaxRating.value ? parseInt(customMaxRating.value, 10) : null;
      arenaState.keyword = arenaKeywordInput.value.trim();
      loadArenaProblems();
    });

    arenaKeywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyArenaFilterBtn.click();
    });

    // ========================================================================
    // NOTEPAD & SUBMITTER LISTENERS
    // ========================================================================
    // Paste Code
    pasteCodeBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          notepadCodeArea.value = text;
          showToast('✓ Code pasted into Notepad!');
        }
      } catch (err) {
        notepadCodeArea.focus();
        showToast('Tip: Press Cmd+V / Ctrl+V to paste');
      }
    });

    // Copy Code
    copyCodeBtn.addEventListener('click', () => {
      const code = notepadCodeArea.value;
      if (!code.trim()) return alert('Notepad is empty.');
      navigator.clipboard.writeText(code);
      showToast('✓ Code copied to clipboard!');
    });

    // Clear Code
    clearCodeBtn.addEventListener('click', () => {
      if (confirm('Clear code in Notepad?')) {
        notepadCodeArea.value = '';
      }
    });

    // 1-Click Submit to Codeforces
    oneClickSubmitBtn.addEventListener('click', () => {
      const code = notepadCodeArea.value.trim();
      if (!code) {
        return alert('Please paste your solution code in the notepad first.');
      }
      if (!arenaState.selectedProblem) {
        return alert('Please select a problem from the explorer list first.');
      }

      // 1. Copy code to clipboard automatically
      navigator.clipboard.writeText(code);

      const p = arenaState.selectedProblem;
      const submitUrl = `https://codeforces.com/contest/${p.contestId}/submit?submittedProblemIndex=${p.index}`;

      // 2. Open Codeforces submit page in new tab
      window.open(submitUrl, '_blank');

      // 3. Show live verdict watcher banner
      startVerdictPolling(p);
    });

    // Manual Poll Verdict Button
    pollVerdictBtn.addEventListener('click', () => {
      if (arenaState.selectedProblem) {
        checkVerdictOnce(arenaState.selectedProblem);
      } else {
        checkVerdictOnce(null);
      }
    });

    dismissVerdictBtn.addEventListener('click', () => {
      verdictBanner.style.display = 'none';
      if (arenaState.pollInterval) clearInterval(arenaState.pollInterval);
    });

    // Notepad Recall Classification Buttons (Solo, Hint, Solution)
    arenaClassButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        arenaClassButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        arenaState.arenaStatusChoice = btn.dataset.arenaClass;
      });
    });

    // Save to DB from Notepad
    saveToDbFromNotepadBtn.addEventListener('click', async () => {
      if (!arenaState.selectedProblem) {
        return alert('Please select a problem first.');
      }
      const p = arenaState.selectedProblem;
      const record = {
        id: p.id,
        contestId: p.contestId,
        index: p.index,
        title: p.name || p.title,
        rating: p.rating,
        tags: p.tags || [],
        status: arenaState.arenaStatusChoice,
        revisit: notepadRevisitCheck.checked,
        notes: notepadNotesInput.value.trim(),
        timeSpentSec: 0,
        updatedAt: Date.now(),
        url: p.url
      };

      await Backend.saveProblem(record);
      problems[p.id] = record;
      renderAll();
      loadArenaProblems(); // refresh table statuses
      showToast(`✓ Problem ${p.id} saved in Mac SQLite database!`);
    });

    // ========================================================================
    // SETTINGS LISTENERS
    // ========================================================================
    saveSettingsBtn.addEventListener('click', async () => {
      const handle = settingsHandleInput.value.trim();
      const email = settingsEmailInput.value.trim();
      const prefLang = settingsLangSelect.value;

      if (!handle) return alert('Handle cannot be empty');

      settingsStatusMsg.style.display = 'block';
      settingsStatusMsg.className = 'sync-status-box';
      settingsStatusMsg.innerText = 'Saving settings in Mac SQLite database...';

      const res = await Backend.saveSettings({
        handle,
        email,
        preferred_language: prefLang
      });

      if (res.success) {
        settings.handle = handle;
        settings.email = email;
        settings.preferred_language = prefLang;
        applySettingsToUI();
        settingsStatusMsg.className = 'sync-status-box success';
        settingsStatusMsg.innerHTML = `✓ Settings saved! Connected Handle: <b>${handle}</b>, Email: <b>${email || 'None'}</b>`;
      }
    });

    syncNowBtn.addEventListener('click', async () => {
      const handle = settings.handle || 'asp775';
      syncNowBtn.innerText = '⏳ Syncing...';
      const syncRes = await Backend.syncCF(handle);
      syncNowBtn.innerText = '⚡ Sync Solves from Codeforces';
      if (syncRes.success) {
        problems = await Backend.getProblems();
        renderAll();
        alert(`Synced ${syncRes.total_solved_on_cf} solves for ${handle} (${syncRes.newly_added} new solves stored in SQLite)!`);
      } else {
        alert(syncRes.error || 'Failed to sync with Codeforces');
      }
    });

    // Dropdown filters in All Problems tab
    filterStatusSelect.addEventListener('change', renderAllProblemsView);
    filterRatingSelect.addEventListener('change', renderAllProblemsView);
    filterTagSelect.addEventListener('change', renderAllProblemsView);

    // View toggle
    viewTableBtn.addEventListener('click', () => {
      viewTableBtn.classList.add('active');
      viewCardsBtn.classList.remove('active');
      problemsTableWrap.style.display = 'block';
      problemsCardsWrap.style.display = 'none';
    });
    viewCardsBtn.addEventListener('click', () => {
      viewCardsBtn.classList.add('active');
      viewTableBtn.classList.remove('active');
      problemsTableWrap.style.display = 'none';
      problemsCardsWrap.style.display = 'grid';
    });

    // Modal Events
    modalCloseBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    choiceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        choiceBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    modalSaveBtn.addEventListener('click', saveModalData);
    modalDeleteBtn.addEventListener('click', deleteProblemRecord);

    addManualBtn.addEventListener('click', () => {
      const code = prompt('Enter Codeforces Problem ID (e.g. 1800C2 or 1791D):');
      if (code) openProblemModal(code.trim().toUpperCase());
    });

    // Export JSON
    exportJsonBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(problems, null, 2));
      const dl = document.createElement('a');
      dl.setAttribute('href', dataStr);
      dl.setAttribute('download', `cf_recall_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(dl);
      dl.click();
      dl.remove();
    });

    // Import JSON
    importJsonBtn.addEventListener('click', () => dashboardFileInput.click());
    dashboardFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (typeof parsed === 'object') {
            for (const id in parsed) {
              await Backend.saveProblem(parsed[id]);
            }
            problems = await Backend.getProblems();
            renderAll();
            alert(`Imported ${Object.keys(parsed).length} problems into SQLite database!`);
          }
        } catch (err) {
          alert('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    });
  }

  function switchTab(tabId) {
    currentActiveTab = tabId;
    navItems.forEach(item => {
      if (item.dataset.tab === tabId) item.classList.add('active');
      else item.classList.remove('active');
    });
    tabPanes.forEach(pane => {
      if (pane.id === `pane-${tabId}`) pane.classList.add('active');
      else pane.classList.remove('active');
    });
  }

  // ==========================================================================
  // ARENA LOGIC: FETCH & RENDER CODEFORCES PROBLEMS
  // ==========================================================================
  async function loadArenaProblems() {
    arenaResultsCount.innerText = 'Fetching Codeforces problems...';
    arenaTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">Loading Codeforces problemset...</td></tr>`;

    const res = await Backend.searchProblemset({
      tags: arenaState.tag,
      minRating: arenaState.minRating,
      maxRating: arenaState.maxRating,
      statusFilter: arenaState.statusFilter,
      query: arenaState.keyword
    });

    const list = res.problems || [];
    arenaResultsCount.innerText = `Found ${list.length} problems matching filters`;

    if (list.length === 0) {
      arenaTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:40px; color:var(--text-dim);">
            No problems found with Topic="${arenaState.tag || 'All'}", Rating=${arenaState.minRating}-${arenaState.maxRating}.
            <br><span style="font-size:11px;">Try adjusting the rating range or status filter.</span>
          </td>
        </tr>
      `;
      return;
    }

    arenaTableBody.innerHTML = '';
    list.forEach(p => {
      const tr = document.createElement('tr');
      let statusBadge = '';
      if (p.userStatus === 'solo') statusBadge = `<span class="status-pill solo">🟢 Solo</span>`;
      else if (p.userStatus === 'hint') statusBadge = `<span class="status-pill hint">🟡 Tutorial</span>`;
      else if (p.userStatus === 'solution') statusBadge = `<span class="status-pill solution">🔴 Solution</span>`;
      else statusBadge = `<span class="status-pill untracked">⚪ Unsolved</span>`;

      tr.innerHTML = `
        <td><span class="badge-code">${p.id}</span></td>
        <td>
          <div style="font-weight:600; color:#fff;">${escapeHtml(p.name)}</div>
          <div style="font-size:10px; color:var(--text-dim);">${(p.tags || []).slice(0, 3).join(', ')}</div>
        </td>
        <td><span class="rating-tag">${p.rating ? '★' + p.rating : '-'}</span></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn-sm btn-primary" data-action="select" data-id="${p.id}">
            ⚡ Solve in Notepad
          </button>
        </td>
      `;

      tr.querySelector('[data-action="select"]').addEventListener('click', () => {
        selectProblemForNotepad(p);
      });

      arenaTableBody.appendChild(tr);
    });

    // Auto-select first problem if none selected
    if (!arenaState.selectedProblem && list.length > 0) {
      selectProblemForNotepad(list[0]);
    }
  }

  function selectProblemForNotepad(p) {
    arenaState.selectedProblem = p;
    notepadProblemTitle.innerText = p.name;
    notepadProblemCode.innerText = `${p.id} • Rating ★${p.rating || 'Unrated'}`;

    selectedProbBar.style.display = 'flex';
    barCode.innerText = p.id;
    barTitle.innerText = p.name;
    barRating.innerText = p.rating ? `★${p.rating}` : '';
    barLink.href = p.url;

    // Pre-fill notes if already tracked
    if (p.notes) notepadNotesInput.value = p.notes;
    else notepadNotesInput.value = '';

    notepadRevisitCheck.checked = !!p.revisit;

    // Highlight class
    arenaClassButtons.forEach(btn => {
      if (btn.dataset.arenaClass === (p.userStatus !== 'unsolved' ? p.userStatus : 'solo')) {
        btn.classList.add('active');
        arenaState.arenaStatusChoice = btn.dataset.arenaClass;
      } else {
        btn.classList.remove('active');
      }
    });

    showToast(`Loaded ${p.id} into Code Notepad!`);
  }

  // ==========================================================================
  // LIVE VERDICT POLLING LOGIC
  // ==========================================================================
  function startVerdictPolling(problem) {
    if (arenaState.pollInterval) clearInterval(arenaState.pollInterval);

    verdictBanner.style.display = 'flex';
    verdictBanner.className = 'verdict-banner';
    verdictIcon.innerText = '⏳';
    verdictMain.innerText = `Watching Codeforces for submission on ${problem.id}...`;
    verdictSub.innerText = `Connected handle: ${settings.handle} • Checking every 2.5s`;

    let attempts = 0;
    arenaState.pollInterval = setInterval(async () => {
      attempts++;
      if (attempts > 18) { // 45 seconds timeout
        clearInterval(arenaState.pollInterval);
        verdictIcon.innerText = 'ℹ️';
        verdictMain.innerText = `Polling finished for ${problem.id}.`;
        verdictSub.innerText = `Click 'Check Verdict' to refresh manually.`;
        return;
      }

      const subs = await Backend.getLatestSubmissions();
      if (!subs || !subs.length) return;

      // Find matching submission
      const match = subs.find(s => s.problemId === problem.id);
      if (match) {
        if (match.verdict === 'OK') {
          clearInterval(arenaState.pollInterval);
          verdictBanner.className = 'verdict-banner ok';
          verdictIcon.innerText = '🎉';
          verdictMain.innerText = `ACCEPTED on Codeforces! (Submission #${match.id})`;
          verdictSub.innerText = `Automatically saving ${problem.id} as Solo Solve into your Mac SQLite database!`;

          // Auto save to DB!
          const record = {
            id: problem.id,
            contestId: problem.contestId,
            index: problem.index,
            title: problem.name,
            rating: problem.rating,
            tags: problem.tags || [],
            status: 'solo',
            revisit: false,
            notes: notepadNotesInput.value.trim() || 'Solved independently on Codeforces',
            timeSpentSec: 0,
            updatedAt: Date.now(),
            url: problem.url
          };
          await Backend.saveProblem(record);
          problems[problem.id] = record;
          renderAll();
          loadArenaProblems();
        } else if (match.verdict === 'WRONG_ANSWER') {
          verdictBanner.className = 'verdict-banner wa';
          verdictIcon.innerText = '❌';
          verdictMain.innerText = `Wrong Answer on test ${match.passedCount + 1}`;
          verdictSub.innerText = `Submission #${match.id} failed. Review edge cases and retry!`;
        } else if (match.verdict === 'COMPILATION_ERROR') {
          verdictBanner.className = 'verdict-banner wa';
          verdictIcon.innerText = '⚠️';
          verdictMain.innerText = `Compilation Error`;
          verdictSub.innerText = `Submission #${match.id}. Check language dialect & includes.`;
        } else {
          verdictIcon.innerText = '⏳';
          verdictMain.innerText = `Status: ${match.verdict} (Testing on test ${match.passedCount + 1})...`;
        }
      }
    }, 2500);
  }

  async function checkVerdictOnce(problem) {
    const subs = await Backend.getLatestSubmissions();
    if (!subs || !subs.length) {
      return alert('No recent submissions found for ' + settings.handle);
    }
    const latest = problem ? (subs.find(s => s.problemId === problem.id) || subs[0]) : subs[0];

    verdictBanner.style.display = 'flex';
    if (latest.verdict === 'OK') {
      verdictBanner.className = 'verdict-banner ok';
      verdictIcon.innerText = '🎉';
      verdictMain.innerText = `ACCEPTED! ${latest.problemId} (${latest.problemName})`;
      verdictSub.innerText = `Verdict OK • Language: ${latest.programmingLanguage}`;
    } else {
      verdictBanner.className = 'verdict-banner wa';
      verdictIcon.innerText = '⚠️';
      verdictMain.innerText = `${latest.verdict} on ${latest.problemId}`;
      verdictSub.innerText = `Passed tests: ${latest.passedCount} • Language: ${latest.programmingLanguage}`;
    }
  }

  // ==========================================================================
  // DASHBOARD RENDERING
  // ==========================================================================
  function renderAll() {
    renderMetrics();
    renderDashboardTable();
    renderAllProblemsView();
    renderRevisionQueue();
  }

  function renderMetrics() {
    const list = Object.values(problems);
    let solo = 0, hint = 0, sol = 0, revisit = 0;

    const buckets = {
      1200: { total: 0, solo: 0 },
      1500: { total: 0, solo: 0 },
      1800: { total: 0, solo: 0 },
      1900: { total: 0, solo: 0 }
    };

    list.forEach(p => {
      if (p.status === 'solo') solo++;
      else if (p.status === 'hint') hint++;
      else if (p.status === 'solution') sol++;
      if (p.revisit) revisit++;

      const r = p.rating || 0;
      let bKey = 1200;
      if (r > 1800) bKey = 1900;
      else if (r > 1500) bKey = 1800;
      else if (r > 1200) bKey = 1500;

      buckets[bKey].total++;
      if (p.status === 'solo') buckets[bKey].solo++;
    });

    const total = list.length;
    metricTotal.innerText = total;
    metricSolo.innerText = solo;
    metricHint.innerText = hint;
    metricSol.innerText = sol;

    const soloRate = total > 0 ? Math.round((solo / total) * 100) : 0;
    const hintRate = total > 0 ? Math.round((hint / total) * 100) : 0;
    const solRate = total > 0 ? Math.round((sol / total) * 100) : 0;

    metricSoloRate.innerText = `${soloRate}% Mastery Rate`;
    navTotalCount.innerText = total;
    navRevCount.innerText = revisit;

    ratioBarSolo.style.width = `${soloRate}%`;
    ratioBarHint.style.width = `${hintRate}%`;
    ratioBarSol.style.width = `${solRate}%`;

    legSoloPct.innerText = `${soloRate}%`;
    legHintPct.innerText = `${hintRate}%`;
    legSolPct.innerText = `${solRate}%`;

    Object.keys(buckets).forEach(key => {
      const b = buckets[key];
      const pct = b.total > 0 ? Math.round((b.solo / b.total) * 100) : 0;
      const fillEl = document.getElementById(`bucketFill${key}`);
      const valEl = document.getElementById(`bucketVal${key}`);
      if (fillEl && valEl) {
        fillEl.style.width = `${pct}%`;
        valEl.innerText = `${b.solo}/${b.total}`;
      }
    });
  }

  function renderDashboardTable() {
    let items = Object.values(problems);
    const query = globalSearch.value.toLowerCase().trim();

    if (activeDashFilter === 'solo') items = items.filter(p => p.status === 'solo');
    else if (activeDashFilter === 'hint') items = items.filter(p => p.status === 'hint');
    else if (activeDashFilter === 'solution') items = items.filter(p => p.status === 'solution');
    else if (activeDashFilter === 'revisit') items = items.filter(p => p.revisit);

    if (query) items = items.filter(p => matchQuery(p, query));

    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    dashboardTableBody.innerHTML = '';
    if (items.length === 0) {
      dashboardTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 32px;">No problems matching current filter.</td></tr>`;
      return;
    }

    items.slice(0, 10).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a href="${p.url || '#'}" target="_blank" class="badge-code">${p.id}</a></td>
        <td><div class="problem-title-cell" title="${escapeHtml(p.title || '')}">${escapeHtml(p.title || 'Codeforces Problem')}</div></td>
        <td><span class="rating-tag">${p.rating ? '★' + p.rating : '-'}</span></td>
        <td>${getStatusPill(p.status, p.revisit)}</td>
        <td><div class="table-notes-preview" title="${escapeHtml(p.notes || '')}">${p.notes ? escapeHtml(p.notes) : '<span style="color:var(--text-dim)">No notes</span>'}</div></td>
        <td><div class="table-tags">${(p.tags || []).slice(0, 3).map(t => `<span class="chip-subtle">${escapeHtml(t)}</span>`).join('')}</div></td>
        <td><button class="btn-sm btn-ghost" data-action="edit" data-id="${p.id}">Edit</button></td>
      `;
      tr.querySelector('[data-action="edit"]').onclick = () => openProblemModal(p.id);
      dashboardTableBody.appendChild(tr);
    });
  }

  function renderAllProblemsView() {
    let items = Object.values(problems);
    const query = globalSearch.value.toLowerCase().trim();
    const statusVal = filterStatusSelect.value;
    const ratingVal = filterRatingSelect.value;
    const tagVal = filterTagSelect.value;

    if (statusVal !== 'all') {
      if (statusVal === 'revisit') items = items.filter(p => p.revisit);
      else items = items.filter(p => p.status === statusVal);
    }

    if (ratingVal !== 'all') {
      const [minR, maxR] = ratingVal.split('-').map(Number);
      items = items.filter(p => {
        const r = p.rating || 0;
        return r >= minR && r <= maxR;
      });
    }

    if (tagVal !== 'all') {
      items = items.filter(p => (p.tags || []).some(t => t.toLowerCase().includes(tagVal)));
    }

    if (query) items = items.filter(p => matchQuery(p, query));

    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    allProblemsTableBody.innerHTML = '';
    if (items.length === 0) {
      allProblemsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">No problems match criteria.</td></tr>`;
    } else {
      items.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><a href="${p.url || '#'}" target="_blank" class="badge-code">${p.id}</a></td>
          <td><div class="problem-title-cell" title="${escapeHtml(p.title || '')}">${escapeHtml(p.title || 'Codeforces Problem')}</div></td>
          <td><span class="rating-tag">${p.rating ? '★' + p.rating : '-'}</span></td>
          <td>${getStatusPill(p.status, p.revisit)}</td>
          <td><div class="table-notes-preview" title="${escapeHtml(p.notes || '')}">${p.notes ? escapeHtml(p.notes) : '<span style="color:var(--text-dim)">No notes</span>'}</div></td>
          <td><div class="table-tags">${(p.tags || []).slice(0, 3).map(t => `<span class="chip-subtle">${escapeHtml(t)}</span>`).join('')}</div></td>
          <td><button class="btn-sm btn-ghost" data-id="${p.id}">Edit</button></td>
        `;
        tr.querySelector('button').onclick = () => openProblemModal(p.id);
        allProblemsTableBody.appendChild(tr);
      });
    }

    problemsCardsWrap.innerHTML = '';
    items.forEach(p => {
      const card = document.createElement('div');
      card.className = 'problem-card-item';
      card.innerHTML = `
        <div class="card-top">
          <span class="badge-code">${p.id}</span>
          ${getStatusPill(p.status, p.revisit)}
        </div>
        <div class="card-title">${escapeHtml(p.title || 'Codeforces Problem')}</div>
        <div class="card-notes">${p.notes ? escapeHtml(p.notes) : 'No notes added.'}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">
          <span class="rating-tag">${p.rating ? '★ ' + p.rating : 'Unrated'}</span>
          <span style="color:var(--text-dim);">${formatDaysAgo(p.updatedAt)}</span>
        </div>
      `;
      card.onclick = () => openProblemModal(p.id);
      problemsCardsWrap.appendChild(card);
    });
  }

  function renderRevisionQueue() {
    const revisitItems = Object.values(problems).filter(p => p.revisit);
    revisitItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    revisionMiniList.innerHTML = '';
    if (revisitItems.length === 0) {
      revisionMiniList.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-dim); font-size:12px;">No problems in revision queue.</div>`;
    } else {
      revisitItems.slice(0, 4).forEach(p => {
        const item = document.createElement('div');
        item.className = 'rev-mini-item';
        item.innerHTML = `
          <div class="rev-mini-left">
            <span class="rev-code">${p.id}</span>
            <span class="rev-name">${escapeHtml(p.title || 'Problem')}</span>
          </div>
          <span class="rev-days-ago">${formatDaysAgo(p.updatedAt)}</span>
        `;
        item.onclick = () => openProblemModal(p.id);
        revisionMiniList.appendChild(item);
      });
    }

    revisionFullList.innerHTML = '';
    if (revisitItems.length === 0) {
      revisionFullList.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:48px; color:var(--text-dim);">🎉 All revisions completed! Whenever you need hints on a problem, check "⭐ Revisit" to schedule it here.</div>`;
    } else {
      revisitItems.forEach(p => {
        const card = document.createElement('div');
        card.className = 'revision-card';
        card.innerHTML = `
          <div class="rev-header">
            <span class="badge-code">${p.id}</span>
            <span class="rev-due-badge">Due for Re-Solve</span>
          </div>
          <h4 style="font-size:15px;">${escapeHtml(p.title || 'Codeforces Problem')}</h4>
          <p style="font-size:12px; color:var(--text-muted); font-style:italic;">"${escapeHtml(p.notes || 'No notes')}"</p>
          <div style="font-size:11px; color:var(--text-dim);">Last practiced: ${formatDaysAgo(p.updatedAt)}</div>
          <div class="rev-actions">
            <a href="${p.url || `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`}" target="_blank" class="btn-sm btn-ghost" style="flex:1;">Open on CF ↗</a>
            <button class="btn-sm btn-primary" data-mark-solo="${p.id}" style="flex:1;">Mark Solo Solved ✓</button>
          </div>
        `;
        card.querySelector(`[data-mark-solo="${p.id}"]`).onclick = async (e) => {
          e.stopPropagation();
          p.status = 'solo';
          p.revisit = false;
          p.updatedAt = Date.now();
          await Backend.saveProblem(p);
          renderAll();
        };
        revisionFullList.appendChild(card);
      });
    }
  }

  // ==========================================================================
  // MODAL LOGIC
  // ==========================================================================
  function openProblemModal(id) {
    activeModalProblemId = id;
    let p = problems[id];
    if (!p) {
      const match = id.match(/^(\d+)([A-Za-z0-9]+)$/);
      p = {
        id: id,
        contestId: match ? match[1] : '',
        index: match ? match[2] : '',
        title: `Codeforces Problem ${id}`,
        rating: null,
        status: 'solo',
        revisit: false,
        notes: '',
        tags: [],
        timeSpentSec: 0,
        updatedAt: Date.now(),
        url: match ? `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}` : '#'
      };
    }

    modalCode.innerText = p.id;
    modalTitle.innerText = p.title || `Problem ${p.id}`;
    modalNotesInput.value = p.notes || '';
    modalRatingInput.value = p.rating || '';
    modalTimeInput.value = p.timeSpentSec ? Math.round(p.timeSpentSec / 60) : '';
    modalTagsInput.value = (p.tags || []).join(', ');
    modalRevisitCheck.checked = !!p.revisit;
    modalCfLink.href = p.url || `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;

    choiceBtns.forEach(btn => {
      if (btn.dataset.choice === p.status) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    modalBackdrop.classList.add('show');
  }

  function closeModal() {
    modalBackdrop.classList.remove('show');
    activeModalProblemId = null;
  }

  async function saveModalData() {
    if (!activeModalProblemId) return;
    let p = problems[activeModalProblemId] || { id: activeModalProblemId };

    const activeChoiceBtn = document.querySelector('.btn-choice.active');
    p.status = activeChoiceBtn ? activeChoiceBtn.dataset.choice : null;
    p.notes = modalNotesInput.value.trim();
    p.rating = modalRatingInput.value ? parseInt(modalRatingInput.value, 10) : null;
    const mins = modalTimeInput.value ? parseInt(modalTimeInput.value, 10) : 0;
    p.timeSpentSec = mins * 60;
    p.tags = modalTagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    p.revisit = modalRevisitCheck.checked;
    p.updatedAt = Date.now();

    if (!p.url && p.contestId && p.index) {
      p.url = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
    }

    await Backend.saveProblem(p);
    problems[activeModalProblemId] = p;
    closeModal();
    renderAll();
  }

  async function deleteProblemRecord() {
    if (!activeModalProblemId) return;
    if (confirm(`Delete ${activeModalProblemId} from Mac SQLite database?`)) {
      await Backend.deleteProblem(activeModalProblemId);
      delete problems[activeModalProblemId];
      closeModal();
      renderAll();
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  function matchQuery(p, q) {
    const id = (p.id || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    const notes = (p.notes || '').toLowerCase();
    const tags = (p.tags || []).map(t => t.toLowerCase()).join(' ');
    return id.includes(q) || title.includes(q) || notes.includes(q) || tags.includes(q);
  }

  function getStatusPill(status, revisit) {
    const star = revisit ? '<span class="revisit-star">⭐</span>' : '';
    if (status === 'solo') return `<span class="status-pill solo">🟢 Solo ${star}</span>`;
    if (status === 'hint') return `<span class="status-pill hint">🟡 Tutorial ${star}</span>`;
    if (status === 'solution') return `<span class="status-pill solution">🔴 Solution ${star}</span>`;
    if (status === 'progress') return `<span class="status-pill progress">🟣 In Progress ${star}</span>`;
    return `<span class="status-pill untracked">Untracked</span>`;
  }

  function formatDaysAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const diffDays = Math.floor((Date.now() - timestamp) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function showToast(msg) {
    let toast = document.getElementById('appGlobalToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appGlobalToast';
      toast.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.95); border:1px solid #6366f1; color:#fff; padding:10px 20px; border-radius:9999px; font-size:12px; font-weight:700; z-index:999999; box-shadow:0 8px 24px rgba(0,0,0,0.5); backdrop-filter:blur(8px); transition:opacity 0.2s; pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }
});
