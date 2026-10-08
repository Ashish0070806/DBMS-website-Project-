/**
 * O2 GYM OS - Member Portal Controller
 * Real-time reactive updates from MySQL Database and Triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  const session = JSON.parse(localStorage.getItem('o2_active_session') || '{}');
  const db = JSON.parse(localStorage.getItem('o2_gym_db_data') || '{}');

  async function syncMemberProfile() {
    let member = null;
    if (session && session.identifier) {
      member = (db.users || []).find(u => u.identifier === session.identifier) || session;
    }
    if (!member && db.users) {
      member = db.users.find(u => u.identifier === 'MEM-001') || session;
    }
    if (!member) member = session;

    // Fetch fresh database record
    try {
      const res = await fetch('api/members.php');
      const data = await res.json();
      if (res.ok && data.status === 'success' && data.data && data.data.length) {
        const liveRecord = data.data.find(m => m.code === session.identifier || m.email === session.email) || data.data[0];
        if (liveRecord) {
          member = {
            ...member,
            name: liveRecord.name || member.name,
            plan: liveRecord.plan || member.plan,
            streak: liveRecord.attendance_streak !== undefined ? liveRecord.attendance_streak : member.streak,
            dues: liveRecord.dues_pending !== undefined ? liveRecord.dues_pending : member.dues
          };
        }
      }
    } catch (e) {}

    if (member) {
      const elName = document.getElementById('memberName');
      const elId = document.getElementById('memberIdTag');
      const elAvatar = document.getElementById('memberAvatar');
      const elStreak = document.getElementById('memberStreak');
      const elPlan = document.getElementById('memberPlanName');
      const elDues = document.getElementById('memberDues');
      const elTrainer = document.getElementById('memberTrainer');

      const cardPassName = document.getElementById('cardPassName');
      const cardPassId = document.getElementById('cardPassId');
      const cardPassAvatar = document.getElementById('cardPassAvatar');

      if (elName) elName.innerText = member.name;
      if (elId) elId.innerText = `Member ID: ${member.identifier}`;
      if (elAvatar && member.avatar) elAvatar.src = member.avatar;
      if (elStreak) elStreak.innerText = `${member.streak || 0} Days`;
      if (elPlan) elPlan.innerText = member.plan || 'Annual Platinum Ultra (₹8,999)';
      if (elDues) elDues.innerText = `₹${parseFloat(member.dues || 0).toFixed(2)}`;
      if (elTrainer) elTrainer.innerText = member.trainer || 'Elena Rostova';

      if (cardPassName) cardPassName.innerText = member.name;
      if (cardPassId) cardPassId.innerText = `ID: ${member.identifier}`;
      if (cardPassAvatar && member.avatar) cardPassAvatar.src = member.avatar;
    }
  }

  syncMemberProfile();

  // Live Reactive DB Change Listener for Member Portal
  let memberRevision = 0;
  if (typeof EventSource !== 'undefined') {
    try {
      const sse = new EventSource('api/events.php?stream=1');
      sse.addEventListener('db_change', () => {
        syncMemberProfile();
      });
      sse.onerror = () => {
        sse.close();
        startMemberPolling();
      };
    } catch(e) { startMemberPolling(); }
  } else {
    startMemberPolling();
  }

  function startMemberPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('api/events.php');
        const data = await res.json();
        if (data.status === 'success' && data.revision !== undefined) {
          if (memberRevision === 0) {
            memberRevision = data.revision;
          } else if (data.revision !== memberRevision) {
            memberRevision = data.revision;
            syncMemberProfile();
          }
        }
      } catch (e) {}
    }, 2500);
  }

  // Logout handler
  const btnLogout = document.getElementById('btnLogoutMember');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try { await fetch('api/logout.php'); } catch(e) {}
      localStorage.removeItem('o2_active_session');
      localStorage.removeItem('o2_gym_session');
      localStorage.removeItem('o2_gym_user');
      window.location.href = 'index.html';
    });
  }
});
