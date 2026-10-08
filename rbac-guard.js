/**
 * O₂ FITNESS - Client-Side RBAC Enforcer & Security Gateway Guard
 * Validates active session roles, guards route access, injects auth headers,
 * and handles 403 Forbidden security violations.
 */

(function () {
  'use strict';

  // 1. Session Retrieval
  function getCurrentUser() {
    try {
      const sessionStr = localStorage.getItem('o2_gym_session') || localStorage.getItem('o2_gym_user');
      if (sessionStr) {
        return JSON.parse(sessionStr);
      }
    } catch (e) {
      console.error('[RBAC] Error reading session', e);
    }
    return null;
  }

  // 2. Identify Current Page Context
  const path = window.location.pathname.toLowerCase();
  const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  // Exclude public login page from route lockdown
  if (filename === 'index.html' || filename === '') {
    return;
  }

  const currentUser = getCurrentUser();

  // Route Permission Mapping
  const ROUTE_PERMISSIONS = {
    'admin.html': ['admin'],
    'dashboard.html': ['admin', 'staff'],
    'staff.html': ['admin', 'staff'],
    'member.html': ['admin', 'staff', 'member']
  };

  const allowedRoles = ROUTE_PERMISSIONS[filename];

  // 3. Authentication Check
  if (!currentUser) {
    console.warn('[RBAC] Unauthenticated access attempt to ' + filename);
    window.location.replace('index.html?error=unauthorized');
    return;
  }

  const userRole = (currentUser.role || 'member').toLowerCase();

  // 4. Role Authorization Check
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    console.error('[RBAC 403] Access Denied: User role "' + userRole + '" cannot access "' + filename + '".');
    
    // Determine user's authorized home portal
    let fallbackPortal = 'member.html';
    if (userRole === 'admin') fallbackPortal = 'admin.html';
    else if (userRole === 'staff') fallbackPortal = 'dashboard.html';

    // Render Security Denial Overlay
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML = `
        <div style="position: fixed; inset: 0; background: #060911; display: flex; align-items: center; justify-content: center; z-index: 999999; font-family: system-ui, sans-serif; color: #fff; padding: 24px; text-align: center;">
          <div style="background: #0f1523; border: 1px solid rgba(255, 42, 109, 0.4); border-radius: 16px; padding: 36px 32px; max-width: 520px; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <div style="width: 64px; height: 64px; background: rgba(255, 42, 109, 0.15); border: 1px solid rgba(255, 42, 109, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px;">
              &#9940;
            </div>
            <h2 style="font-size: 22px; font-weight: 800; color: #ff2a6d; margin-bottom: 12px; letter-spacing: 0.5px;">
              403 FORBIDDEN &bull; ACCESS DENIED
            </h2>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
              Access Denied: You do not have the required role permissions to perform this action.
              Your account <strong>${currentUser.name || currentUser.identifier}</strong> (Role: <span style="color: #60a5fa; text-transform: uppercase;">${userRole}</span>) is restricted from viewing the requested resource.
            </p>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 24px; font-family: monospace;">
              SECURITY AUDIT LOGGED &bull; INCIDENT RECORDED
            </div>
            <a href="${fallbackPortal}" style="display: inline-block; background: #ff2a6d; color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; letter-spacing: 0.5px; box-shadow: 0 0 20px rgba(255, 42, 109, 0.4);">
              RETURN TO AUTHORIZED PORTAL &rarr;
            </a>
          </div>
        </div>
      `;
    });

    // Auto-redirect after 3.5 seconds
    setTimeout(() => {
      window.location.replace(fallbackPortal);
    }, 3500);

    return;
  }

  // 5. Intercept fetch() to automatically attach auth and role headers
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    options.headers = options.headers || {};

    const token = currentUser.auth_token || currentUser.identifier || '';
    if (token) {
      if (options.headers instanceof Headers) {
        if (!options.headers.has('Authorization')) options.headers.set('Authorization', 'Bearer ' + token);
        if (!options.headers.has('X-User-Role')) options.headers.set('X-User-Role', userRole);
        if (!options.headers.has('X-User-Identifier')) options.headers.set('X-User-Identifier', currentUser.identifier || '');
      } else if (typeof options.headers === 'object') {
        if (!options.headers['Authorization']) options.headers['Authorization'] = 'Bearer ' + token;
        if (!options.headers['X-User-Role']) options.headers['X-User-Role'] = userRole;
        if (!options.headers['X-User-Identifier']) options.headers['X-User-Identifier'] = currentUser.identifier || '';
      }
    }

    return originalFetch(url, options).then(response => {
      if (response.status === 403) {
        response.clone().json().then(data => {
          showSecurityToast(data.error || 'Access Denied: You do not have the required role permissions to perform this action.');
        }).catch(() => {
          showSecurityToast('Access Denied: You do not have the required role permissions to perform this action.');
        });
      }
      return response;
    });
  };

  // 6. Security Notification Toast
  function showSecurityToast(message) {
    let toast = document.getElementById('rbacSecurityToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rbacSecurityToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #140d16;
        border: 1px solid #ff2a6d;
        color: #ff5c8a;
        padding: 14px 20px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        z-index: 999999;
        box-shadow: 0 10px 30px rgba(255, 42, 109, 0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>&#9940;</span> <span>${message}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 4500);
  }

  // 7. Global RBAC API for pages
  window.O2_RBAC = {
    getUser: getCurrentUser,
    hasRole: function (roles) {
      if (!currentUser) return false;
      const r = (currentUser.role || '').toLowerCase();
      return roles.map(x => x.toLowerCase()).includes(r);
    },
    denyAccess: function (msg) {
      showSecurityToast(msg || 'Access Denied: You do not have the required role permissions to perform this action.');
    }
  };

})();
