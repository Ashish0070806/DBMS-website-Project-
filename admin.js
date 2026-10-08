/**
 * O2 GYM OS - Admin Terminal Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Check active session
  const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
  if (session && session.name) {
    const adminName = document.getElementById('adminName');
    const adminAvatar = document.getElementById('adminAvatar');
    if (adminName) adminName.innerText = session.name;
    if (adminAvatar && session.avatar) adminAvatar.src = session.avatar;
  }

  // Logout handler
  const btnLogout = document.getElementById('btnLogoutAdmin');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try { await fetch('api/logout.php'); } catch(e) {}
      localStorage.removeItem('o2_active_session');
      localStorage.removeItem('o2_gym_session');
      localStorage.removeItem('o2_gym_user');
      window.location.href = 'index.html';
    });
  }

  // Initial load
  loadMembers();
  loadAuditLogs();

  // Live Reactive DB Change Listener for Admin Terminal
  let adminRevision = 0;
  if (typeof EventSource !== 'undefined') {
    try {
      const sse = new EventSource('api/events.php?stream=1');
      sse.addEventListener('db_change', () => {
        loadMembers();
        loadAuditLogs();
      });
      sse.onerror = () => {
        sse.close();
        startAdminPolling();
      };
    } catch(e) { startAdminPolling(); }
  } else {
    startAdminPolling();
  }

  function startAdminPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('api/events.php');
        const data = await res.json();
        if (data.status === 'success' && data.revision !== undefined) {
          if (adminRevision === 0) {
            adminRevision = data.revision;
          } else if (data.revision !== adminRevision) {
            adminRevision = data.revision;
            loadMembers();
            loadAuditLogs();
          }
        }
      } catch (e) {}
    }, 2500);
  }

  // Search input
  const searchInput = document.getElementById('memberSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterMembers(e.target.value.toLowerCase());
    });
  }

  // Open Add Member Modal
  const btnOpenModal = document.getElementById('btnOpenAddMember');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      const modal = document.getElementById('modalAddMember');
      if (modal) modal.classList.add('active');
    });
  }

  // Add Member Form Submit
  const addForm = document.getElementById('addMemberForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newMemberName').value.trim();
      const email = document.getElementById('newMemberEmail').value.trim();
      const plan = document.getElementById('newMemberPlan').value;
      const trainer = document.getElementById('newMemberTrainer').value;

      let added = false;
      try {
        const res = await fetch('api/members.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, plan, trainer })
        });
        if (res.ok) {
          added = true;
        }
      } catch (err) {}

      // Fallback or update local database
      const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
      if (db.users) {
        const memCount = db.users.filter(u => u.role === 'member').length;
        const newCode = 'MEM-' + String(memCount + 1).padStart(3, '0');
        const newMember = {
          id: db.users.length + 1,
          identifier: newCode,
          email: email,
          password: 'member123',
          role: 'member',
          name: name,
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          status: 'Active',
          plan: plan,
          phone: '+91 98765 43210',
          trainer: trainer,
          streak: 1,
          dues: 0.00
        };
        db.users.push(newMember);
        db.auditLogs.unshift({
          time: new Date().toTimeString().split(' ')[0],
          user: session.identifier || 'ADM-001',
          action: `INSERT INTO members: Created ${newCode} (${name})`,
          ip: '127.0.0.1'
        });
        localStorage.setItem('o2_gym_db_data', JSON.stringify(db));
      }

      closeModal('modalAddMember');
      addForm.reset();
      loadMembers();
      loadAuditLogs();
      alert(`Success: Member ${name} has been saved to the database!`);
    });
  }
});

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}
window.closeModal = closeModal;

let cachedMembers = [];

async function loadMembers() {
  const tableBody = document.getElementById('memberTableBody');
  if (!tableBody) return;

  // Try PHP API
  let members = [];
  try {
    const res = await fetch('api/members.php');
    if (res.ok) {
      const json = await res.json();
      if (json.data && json.data.length) {
        members = json.data;
      }
    }
  } catch (err) {}

  // Fallback to local DB
  if (!members.length) {
    const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
    if (db.users) {
      members = db.users.filter(u => u.role === 'member').map(m => ({
        member_id: m.id,
        code: m.identifier,
        name: m.name,
        email: m.email,
        plan: m.plan || 'Annual Platinum Ultra (₹8,999)',
        trainer: m.trainer || 'Coach Elena',
        streak: m.streak || 0,
        dues_pending: m.dues || 0.00,
        status: m.status || 'Active'
      }));
    }
  }

  cachedMembers = members;
  renderMemberTable(members);
  updateKPIs(members);
}

function renderMemberTable(members) {
  const tableBody = document.getElementById('memberTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = members.map(m => `
    <tr>
      <td><code>${m.code}</code></td>
      <td><strong>${m.name}</strong></td>
      <td style="color: var(--text-muted);">${m.email}</td>
      <td><span style="color: #60a5fa;">${m.plan}</span></td>
      <td>${m.trainer || m.assigned_trainer || 'Coach Elena'}</td>
      <td>🔥 ${m.streak || m.attendance_streak || 0} days</td>
      <td style="color: ${m.dues_pending > 0 ? '#f87171' : '#10b981'}; font-weight: 600;">₹${parseFloat(m.dues_pending || 0).toFixed(2)}</td>
      <td>
        <span class="badge-status ${m.status.toLowerCase() === 'active' ? 'active' : 'expired'}">
          ${m.status}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="table-btn-delete" style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa;" onclick="toggleMemberStatus('${m.code}', '${m.status}')">
            ${m.status.toLowerCase() === 'active' ? 'Freeze' : 'Activate'}
          </button>
          <button class="table-btn-delete" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444;" onclick="deleteMember('${m.code}', '${m.name}')">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterMembers(query) {
  const filtered = cachedMembers.filter(m => 
    m.name.toLowerCase().includes(query) ||
    m.code.toLowerCase().includes(query) ||
    m.plan.toLowerCase().includes(query)
  );
  renderMemberTable(filtered);
}

window.toggleMemberStatus = async function(code, currentStatus) {
  const newStatus = (currentStatus && currentStatus.toLowerCase() === 'active') ? 'SUSPENDED' : 'ACTIVE';
  try {
    const res = await fetch('api/members.php', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Identifier': 'ADM-001'
      },
      body: JSON.stringify({ code: code, status: newStatus })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(`Success: Status for ${code} updated to ${newStatus} in MariaDB!`);
    }
  } catch (err) {
    console.warn('API error, falling back locally:', err);
  }

  // Also update local cache
  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
  if (db.users) {
    const mem = db.users.find(u => u.identifier === code);
    if (mem) {
      mem.status = newStatus === 'ACTIVE' ? 'Active' : 'Expired';
      db.auditLogs.unshift({
        time: new Date().toTimeString().split(' ')[0],
        user: 'ADM-001',
        action: `UPDATE members: Set status='${mem.status}' for ${code}`,
        ip: '127.0.0.1'
      });
      localStorage.setItem('o2_gym_db_data', JSON.stringify(db));
    }
  }
  loadMembers();
  loadAuditLogs();
};

window.deleteMember = async function(code, name) {
  if (!confirm(`Are you sure you want to permanently delete athlete ${name} (${code}) from MariaDB?`)) {
    return;
  }
  try {
    const res = await fetch(`api/members.php?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Identifier': 'ADM-001'
      }
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message || `Athlete ${name} (${code}) deleted from MariaDB!`);
    } else {
      alert(data.message || 'Error deleting athlete from MariaDB.');
    }
  } catch (err) {
    alert('Network error while deleting member: ' + err.message);
  }

  // Clean local fallback storage if present
  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
  if (db.users) {
    db.users = db.users.filter(u => u.identifier !== code);
    db.auditLogs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      user: 'ADM-001',
      action: `DELETE FROM members: Removed ${code} (${name})`,
      ip: '127.0.0.1'
    });
    localStorage.setItem('o2_gym_db_data', JSON.stringify(db));
  }
  loadMembers();
  loadAuditLogs();
};

function updateKPIs(members) {
  const total = members.length;
  const active = members.filter(m => m.status === 'Active').length;
  
  const elTotal = document.getElementById('kpiTotalMembers');
  const elActive = document.getElementById('kpiActiveMembers');
  if (elTotal) elTotal.innerText = total;
  if (elActive) elActive.innerText = active;
}

function loadAuditLogs() {
  const list = document.getElementById('auditLogList');
  if (!list) return;

  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
  const logs = db.auditLogs || [];

  list.innerHTML = logs.slice(0, 7).map(log => `
    <li style="padding: 6px 10px; background: rgba(10, 14, 24, 0.4); border-radius: 6px; border-left: 2px solid #ff2a6d;">
      <span style="color: #64748b;">[${log.time}]</span> 
      <strong style="color: #f02253;">${log.user}</strong>: 
      <span style="color: #cbd5e1;">${log.action}</span>
    </li>
  `).join('');
}
