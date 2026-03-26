// ═══════════════════════════════════════════════════════════════
// js/guard.js — AUTH GUARD
// Protects all pages EXCEPT index.html from unauthenticated access.
//
// HOW IT WORKS:
// Include this file on marketplace.html, listings.html, bids.html.
// When those pages load, this checks if a user is logged in.
// If NOT logged in → immediately redirect to index.html (login page).
// If logged in → let the page load normally AND fill in the navbar
//               with the real student's name.
//
// This prevents anyone from accessing the marketplace just by
// typing the URL directly — they MUST be logged in first.
// ═══════════════════════════════════════════════════════════════

import { auth, db } from './firebase.js';

import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── GLOBAL: store current user so other JS files can use it ────
// We put it on window so market.js, listings.js, bids.js can all
// read window.currentUser without importing this file again.
window.currentUser    = null;  // Firebase Auth user object
window.currentProfile = null;  // Firestore user document (name, phone etc.)


// ── AUTH STATE LISTENER ─────────────────────────────────────────
// This runs as soon as guard.js is imported.
// It checks Firebase for the current login state.

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    // Nobody is logged in → send to login page
    window.location.href = 'index.html';
    return;
  }

  if (!user.emailVerified) {
    // Logged in but email not verified → send back to login
    await signOut(auth);
    window.location.href = 'index.html';
    return;
  }

  // ✅ User is valid and verified
  window.currentUser = user;

  // FALLBACK: immediately show something from the Auth object
  // while we wait for Firestore to respond.
  // user.email is always available (e.g. "rahul.kumar@sliet.ac.in")
  // We extract the part before @ and capitalise it as a quick display name.
  const emailName = user.email.split('@')[0];          // "rahul.kumar"
  const quickName = emailName.replace('.', ' ')         // "rahul kumar"
    .replace(/\b\w/g, c => c.toUpperCase());            // "Rahul Kumar"
  updateNavbar({ firstName: quickName, lastName: '' });

  // Now fetch the full profile from Firestore
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (userDoc.exists()) {
      window.currentProfile = userDoc.data();
      // Overwrite the quick-name with the real stored name
      updateNavbar(window.currentProfile);
    } else {
      // Document doesn't exist yet (e.g. race condition on first sign-up)
      // Keep the quick fallback name already shown above
      window.currentProfile = { name: quickName, firstName: quickName, email: user.email };
      console.warn('guard.js: user profile doc not found for uid', user.uid);
    }
  } catch (err) {
    // Firestore read failed (e.g. rules blocked it, network issue)
    // Keep showing the fallback name — don't crash the page
    console.error('guard.js: failed to fetch user profile:', err.message);
    window.currentProfile = { name: quickName, firstName: quickName, email: user.email };
  }
});


// ── UPDATE NAVBAR ───────────────────────────────────────────────
// Runs after guard.js fetches the student's Firestore profile.
// Replaces the "..." placeholder in the navbar with real name/initials.
//
// WHY USE IDs HERE?
// IDs are faster and more reliable than querySelector class selectors.
// We added id="navUsername" and id="navAvatar" to the HTML so we can
// target them directly without any ambiguity.

function updateNavbar(profile) {
  // Full name next to avatar e.g. "Rahul Kumar"
  const usernameEl = document.getElementById('navUsername');
  if (usernameEl) {
    usernameEl.textContent = profile.firstName || profile.name || 'Student';
  }

  // Avatar circle — show initials e.g. "RK" for Rahul Kumar
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) {
    const first   = (profile.firstName || '')[0] || '';
    const last    = (profile.lastName  || '')[0] || '';
    const initials = (first + last).toUpperCase();
    avatarEl.textContent = initials || '?';
  }
}


// ── LOGOUT FUNCTION ─────────────────────────────────────────────
// Called when student clicks the "Logout" link in navbar.
// We make it async because signOut() is a promise.

window.logout = async function() {
  try {
    await signOut(auth);
    // After signing out, redirect to login page
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Logout error:', error);
  }
};