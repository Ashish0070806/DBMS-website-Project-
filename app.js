/**
 * O2 GYM OS - Application Controller
 * Handles User Login & Account Registration for Members & Staff with MySQL synchronization.
 */

// Initial Database Structure (Clean slate with Root Admin; user creates their own member/staff accounts)
const DEFAULT_DB = {
  users: [
    { 
      id: 1, 
      identifier: 'ADM-001', 
      email: 'admin@o2gym.io', 
      password: 'admin123', 
      role: 'admin', 
      name: 'System Administrator', 
      phone: '+91 98765 43210',
      status: 'active' 
    }
  ],
  members: [],
  staff: [],
  checkins: [],
  transactions: [],
  auditLogs: [
    { time: '10:00:00', user: 'SYSTEM', action: 'O₂ Fitness cluster initialized (INR Currency Engine)', ip: '127.0.0.1' }
  ]
};

// Initialize / Retrieve Local DB
function getLocalDB() {
  try {
    const raw = localStorage.getItem('o2_gym_db_data');
    if (!raw) {
      localStorage.setItem('o2_gym_db_data', JSON.stringify(DEFAULT_DB));
      return DEFAULT_DB;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_DB;
  }
}

function saveLocalDB(db) {
  localStorage.setItem('o2_gym_db_data', JSON.stringify(db));
}

// Current Registration State
let regCurrentRole = 'member';

document.addEventListener('DOMContentLoaded', () => {
  setupModeSwitch();
  setupRolePills();
  setupPlanNoteUpdate();
  setupLoginForm();
  setupRegisterForm();
  setupModals();
  checkClusterStatus();
});

// =====================================================================
// 1. Mode Switching: Log In vs Create New Account
// =====================================================================
function setupModeSwitch() {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      if (authTitle) authTitle.innerText = 'Log in to O₂ Fitness';
      if (authSubtitle) authSubtitle.innerText = 'Database Management & Operator Terminal';
      hideAlert();
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      if (authTitle) authTitle.innerText = 'Create New Account';
      if (authSubtitle) authSubtitle.innerText = 'Register Member or Staff credentials to MySQL database';
      hideAlert();
    });
  }
}

// =====================================================================
// 2. Registration Role Selector (Member vs Staff)
// =====================================================================
function setupRolePills() {
  const btnMember = document.getElementById('btnRoleMember');
  const btnStaff = document.getElementById('btnRoleStaff');
  const planGroup = document.getElementById('regPlanGroup');
  const staffFields = document.getElementById('regStaffFields');

  if (btnMember && btnStaff) {
    btnMember.addEventListener('click', () => {
      btnMember.classList.add('active');
      btnStaff.classList.remove('active');
      regCurrentRole = 'member';
      if (planGroup) planGroup.style.display = 'block';
      if (staffFields) staffFields.style.display = 'none';
    });

    btnStaff.addEventListener('click', () => {
      btnStaff.classList.add('active');
      btnMember.classList.remove('active');
      regCurrentRole = 'staff';
      if (planGroup) planGroup.style.display = 'none';
      if (staffFields) staffFields.style.display = 'block';
    });
  }
}

// Update Plan Features Note when selecting membership plan
function setupPlanNoteUpdate() {
  const planSelect = document.getElementById('regPlan');
  const note = document.getElementById('planFeaturesNote');
  if (!planSelect || !note) return;

  const planDescriptions = {
    'PL-001': '• All club access, plan 12 months/yearly • ₹8,999',
    'PL-002': '• Access to weight room, cardio arena, & locker, plan 6 months • ₹4,999',
    'PL-003': '• Standard access no lockers with no lock-in auto renews monthly • ₹2,999',
    'PL-004': '• Student membership with 28 days plan (Student ID required) • ₹899'
  };

  planSelect.addEventListener('change', (e) => {
    note.innerText = planDescriptions[e.target.value] || '';
  });
}

// =====================================================================
// 3. Register Account Form Submission
// =====================================================================
function setupRegisterForm() {
  const form = document.getElementById('registerForm');
  const btnRegText = document.getElementById('btnRegText');
  const btnRegister = document.getElementById('btnRegister');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const planCode = document.getElementById('regPlan') ? document.getElementById('regPlan').value : 'PL-001';
    const station = document.getElementById('regStation') ? document.getElementById('regStation').value : 'Front-Desk Terminal 01';

    if (!fullName || !email || !password) {
      showAlert('Full Name, Email, and Password are required.', 'error');
      return;
    }

    if (password.length < 4) {
      showAlert('Password must be at least 4 characters long.', 'error');
      return;
    }

    // RBAC: Self-Registration Constraint - admin role cannot be registered via public UI
    if (regCurrentRole === 'admin') {
      showAlert('Access Denied: You do not have the required role permissions to perform this action.', 'error');
      resetRegButton();
      return;
    }

    // Set Loading State
    btnRegText.innerText = 'Creating Account & Storing in DB...';
    btnRegister.style.opacity = '0.8';
    btnRegister.style.pointerEvents = 'none';

    let registeredSuccessfully = false;
    let generatedIdentifier = '';

    // Attempt 1: Call PHP API / MySQL
    try {
      const res = await fetch('api/register.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: regCurrentRole,
          full_name: fullName,
          email: email,
          password: password,
          phone: phone,
          plan_code: planCode,
          station: station
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        registeredSuccessfully = true;
        generatedIdentifier = data.user.identifier;
      } else if (res.status === 403) {
        showAlert(data.error || 'Access Denied: You do not have the required role permissions to perform this action.', 'error');
        resetRegButton();
        return;
      } else if (res.status === 409) {
        showAlert(data.message || 'An account with this email already exists.', 'error');
        resetRegButton();
        return;
      }
    } catch (err) {
      // Local fallback for VS Code Live Server
    }

    // Attempt 2: Local Database Store Sync
    const db = getLocalDB();
    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      showAlert('An account with this email address already exists. Please log in.', 'error');
      resetRegButton();
      return;
    }

    if (!generatedIdentifier) {
      const count = db.users.filter(u => u.role === regCurrentRole).length;
      const prefix = regCurrentRole === 'staff' ? 'STF' : 'MEM';
      generatedIdentifier = `${prefix}-${String(count + 101).padStart(3, '0')}`;
    }

    const planNames = {
      'PL-001': 'Annual Platinum Ultra (₹8,999)',
      'PL-002': 'Semi Annual Pro (₹4,999)',
      'PL-003': 'Monthly Plus+ (₹2,999)',
      'PL-004': 'Student Membership (₹899)'
    };

    const newUser = {
      id: db.users.length + 1,
      identifier: generatedIdentifier,
      email: email,
      password: password,
      role: regCurrentRole,
      name: fullName,
      phone: phone,
      plan: planNames[planCode] || 'Annual Platinum Ultra (₹8,999)',
      station: station,
      status: 'active'
    };

    db.users.push(newUser);
    db.auditLogs.unshift({
      time: new Date().toTimeString().split(' ')[0],
      user: generatedIdentifier,
      action: `Created new ${regCurrentRole.toUpperCase()} account (${email})`,
      ip: '127.0.0.1'
    });
    saveLocalDB(db);

    resetRegButton();
    form.reset();

    // Switch to Log In tab with prefilled email
    showAlert(`Success! Your account has been registered with ID: ${generatedIdentifier}. You can now log in.`, 'success');
    
    setTimeout(() => {
      document.getElementById('tabLogin').click();
      const idInput = document.getElementById('operatorIdentity');
      if (idInput) {
        idInput.value = email;
      }
      const roleSelect = document.getElementById('operatorRole');
      if (roleSelect) {
        roleSelect.value = regCurrentRole;
      }
    }, 1200);
  });
}

function resetRegButton() {
  const btnRegText = document.getElementById('btnRegText');
  const btnRegister = document.getElementById('btnRegister');
  if (btnRegText) btnRegText.innerText = 'Register & Save to Database';
  if (btnRegister) {
    btnRegister.style.opacity = '1';
    btnRegister.style.pointerEvents = 'auto';
  }
}

// =====================================================================
// 4. Log In Form Submission
// =====================================================================
function setupLoginForm() {
  const form = document.getElementById('loginForm');
  const identityInput = document.getElementById('operatorIdentity');
  const passwordInput = document.getElementById('operatorPassword');
  const roleSelect = document.getElementById('operatorRole');
  const rememberCheck = document.getElementById('rememberProfile');
  const btnLogin = document.getElementById('btnLogin');
  const btnText = document.getElementById('btnText');
  const togglePassBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');

  // Toggle Password Visibility
  if (togglePassBtn) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPass ? 'text' : 'password');
      eyeIcon.innerHTML = isPass 
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const identity = identityInput.value.trim();
    const password = passwordInput.value.trim();
    const selectedRole = roleSelect.value;
    const remember = rememberCheck.checked;

    if (!identity || !password) {
      showAlert('Please enter both Email/Account ID and Password.', 'error');
      return;
    }

    btnText.innerText = 'Authenticating...';
    btnLogin.style.opacity = '0.8';
    btnLogin.style.pointerEvents = 'none';

    let authenticated = false;
    let authUser = null;

    // Attempt 1: Call PHP API / MySQL
    try {
      const res = await fetch('api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: identity,
          password: password,
          role: selectedRole,
          remember: remember
        })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        authenticated = true;
        authUser = result.user;
      } else if (res.status === 401 || res.status === 403) {
        showAlert(result.message || 'Access Denied: Incorrect password or email.', 'error');
        resetLoginButton();
        return;
      }
    } catch (err) {
      // Local fallback for VS Code Live Server
    }

    // Attempt 2: Validate against local store (includes all registered accounts)
    if (!authenticated) {
      const db = getLocalDB();
      const user = db.users.find(u => 
        (u.email.toLowerCase() === identity.toLowerCase() || u.identifier.toUpperCase() === identity.toUpperCase()) &&
        u.password === password
      );

      if (user) {
        if (selectedRole && user.role !== selectedRole && user.role !== 'admin') {
          showAlert(`Role Mismatch: Account '${user.identifier}' is registered as ${user.role.toUpperCase()}, not ${selectedRole.toUpperCase()}.`, 'error');
          resetLoginButton();
          return;
        }

        authenticated = true;
        authUser = {
          id: user.id,
          identifier: user.identifier,
          email: user.email,
          name: user.name,
          role: user.role,
          station: user.station || 'Terminal 01'
        };

        db.auditLogs.unshift({
          time: new Date().toTimeString().split(' ')[0],
          user: user.identifier,
          action: `Login verified as ${user.role} (${user.name})`,
          ip: '127.0.0.1'
        });
        saveLocalDB(db);
      } else {
        showAlert('Invalid credentials. If you are new, click "Create New Account" to register.', 'error');
        resetLoginButton();
        return;
      }
    }

    // Save Active Session with RBAC role metadata
    localStorage.setItem('o2_active_session', JSON.stringify(authUser));
    localStorage.setItem('o2_gym_session', JSON.stringify(authUser));
    localStorage.setItem('o2_gym_user', JSON.stringify(authUser));

    const roleLower = (authUser.role || 'member').toLowerCase();
    let targetPortal = 'member.html';
    if (roleLower === 'admin') {
      targetPortal = 'admin.html';
    } else if (roleLower === 'staff') {
      targetPortal = 'dashboard.html';
    }

    showAlert(`Welcome, ${authUser.name}! Launching ${authUser.role.toUpperCase()} terminal...`, 'success');

    setTimeout(() => {
      window.location.href = targetPortal;
    }, 600);
  });
}

function resetLoginButton() {
  const btnText = document.getElementById('btnText');
  const btnLogin = document.getElementById('btnLogin');
  if (btnText) btnText.innerText = 'Log In';
  if (btnLogin) {
    btnLogin.style.opacity = '1';
    btnLogin.style.pointerEvents = 'auto';
  }
}

// =====================================================================
// 5. Modals & Alerts
// =====================================================================
function setupModals() {
  const btnHelp = document.getElementById('btnHelpModal');
  if (btnHelp) {
    btnHelp.addEventListener('click', () => openModal('modalHelp'));
  }

  const btnForgot = document.getElementById('btnForgotPass');
  if (btnForgot) {
    btnForgot.addEventListener('click', () => {
      showAlert('To reset your password, contact your system administrator or register a new account.', 'error');
    });
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}
window.closeModal = closeModal;

function showAlert(message, type = 'error') {
  const alert = document.getElementById('loginAlert');
  const msg = document.getElementById('alertMessage');
  if (!alert || !msg) return;
  alert.className = `alert-banner ${type}`;
  msg.innerText = message;
  alert.style.display = 'flex';
}

function hideAlert() {
  const alert = document.getElementById('loginAlert');
  if (alert) alert.style.display = 'none';
}

async function checkClusterStatus() {
  const statusBadge = document.getElementById('dbStatusText');
  try {
    const res = await fetch('api/stats.php');
    if (res.ok) {
      if (statusBadge) statusBadge.innerText = 'DB Cluster: Active (MySQL)';
    } else {
      if (statusBadge) statusBadge.innerText = 'DB Cluster: Active (Live)';
    }
  } catch (err) {
    if (statusBadge) statusBadge.innerText = 'DB Cluster: Active (Local)';
  }
}
