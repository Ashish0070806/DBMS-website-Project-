/**
 * O2 GYM OS - Staff Terminal Controller (Operator Alex Morgan)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Check active session
  const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
  if (session && session.name) {
    const staffName = document.getElementById('staffName');
    const staffAvatar = document.getElementById('staffAvatar');
    if (staffName) staffName.innerText = session.name;
    if (staffAvatar && session.avatar) staffAvatar.src = session.avatar;
  }

  // Logout button
  const btnLogout = document.getElementById('btnLogoutStaff');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try { await fetch('api/logout.php'); } catch(e) {}
      localStorage.removeItem('o2_active_session');
      localStorage.removeItem('o2_gym_session');
      localStorage.removeItem('o2_gym_user');
      window.location.href = 'index.html';
    });
  }

  // Initial feed load
  loadCheckinFeed();

  // Live Reactive DB Change Listener for Staff Terminal
  let staffRevision = 0;
  if (typeof EventSource !== 'undefined') {
    try {
      const sse = new EventSource('api/events.php?stream=1');
      sse.addEventListener('db_change', () => {
        loadCheckinFeed();
      });
      sse.onerror = () => {
        sse.close();
        startStaffPolling();
      };
    } catch(e) { startStaffPolling(); }
  } else {
    startStaffPolling();
  }

  function startStaffPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('api/events.php');
        const data = await res.json();
        if (data.status === 'success' && data.revision !== undefined) {
          if (staffRevision === 0) {
            staffRevision = data.revision;
          } else if (data.revision !== staffRevision) {
            staffRevision = data.revision;
            loadCheckinFeed();
          }
        }
      } catch (e) {}
    }, 2500);
  }

  // Code input change listener for live lookup
  const codeInput = document.getElementById('scanMemberCode');
  if (codeInput) {
    codeInput.addEventListener('input', (e) => {
      previewMember(e.target.value.trim());
    });
  }

  // Checkin Form Submit
  const checkinForm = document.getElementById('checkinForm');
  if (checkinForm) {
    checkinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = codeInput.value.trim().toUpperCase();
      const locker = document.getElementById('scanLockerNum').value.trim();
      const feedback = document.getElementById('checkinFeedback');

      let success = false;
      let memberName = '';

      // Try PHP API
      try {
        const res = await fetch('api/checkin.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_code: code, locker: locker, terminal_code: 'TRM-01' })
        });
        const data = await res.json();
        if (res.ok) {
          success = true;
          memberName = data.details?.member_name || code;
        } else {
          showFeedback(data.message, 'error');
          return;
        }
      } catch (err) {}

      // Fallback local DB
      const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
      if (db.users) {
        const mem = db.users.find(u => u.identifier === code || u.email.toLowerCase() === code.toLowerCase());
        if (!mem) {
          showFeedback(`Member '${code}' not found in database.`, 'error');
          return;
        }
        if (mem.status !== 'Active') {
          showFeedback(`ACCESS DENIED: Member status is '${mem.status}'. Please renew subscription at front desk.`, 'error');
          return;
        }

        memberName = mem.name;
        const now = new Date();
        const timeStr = `Today, ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST`;
        
        db.checkins.unshift({
          id: db.checkins.length + 1,
          memberCode: mem.identifier,
          name: mem.name,
          time: timeStr,
          locker: locker,
          terminal: 'Terminal 01'
        });

        db.auditLogs.unshift({
          time: now.toTimeString().split(' ')[0],
          user: session.identifier || 'STF-001',
          action: `CHECKIN: ${mem.name} (${mem.identifier}) @ TRM-01 [Locker: ${locker}]`,
          ip: '192.168.1.101'
        });

        localStorage.setItem('o2_gym_db_data', JSON.stringify(db));
      }

      showFeedback(`ACCESS GRANTED: Welcome, ${memberName}! Locker ${locker} assigned.`, 'success');
      loadCheckinFeed();

      // Bump locker number
      const nextNum = parseInt(locker.replace('L-', '')) + 1;
      document.getElementById('scanLockerNum').value = `L-${nextNum}`;
    });
  }
});

function previewMember(code) {
  if (!code) return;
  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
  if (!db.users) return;

  const mem = db.users.find(u => 
    u.identifier.toLowerCase() === code.toLowerCase() || 
    u.email.toLowerCase() === code.toLowerCase()
  );

  const cardName = document.getElementById('cardMemberName');
  const cardPlan = document.getElementById('cardMemberPlan');
  const cardStatus = document.getElementById('cardMemberStatus');
  const cardAvatar = document.getElementById('cardMemberAvatar');
  const cardContact = document.getElementById('cardMemberContact');

  if (mem) {
    if (cardName) cardName.innerText = mem.name;
    if (cardPlan) cardPlan.innerText = mem.plan || 'Annual Platinum Ultra (₹8,999)';
    if (cardAvatar) cardAvatar.src = mem.avatar;
    if (cardContact) cardContact.innerText = mem.emergency_contact || '+91 98765 11223';
    if (cardStatus) {
      cardStatus.innerText = mem.status.toUpperCase();
      cardStatus.style.color = mem.status === 'Active' ? '#10b981' : '#f87171';
    }
  }
}

window.fillMemberScan = function(code) {
  const input = document.getElementById('scanMemberCode');
  if (input) {
    input.value = code;
    previewMember(code);
  }
};

function showFeedback(msg, type) {
  const fb = document.getElementById('checkinFeedback');
  if (!fb) return;
  fb.style.display = 'block';
  fb.style.padding = '12px 16px';
  fb.style.borderRadius = '8px';
  fb.style.fontSize = '13.5px';
  fb.style.fontWeight = '500';

  if (type === 'success') {
    fb.style.background = 'rgba(16, 185, 129, 0.15)';
    fb.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    fb.style.color = '#34d399';
  } else {
    fb.style.background = 'rgba(239, 68, 68, 0.15)';
    fb.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    fb.style.color = '#f87171';
  }
  fb.innerText = msg;
}

function loadCheckinFeed() {
  const body = document.getElementById('checkinFeedBody');
  if (!body) return;

  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');
  const list = db.checkins || [];

  body.innerHTML = list.map(c => `
    <tr>
      <td style="color: var(--text-muted);">${c.time}</td>
      <td><code>${c.memberCode}</code></td>
      <td><strong>${c.name}</strong></td>
      <td><span style="color: #ff2a6d; font-weight: 600;">${c.locker}</span></td>
      <td>${c.terminal}</td>
      <td><span class="badge-status active">Authorized</span></td>
    </tr>
  `).join('');
}
