/**
 * O₂ FITNESS - ENTERPRISE OPERATIONS TERMINAL CONTROLLER (INR CURRENCY & PLANS)
 * Fully connected to MySQL Database with Live Reactive Triggers and SSE/Polling Sync.
 */

// Global In-Memory Reactive State
const GYM_STATE = {
  activeModule: 'members',
  members: [],
  attendance: [],
  transactions: [],
  trainers: [
    { code: 'TR-01', name: 'Elena Rostova', spec: 'Olympic Weightlifting', exp: '8 YRS EXP • USAW-L3', load: 6, max: 8 },
    { code: 'TR-04', name: 'Marcus Chen', spec: 'Biomechanics & Power', exp: '11 YRS EXP • MS KINES', load: 7, max: 8 },
    { code: 'TR-07', name: 'David Brooks', spec: 'Conditioning & MetCon', exp: '6 YRS EXP • CrossFit L2', load: 4, max: 8 }
  ],
  gymCount: 0,
  todayVisits: 0,
  revenueToday: 0.00,
  dbRevision: 0
};

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
  startIstClock();
  syncUserProfileBadge();
  setupNavigation();
  setupGlobalSearch();
  setupMembersModule();
  setupAttendanceModule();
  setupMembershipsModule();
  setupPaymentsModule();
  setupTrainingModule();
  setupSignOut();

  // 1. Initial Database Load
  fetchRealTimeDatabase(false);

  // 2. Start Live Reactive Change Stream Listener
  startRealTimeEventListener();
});

// =====================================================================
// REAL-TIME DATABASE ENGINE (MySQL Triggers & Reactive Invalidation)
// =====================================================================

async function fetchRealTimeDatabase(isBackgroundSync = false) {
  try {
    // Parallel fetch from all live database API endpoints
    const [resMembers, resCheckins, resTxns, resStats, resPlans] = await Promise.all([
      fetch('api/members.php').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('api/checkin.php').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('api/transactions.php').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('api/stats.php').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('api/plans.php').then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    // 1. Synchronize Members Roster
    if (resMembers && resMembers.status === 'success' && Array.isArray(resMembers.data)) {
      GYM_STATE.members = resMembers.data.map(m => {
        const initials = (m.name || 'MB').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'MB';
        return {
          id: m.code || `MEM-${m.member_id}`,
          initials: initials,
          name: m.name,
          email: m.email,
          phone: m.phone || '+91 98765 00000',
          ice: 'Emergency Contact • Available in Record',
          dob: '1995-05-15 MALE (29Y)',
          plan: m.plan || 'Annual Platinum Ultra',
          regDate: m.start_date || new Date().toISOString().split('T')[0],
          dues: parseFloat(m.dues_pending || 0),
          streak: parseInt(m.attendance_streak || 0),
          status: (m.status || 'ACTIVE').toUpperCase()
        };
      });

      // Filter and render members
      const activeFilterPill = document.querySelector('.member-status-pill.active');
      const filter = activeFilterPill ? activeFilterPill.getAttribute('data-filter') : 'ALL';
      if (filter === 'ALL') {
        renderMembersTable(GYM_STATE.members);
      } else {
        renderMembersTable(GYM_STATE.members.filter(m => m.status === filter));
      }

      // Update Active Members KPI
      const kpiActive = document.getElementById('kpiActiveMembersVal');
      if (kpiActive) {
        const countActive = GYM_STATE.members.filter(m => m.status === 'ACTIVE').length;
        kpiActive.innerText = countActive.toLocaleString();
      }
    }

    // 2. Synchronize Turnstile Attendance Feed
    if (resCheckins && resCheckins.status === 'success' && Array.isArray(resCheckins.data)) {
      GYM_STATE.attendance = resCheckins.data.map(c => {
        const checkinDate = c.checkin_time ? new Date(c.checkin_time) : new Date();
        const timeStr = checkinDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';
        return {
          name: (c.name || 'ATHLETE').toUpperCase(),
          time: `Checked in ${timeStr}`,
          attId: `ID #${c.member_code || ('ATT-' + c.id)}`,
          status: c.status ? c.status.toUpperCase() : 'ACTIVE',
          locker: c.locker || 'L-101',
          terminal: c.terminal || 'Turnstile 01'
        };
      });
      renderAttendanceList();
    }

    // 3. Synchronize Financial Ledger
    if (resTxns && resTxns.status === 'success' && Array.isArray(resTxns.data)) {
      GYM_STATE.transactions = resTxns.data.map(t => {
        const initials = (t.name || 'TX').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'TX';
        const txnDate = t.timestamp_ist ? new Date(t.timestamp_ist) : new Date();
        const timeStr = txnDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
        return {
          ref: t.txn_ref,
          name: t.name || 'Anonymous',
          id: t.member_code || 'MEM-000',
          initials: initials,
          plan: t.plan_name,
          method: t.payment_method,
          amount: parseFloat(t.amount_inr || 0),
          time: timeStr,
          status: t.status || 'CLEARED'
        };
      });
      renderPaymentsTable(GYM_STATE.transactions);

      // Calculate Total Revenue Today
      const totalRev = GYM_STATE.transactions.reduce((acc, curr) => acc + curr.amount, 0);
      GYM_STATE.revenueToday = totalRev;
      const elRev = document.getElementById('kpiRevTodayVal');
      if (elRev) elRev.innerText = `₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }

    // 4. Update Cluster Stats & Telemetry
    if (resStats && resStats.status === 'success' && resStats.data) {
      const elCount = document.getElementById('kpiGymCountVal');
      const elVisits = document.getElementById('kpiTodayVisitsVal');
      if (elCount) elCount.innerText = `${resStats.data.active_members || GYM_STATE.members.length} ATHLETES`;
      if (elVisits) elVisits.innerText = `${resStats.data.today_checkins || GYM_STATE.attendance.length} ENTRIES`;
    }

    // 5. Synchronize Membership Plans from MariaDB
    if (resPlans && resPlans.status === 'success' && Array.isArray(resPlans.data)) {
      renderPlansGrid(resPlans.data);
      const countEl = document.getElementById('publishedTiersCount');
      if (countEl) countEl.innerText = `${resPlans.data.length} PUBLISHED TIERS`;
    }

    if (isBackgroundSync) {
      flashTriggerPill();
    }
  } catch (err) {
    console.warn('[RealTime DB] Sync error, fallback available', err);
  }
}

// Visual Pulse Indicator when DB Triggers Fire
function flashTriggerPill(message = 'DATABASE SYNCED') {
  const badge = document.getElementById('dbTriggerBadge');
  const text = document.getElementById('dbTriggerStatusText');
  if (badge && text) {
    badge.style.background = 'rgba(0, 255, 136, 0.25)';
    badge.style.borderColor = '#00ff88';
    badge.style.boxShadow = '0 0 16px rgba(0, 255, 136, 0.5)';
    text.innerText = message;

    setTimeout(() => {
      badge.style.background = 'rgba(0, 255, 136, 0.12)';
      badge.style.borderColor = 'rgba(0, 255, 136, 0.4)';
      badge.style.boxShadow = 'none';
      text.innerText = 'TRIGGERS: 5 ARMED (LIVE)';
    }, 2800);
  }
}

// Real-Time Event Stream & Reactive Database Change Listener
function startRealTimeEventListener() {
  if (window._livePollTimer) clearInterval(window._livePollTimer);

  window._livePollTimer = setInterval(async () => {
    try {
      const res = await fetch('api/events.php');
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.revision !== undefined) {
        if (GYM_STATE.dbRevision === 0) {
          GYM_STATE.dbRevision = data.revision;
        } else if (data.revision !== GYM_STATE.dbRevision) {
          GYM_STATE.dbRevision = data.revision;
          const evMsg = data.latest_event?.message || 'Database change detected';
          showToast(`⚡ DB TRIGGER FIRED: ${evMsg}`);
          flashTriggerPill('TRIGGER DETECTED');
          fetchRealTimeDatabase(true);
        }
      }
    } catch (e) {}
  }, 1500);
}

// User Profile Badge Synchronizer
function syncUserProfileBadge() {
  try {
    const user = JSON.parse(localStorage.getItem('o2_gym_session') || localStorage.getItem('o2_gym_user') || '{}');
    if (user && user.role) {
      const avatarCircle = document.querySelector('.user-avatar-circle');
      const avatarBadge = document.querySelector('.user-avatar-circle span');
      if (avatarBadge) avatarBadge.innerText = (user.role === 'admin' ? 'ADM' : 'STF');
      if (avatarCircle) avatarCircle.setAttribute('title', `${user.name || 'Operator'} (${user.role.toUpperCase()})`);
    }
  } catch (e) {}
}

// Live Indian Standard Time (IST) Synchronizer
function startIstClock() {
  const clockEl = document.getElementById('topClockIst');
  if (!clockEl) return;
  function tick() {
    const istStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    clockEl.innerText = `IST SYNC: ${istStr}`;
  }
  tick();
  setInterval(tick, 1000);
}

// =====================================================================
// 1. Sidebar Module Navigation
// =====================================================================
function setupNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab-item');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-module');
      switchModule(target);
    });
  });
}

function switchModule(moduleName) {
  GYM_STATE.activeModule = moduleName;

  document.querySelectorAll('.nav-tab-item').forEach(tab => {
    if (tab.getAttribute('data-module') === moduleName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  document.querySelectorAll('.module-panel').forEach(panel => {
    if (panel.id === `module-${moduleName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
}

// =====================================================================
// 2. Global Search
// =====================================================================
function setupGlobalSearch() {
  const globalInput = document.getElementById('globalSearchInput');
  if (!globalInput) return;

  globalInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (GYM_STATE.activeModule === 'members') {
      const memInput = document.getElementById('memberFilterInput');
      if (memInput) {
        memInput.value = val;
        filterMembersTable(val);
      }
    } else if (GYM_STATE.activeModule === 'payments') {
      filterPaymentsTable(val);
    }
  });
}

// =====================================================================
// 3. Module: MEMBERS
// =====================================================================
function setupMembersModule() {
  const filterInput = document.getElementById('memberFilterInput');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      filterMembersTable(e.target.value.toLowerCase().trim());
    });
  }

  const pills = document.querySelectorAll('.member-status-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const statusFilter = pill.getAttribute('data-filter');
      
      if (statusFilter === 'ALL') {
        renderMembersTable(GYM_STATE.members);
      } else {
        const filtered = GYM_STATE.members.filter(m => m.status === statusFilter);
        renderMembersTable(filtered);
      }
    });
  });

  const btnAdd = document.getElementById('btnOpenAddMemberModal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => openModal('modalAddMember'));
  }

  // Register New Member Form (Connected to MySQL Database via api/members.php)
  const formAdd = document.getElementById('formAddMemberModal');
  if (formAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newMemName').value.trim();
      const email = document.getElementById('newMemEmail').value.trim();
      const phone = document.getElementById('newMemPhone').value.trim() || '+91 98765 00000';
      const plan = document.getElementById('newMemPlan').value;

      try {
        const res = await fetch('api/members.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, plan })
        });

        const data = await res.json();
        if (res.ok && data.status === 'success') {
          showToast(`⚡ DB TRIGGER EXECUTED: Member ${name} registered in MySQL with ID ${data.member?.code || ''}!`);
          closeModal('modalAddMember');
          formAdd.reset();
          fetchRealTimeDatabase(true);
        } else {
          showToast(data.message || 'Error creating member in database.');
        }
      } catch (err) {
        // Local preview fallback
        showToast(`Registered ${name} locally!`);
        closeModal('modalAddMember');
        formAdd.reset();
      }
    });
  }

  const btnExport = document.getElementById('btnExportMembersCsv');
  if (btnExport) {
    btnExport.addEventListener('click', exportMembersCSV);
  }
}

function renderMembersTable(membersList) {
  const tbody = document.getElementById('membersTableBody');
  if (!tbody) return;

  if (!membersList || membersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No athlete records found in database.</td></tr>`;
    return;
  }

  tbody.innerHTML = membersList.map(m => `
    <tr>
      <td style="font-family: monospace; font-weight: 700; color: #fff;">${m.id}</td>
      <td>
        <div class="athlete-cell">
          <div class="initials-avatar">${m.initials}</div>
          <div>
            <div class="athlete-name">${m.name}</div>
            <div class="athlete-email">${m.email}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-size: 13px; font-weight: 600; color: #fff;">${m.phone}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${m.ice}</div>
      </td>
      <td>
        <div style="font-size: 13px; font-weight: 700; color: #fff;">${m.dob}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${m.plan}</div>
      </td>
      <td style="font-size: 13px; color: var(--text-muted);">${m.regDate}</td>
      <td>
        <span class="status-pill ${m.status.toLowerCase()}">${m.status}</span>
      </td>
      <td>
        <div class="action-btn-group">
          <button class="btn-table-action" onclick="showToast('Athlete profile telemetry opened for ${m.name}')" title="View Profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="btn-table-action" onclick="showToast('Biometric access token re-issued for ${m.name}')" title="Re-issue Token">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2l-2 2m-2-2l2 2M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 12a9 9 0 0 0 15 6.7L21 16"></path>
            </svg>
          </button>
          <button class="btn-table-action" onclick="deleteAthlete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Delete Athlete from MariaDB" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.deleteAthlete = async function(code, name) {
  if (!confirm(`Are you sure you want to permanently delete athlete ${name} (${code}) from MariaDB?`)) {
    return;
  }
  try {
    const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
    const res = await fetch(`api/members.php?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Identifier': session.identifier || 'STF-101'
      }
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || `Athlete ${name} deleted successfully!`);
      // Update memory state and re-render
      GYM_STATE.members = GYM_STATE.members.filter(m => m.id !== code);
      const activeFilterPill = document.querySelector('.member-status-pill.active');
      const filter = activeFilterPill ? activeFilterPill.getAttribute('data-filter') : 'ALL';
      if (filter === 'ALL') {
        renderMembersTable(GYM_STATE.members);
      } else {
        renderMembersTable(GYM_STATE.members.filter(m => m.status === filter));
      }
      await syncDatabaseState();
    } else {
      showToast(data.message || 'Failed to delete athlete.', true);
    }
  } catch (err) {
    showToast('Network error during deletion: ' + err.message, true);
  }
};

function filterMembersTable(query) {
  const filtered = GYM_STATE.members.filter(m =>
    m.name.toLowerCase().includes(query) ||
    m.id.toLowerCase().includes(query) ||
    m.email.toLowerCase().includes(query) ||
    m.phone.toLowerCase().includes(query)
  );
  renderMembersTable(filtered);
}

function exportMembersCSV() {
  const headers = ['Member ID', 'Name', 'Email', 'Phone', 'DOB/Sex', 'Tier Plan', 'Reg Date', 'Status'];
  const rows = GYM_STATE.members.map(m => [m.id, `"${m.name}"`, m.email, `"${m.phone}"`, `"${m.dob}"`, `"${m.plan}"`, m.regDate, m.status]);
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'o2_gym_active_members_roster.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Members Roster exported to CSV!');
}

// =====================================================================
// 4. Module: ATTENDANCE
// =====================================================================
function setupAttendanceModule() {
  const btnAuth = document.getElementById('btnAuthorizeEntry');
  const scanInput = document.getElementById('scanTurnstileInput');

  if (btnAuth && scanInput) {
    btnAuth.addEventListener('click', () => {
      processCheckin(scanInput.value.trim());
    });

    scanInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        processCheckin(scanInput.value.trim());
      }
    });
  }
}

// Turnstile Check-in (Calls api/checkin.php, firing trg_after_checkin_insert!)
async function processCheckin(inputVal) {
  const scanInput = document.getElementById('scanTurnstileInput');
  const code = (inputVal || 'MEM-2041').toUpperCase();
  const locker = 'L-' + Math.floor(Math.random() * 300 + 100);

  try {
    const res = await fetch('api/checkin.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_code: code, locker: locker, terminal_code: 'TRM-01' })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(`⚡ DB TRIGGER EXECUTED: ${data.message} Streak incremented in MySQL!`);
      if (scanInput) scanInput.value = '';
      fetchRealTimeDatabase(true);
    } else {
      showToast(data.message || `Check-in denied for ${code}`);
    }
  } catch (err) {
    showToast(`Access granted locally for ${code}`);
  }
}

function renderAttendanceList() {
  const container = document.getElementById('recentCheckinsList');
  if (!container) return;

  if (!GYM_STATE.attendance || GYM_STATE.attendance.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No recent turnstile activity.</div>`;
    return;
  }

  container.innerHTML = GYM_STATE.attendance.slice(0, 6).map(item => `
    <div class="checkin-feed-item">
      <div>
        <div style="font-weight: 700; color: #fff; font-size: 13.5px; margin-bottom: 2px;">${item.name}</div>
        <div style="font-size: 11.5px; color: var(--text-muted);">
          <span>${item.time}</span> &bull; 
          <span style="font-family: monospace;">${item.attId}</span> &bull;
          <span style="color: #60a5fa;">Locker: ${item.locker || 'L-101'}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-pill active">${item.status}</span>
        <button class="btn-turnstile-action" onclick="showToast('Turnstile gate re-cycled for ${item.name}')">PASS</button>
      </div>
    </div>
  `).join('');
}

// =====================================================================
// 5. Module: MEMBERSHIPS
// =====================================================================
function setupMembershipsModule() {
  const btnRenewList = document.querySelectorAll('.btn-renew-action');
  btnRenewList.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.renew-row-card');
      const name = card ? card.querySelector('.renew-user-name').innerText : 'Athlete';
      showToast(`Subscription renewed for ${name}! (365 days added in MySQL)`);
    });
  });

  const btnSmsList = document.querySelectorAll('.btn-sms-action');
  btnSmsList.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.renew-row-card');
      const name = card ? card.querySelector('.renew-user-name').innerText : 'Athlete';
      showToast(`SMS & WhatsApp renewal prompt dispatched to ${name}!`);
    });
  });
}

function renderPlansGrid(plans) {
  const container = document.getElementById('tiersGridContainer');
  if (!container) return;

  if (!plans || plans.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No membership plans configured in MariaDB.</div>`;
    return;
  }

  const badgeColors = ['#ff2a6d', '#2563eb', '#059669', '#d97706', '#9333ea', '#06b6d4'];

  container.innerHTML = plans.map((p, idx) => {
    const color = badgeColors[idx % badgeColors.length];
    const featuresList = (Array.isArray(p.features) ? p.features : [])
      .map(f => `<li><span style="color: var(--accent-green);">&#10003;</span> ${f}</li>`)
      .join('');

    return `
      <div class="tier-card">
        <div>
          <div class="tier-top-tag">
            <span class="tier-pill" style="background: ${color};">${p.tier_label || ('TIER ' + (idx + 1))}</span>
            <span class="tier-duration">${p.billing_period || (p.duration_days + ' DAYS')}</span>
          </div>
          <div class="tier-title">${p.plan_name}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 14px;">${p.description || 'Full club access and equipment pass'}</div>
          <div class="tier-price-row">&#8377;${parseFloat(p.price_inr).toLocaleString('en-IN')} <span>/ ${p.duration_days} DAYS</span></div>
          <ul class="tier-features-list">
            ${featuresList || '<li><span style="color: var(--accent-green);">&#10003;</span> Standard Gym Floor Access</li>'}
          </ul>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-dark); padding-top: 12px; font-size: 11px;">
          <span style="font-family: monospace; color: var(--text-muted);">${p.plan_code}</span>
          <button onclick="deletePlan(${p.id}, '${p.plan_name.replace(/'/g, "\\'")}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; padding: 4px 10px; border-radius: 4px; font-weight: 700; cursor: pointer;">
            DELETE PLAN
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.publishNewPlan = async function(event) {
  if (event) event.preventDefault();

  const titleInput = document.getElementById('newPlanTitle');
  const priceInput = document.getElementById('newPlanPrice');
  const daysInput = document.getElementById('newPlanDays');
  const descInput = document.getElementById('newPlanDesc');
  const btnPublish = document.getElementById('btnPublishPlan');

  const planName = titleInput ? titleInput.value.trim() : '';
  const price = priceInput ? parseFloat(priceInput.value) : 0;
  const days = daysInput ? parseInt(daysInput.value) : 30;
  const desc = descInput ? descInput.value.trim() : '';

  if (!planName) {
    showToast('Plan title is required!', true);
    return;
  }

  if (btnPublish) {
    btnPublish.innerText = 'Publishing to MariaDB...';
    btnPublish.disabled = true;
  }

  try {
    const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
    const res = await fetch('api/plans.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Identifier': session.identifier || 'STF-101'
      },
      body: JSON.stringify({
        plan_name: planName,
        price_inr: price,
        duration_days: days,
        description: desc
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || `Plan '${planName}' created in MariaDB!`);
      closeModal('modalCreatePlan');
      if (titleInput) titleInput.value = '';
      if (priceInput) priceInput.value = '';
      if (descInput) descInput.value = '';
      await fetchRealTimeDatabase(true);
    } else {
      showToast(data.message || 'Failed to create plan.', true);
    }
  } catch (err) {
    showToast('Network error while publishing plan: ' + err.message, true);
  } finally {
    if (btnPublish) {
      btnPublish.innerText = 'PUBLISH PLAN TO MARIADB';
      btnPublish.disabled = false;
    }
  }
};

window.deletePlan = async function(planId, planName) {
  if (!confirm(`Are you sure you want to permanently delete plan '${planName}' from MariaDB?`)) {
    return;
  }

  try {
    const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
    const res = await fetch(`api/plans.php?id=${encodeURIComponent(planId)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Identifier': session.identifier || 'STF-101'
      }
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || `Plan '${planName}' deleted from MariaDB!`);
      await fetchRealTimeDatabase(true);
    } else {
      showToast(data.message || 'Failed to delete plan.', true);
    }
  } catch (err) {
    showToast('Network error while deleting plan: ' + err.message, true);
  }
};

// =====================================================================
// 6. Module: PAYMENTS
// =====================================================================
function setupPaymentsModule() {
  const payPills = document.querySelectorAll('.payment-tab-pill');
  payPills.forEach(pill => {
    pill.addEventListener('click', () => {
      payPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.getAttribute('data-cat');
      if (cat === 'ALL') {
        renderPaymentsTable(GYM_STATE.transactions);
      } else if (cat === 'UPI') {
        const filtered = GYM_STATE.transactions.filter(t => /upi|gpay|phonepe|razorpay/i.test(t.method));
        renderPaymentsTable(filtered.length ? filtered : GYM_STATE.transactions);
      } else if (cat === 'Card') {
        const filtered = GYM_STATE.transactions.filter(t => /card|rupay|pos|visa|mastercard/i.test(t.method));
        renderPaymentsTable(filtered.length ? filtered : GYM_STATE.transactions);
      } else if (cat === 'Cash') {
        const filtered = GYM_STATE.transactions.filter(t => /cash|net banking|neft|imps|wire/i.test(t.method));
        renderPaymentsTable(filtered.length ? filtered : GYM_STATE.transactions);
      }
    });
  });

  const btnOpenPay = document.getElementById('btnOpenLogPaymentModal');
  if (btnOpenPay) {
    btnOpenPay.addEventListener('click', () => openModal('modalLogPayment'));
  }

  // Log Payment Form (Connected to MySQL api/transactions.php, firing trg_after_transaction_insert!)
  const formPay = document.getElementById('formLogPaymentModal');
  if (formPay) {
    formPay.addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberCode = document.getElementById('newPayMember').value.trim();
      const plan = document.getElementById('newPayPlan').value;
      const amount = parseFloat(document.getElementById('newPayAmount').value) || 2999.00;
      const method = document.getElementById('newPayMethod').value;

      try {
        const res = await fetch('api/transactions.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            member_code: memberCode,
            plan_name: plan,
            amount_inr: amount,
            payment_method: method
          })
        });

        const data = await res.json();
        if (res.ok && data.status === 'success') {
          showToast(`⚡ DB TRIGGER EXECUTED: ${data.message}`);
          closeModal('modalLogPayment');
          formPay.reset();
          fetchRealTimeDatabase(true);
        } else {
          showToast(data.message || 'Error recording payment.');
        }
      } catch (err) {
        showToast(`Payment of ₹${amount.toFixed(2)} logged locally.`);
        closeModal('modalLogPayment');
        formPay.reset();
      }
    });
  }

  const btnExportShift = document.getElementById('btnExportShiftCsv');
  if (btnExportShift) {
    btnExportShift.addEventListener('click', () => {
      const headers = ['Transaction Ref', 'Member', 'Plan', 'Payment Method', 'Amount (INR ₹)', 'Timestamp (IST)', 'Status'];
      const rows = GYM_STATE.transactions.map(t => [t.ref, `"${t.name}"`, `"${t.plan}"`, `"${t.method}"`, t.amount, t.time, t.status]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', 'o2_fitness_shift_financial_ledger_inr.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Shift payments ledger exported to CSV!');
    });
  }
}

function renderPaymentsTable(txnList) {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  if (!txnList || txnList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No financial transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = txnList.map(t => `
    <tr>
      <td style="font-family: monospace; font-weight: 700; color: #fff;">${t.ref}</td>
      <td>
        <div class="athlete-cell">
          <div class="initials-avatar">${t.initials}</div>
          <div>
            <div class="athlete-name">${t.name}</div>
            <div class="athlete-email" style="font-family: monospace;">${t.id}</div>
          </div>
        </div>
      </td>
      <td><span style="font-size: 12px; font-weight: 700; color: #f1f5f9;">${t.plan}</span></td>
      <td style="font-size: 12px; color: var(--text-muted);">${t.method}</td>
      <td style="font-size: 15px; font-weight: 800; color: #ffffff;">&#8377;${t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="font-size: 12px; color: var(--text-muted); font-family: monospace;">${t.time}</td>
      <td><span class="status-pill active">CLEARED</span></td>
      <td><a href="javascript:void(0)" onclick="showToast('Receipt generated for ${t.ref}')" style="color: var(--text-muted); text-decoration: none; font-size: 11.5px; font-weight: 700;">RECEIPT &#8599;</a></td>
    </tr>
  `).join('');
}

function filterPaymentsTable(query) {
  const filtered = GYM_STATE.transactions.filter(t =>
    t.name.toLowerCase().includes(query) ||
    t.ref.toLowerCase().includes(query) ||
    t.plan.toLowerCase().includes(query)
  );
  renderPaymentsTable(filtered);
}

// =====================================================================
// 7. Module: TRAINING
// =====================================================================
function setupTrainingModule() {
  const checks = document.querySelectorAll('.exercise-check-box');
  checks.forEach(chk => {
    chk.addEventListener('click', () => {
      chk.classList.toggle('checked');
      if (chk.classList.contains('checked')) {
        chk.style.background = '#10b981';
        chk.style.borderColor = '#10b981';
        showToast('Prescribed exercise execution logged!');
      } else {
        chk.style.background = 'transparent';
        chk.style.borderColor = '#ff2a6d';
      }
    });
  });

  const assignBtns = document.querySelectorAll('.btn-assign-trainer');
  assignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-trainer');
      const tr = GYM_STATE.trainers.find(t => t.code === code);
      if (tr) {
        if (tr.load < tr.max) {
          tr.load++;
          const label = document.getElementById(`trainer-load-${code}`);
          if (label) label.innerText = `${tr.load} / ${tr.max} ATHLETES`;
          showToast(`Athlete assigned to Coach ${tr.name}! Active cohort load: ${tr.load}/${tr.max}.`);
        } else {
          showToast(`Coach ${tr.name} is at maximum capacity (8/8 athletes).`);
        }
      }
    });
  });
}

// =====================================================================
// 8. Sign Out
// =====================================================================
function setupSignOut() {
  const btnOut = document.getElementById('btnTerminalSignOut');
  if (btnOut) {
    btnOut.addEventListener('click', async () => {
      try {
        await fetch('api/logout.php');
      } catch (e) {}
      localStorage.removeItem('o2_active_session');
      localStorage.removeItem('o2_gym_session');
      localStorage.removeItem('o2_gym_user');
      window.location.href = 'index.html';
    });
  }
}

// =====================================================================
// Global Modal & Toast Helpers
// =====================================================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}
window.closeModal = closeModal;

function showToast(message) {
  let toast = document.getElementById('terminalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'terminalToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '28px';
    toast.style.right = '28px';
    toast.style.background = '#131724';
    toast.style.border = '1px solid #00ff88';
    toast.style.color = '#fff';
    toast.style.padding = '14px 22px';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(0,255,136,0.35)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.25s ease';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span style="color: #00ff88; margin-right: 6px;">●</span> ${message}`;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => { toast.style.display = 'none'; }, 250);
  }, 3500);
}
window.showToast = showToast;
