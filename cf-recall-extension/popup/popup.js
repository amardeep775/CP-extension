/**
 * CF Recall - Extension Popup Logic
 * Synced with persistent Mac SQLite Database on localhost:3344
 */

document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE = 'http://localhost:3344/api';

  const countSoloEl = document.getElementById('countSolo');
  const countHintEl = document.getElementById('countHint');
  const countSolEl = document.getElementById('countSol');
  const countRevisitEl = document.getElementById('countRevisit');
  const totalCountEl = document.getElementById('totalCount');
  const searchInput = document.getElementById('searchInput');
  const problemsListEl = document.getElementById('problemsList');
  const listTitleEl = document.getElementById('listTitle');
  const statCards = document.querySelectorAll('.stat-card');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const openDashboardTopBtn = document.getElementById('openDashboardTopBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFileInput = document.getElementById('importFileInput');

  let activeFilter = null;
  let allProblems = {};

  // Check backend server connection
  async function checkServerStatus() {
    try {
      const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {}
    return null;
  }

  // Load problems from Mac SQLite API or fallback to Chrome storage
  async function loadData() {
    try {
      const res = await fetch(`${API_BASE}/problems`, { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        const data = await res.json();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ cfr_problems: data });
        }
        return data;
      }
    } catch (e) {}

    // Fallback
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['cfr_problems'], (res) => resolve(res.cfr_problems || {}));
      });
    }
    try {
      const saved = localStorage.getItem('cfr_problems');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  const serverInfo = await checkServerStatus();
  renderServerStatusPill(serverInfo);

  allProblems = await loadData();
  refreshUI();

  function renderServerStatusPill(info) {
    let pill = document.getElementById('popupServerPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'popupServerPill';
      pill.style.cssText = 'font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;';
      const statsGrid = document.querySelector('.stats-grid');
      if (statsGrid) statsGrid.parentNode.insertBefore(pill, statsGrid);
    }
    if (info) {
      pill.style.background = 'rgba(16, 185, 129, 0.12)';
      pill.style.color = '#34d399';
      pill.style.border = '1px solid rgba(16, 185, 129, 0.25)';
      const handleText = info.connected_handle ? `• ${info.connected_handle}` : '';
      pill.innerHTML = `<span>🟢 Mac SQLite DB Active ${handleText}</span><span>:${info.port}</span>`;
    } else {
      pill.style.background = 'rgba(239, 68, 68, 0.12)';
      pill.style.color = '#f87171';
      pill.style.border = '1px solid rgba(239, 68, 68, 0.25)';
      pill.innerHTML = `<span>⚠️ Mac Server Offline (Cached Mode)</span>`;
    }
  }

  function refreshUI() {
    const list = Object.values(allProblems);
    let solo = 0, hint = 0, sol = 0, rev = 0;
    list.forEach(p => {
      if (p.status === 'solo') solo++;
      if (p.status === 'hint') hint++;
      if (p.status === 'solution') sol++;
      if (p.revisit) rev++;
    });

    countSoloEl.innerText = solo;
    countHintEl.innerText = hint;
    countSolEl.innerText = sol;
    countRevisitEl.innerText = rev;
    totalCountEl.innerText = list.length;

    renderList();
  }

  function renderList() {
    const query = searchInput.value.toLowerCase().trim();
    let items = Object.values(allProblems);

    if (activeFilter === 'solo') items = items.filter(p => p.status === 'solo');
    else if (activeFilter === 'hint') items = items.filter(p => p.status === 'hint');
    else if (activeFilter === 'solution') items = items.filter(p => p.status === 'solution');
    else if (activeFilter === 'revisit') items = items.filter(p => p.revisit);

    if (query) {
      items = items.filter(p => {
        const idMatch = (p.id || '').toLowerCase().includes(query);
        const titleMatch = (p.title || '').toLowerCase().includes(query);
        const notesMatch = (p.notes || '').toLowerCase().includes(query);
        const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(query));
        return idMatch || titleMatch || notesMatch || tagMatch;
      });
    }

    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (items.length === 0) {
      problemsListEl.innerHTML = `
        <div class="empty-state">
          <p>No matching problems found.</p>
          <p class="sub">${query || activeFilter ? 'Try clearing search filters.' : 'Mark problems on Codeforces to track!'}</p>
        </div>
      `;
      return;
    }

    problemsListEl.innerHTML = '';
    items.forEach(p => {
      const row = document.createElement('div');
      row.className = 'problem-item';

      let statusBadge = '';
      if (p.status === 'solo') statusBadge = `<span class="problem-status-chip chip-solo">🟢 Solo</span>`;
      else if (p.status === 'hint') statusBadge = `<span class="problem-status-chip chip-hint">🟡 Tutorial</span>`;
      else if (p.status === 'solution') statusBadge = `<span class="problem-status-chip chip-solution">🔴 Solution</span>`;
      else if (p.status === 'progress') statusBadge = `<span class="problem-status-chip chip-progress">🟣 Progress</span>`;

      row.innerHTML = `
        <div class="problem-top-row">
          <div class="problem-code-name">
            <span class="code-badge">${p.id}</span>
            <span class="problem-title-text" title="${p.title || ''}">${p.title || 'Problem ' + p.id}</span>
          </div>
          ${statusBadge}
        </div>
        ${p.notes ? `<div class="problem-notes-preview">"${escapeHtml(p.notes)}"</div>` : ''}
        <div class="problem-bottom-tags">
          ${p.rating ? `<span class="tag-rating">★${p.rating}</span>` : ''}
          ${p.revisit ? `<span class="tag-revisit-star">⭐ Revisit</span>` : ''}
          ${(p.tags || []).slice(0, 2).map(t => `<span>• ${escapeHtml(t)}</span>`).join('')}
        </div>
      `;

      row.onclick = () => {
        const url = p.url || `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
        window.open(url, '_blank');
      };

      problemsListEl.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  statCards.forEach(card => {
    card.onclick = () => {
      const filter = card.dataset.filter;
      if (activeFilter === filter) {
        activeFilter = null;
        card.classList.remove('active');
        listTitleEl.innerText = 'Recent Problems';
      } else {
        statCards.forEach(c => c.classList.remove('active'));
        activeFilter = filter;
        card.classList.add('active');
        listTitleEl.innerText = `${card.querySelector('.stat-lbl').innerText} Filter`;
      }
      renderList();
    };
  });

  searchInput.oninput = () => renderList();

  function openDashboard() {
    window.open('http://localhost:3344/cf-recall-dashboard/index.html', '_blank');
  }

  openDashboardBtn.onclick = openDashboard;
  openDashboardTopBtn.onclick = openDashboard;

  exportBtn.onclick = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allProblems, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `cf_recall_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  importBtn.onclick = () => importFileInput.click();

  importFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === 'object' && imported !== null) {
          for (const k in imported) {
            await fetch(`${API_BASE}/problems`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(imported[k])
            });
          }
          allProblems = await loadData();
          refreshUI();
          alert(`Successfully imported ${Object.keys(imported).length} problems into Mac database!`);
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };
});
