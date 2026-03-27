// ═══════════════════════════════════════════════════════════════
// js/auth.js — AUTHENTICATION
// Handles: Sign Up, Sign In, OTP verification, Logout
// Used by: index.html only
// ═══════════════════════════════════════════════════════════════

// ── IMPORTS ────────────────────────────────────────────────────

// From our firebase.js — get the auth and db instances
import { auth, db } from './firebase.js';

// Firebase Auth functions we need:
import {
  createUserWithEmailAndPassword,  // for Sign Up
  signInWithEmailAndPassword,      // for Sign In
  sendEmailVerification,           // sends OTP-style verification email
  onAuthStateChanged,              // detects if user is already logged in
  signOut                          // for Logout
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firestore functions to save user profile data:
import {
  doc,    // points to a specific document
  setDoc  // writes data to that document
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── SESSION CHECK ───────────────────────────────────────────────
// When index.html loads, check if the user is ALREADY logged in.
// If they are — skip the login page and go straight to marketplace.
// This is called a "session check" or "auth guard".

// onAuthStateChanged fires EVERY TIME the login state changes.
// It also fires immediately on page load to check current state.

onAuthStateChanged(auth, (user) => {
  // 'user' is either a logged-in user object, or null (not logged in)

  if (user) {
    // User is already logged in — no need to show login page
    // But first check if their email is verified (OTP completed)
    if (user.emailVerified) {
      // Redirect to marketplace
      window.location.href = 'marketplace.html';
    }
    // If email not verified, stay on login page so they can verify
  }
  // If user is null (not logged in), do nothing — stay on login page
});

// ── SIGN UP ─────────────────────────────────────────────────────
// Called when student clicks "Create Account"

async function handleSignUp() {
  // Step 1: Read values from the form
  const firstName = document.getElementById('suFirst').value.trim();
  const lastName  = document.getElementById('suLast').value.trim();
  const email     = document.getElementById('suEmail').value.trim();
  const phone     = document.getElementById('suPhone').value.trim();
  const password  = document.getElementById('suPass').value;

  // Step 2: Validate inputs before sending to Firebase
  if (!firstName || !lastName) { showToast('Please enter your full name', 'error'); return; }
  if (!email)    { showToast('Please enter your email', 'error'); return; }
  if (!phone)    { showToast('Please enter your phone number', 'error'); return; }
  if (!password) { showToast('Please enter a password', 'error'); return; }

  // Step 3: Enforce @sliet.ac.in domain
  // This is our "gate" — only SLIET students can register
  if (!email.endsWith('@sliet.ac.in')) {
    showToast('Only @sliet.ac.in emails are allowed', 'error');
    return;
  }

  // Step 4: Validate password length
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  // Step 5: Show loading state on button
  const btn = document.querySelector('#stateSignUp .btn-primary');
  btn.textContent = 'Creating Account...';
  btn.disabled = true;

  try {
    // Step 6: Create the user in Firebase Auth
    // createUserWithEmailAndPassword does two things:
    //   a) Creates the account in Firebase Auth
    //   b) Returns a 'userCredential' object with user info
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    // At this point: user exists in Firebase Auth but email is NOT verified yet

    // Step 7: Send verification email
    // Firebase sends a verification link to their @sliet.ac.in inbox
    // The student must click it to verify their email
    await sendEmailVerification(user);

    // Step 8: Save the user's profile to Firestore
    // Firebase Auth only stores email + password.
    // For name, phone etc., we save a separate document in the 'users' collection.
    //
    // doc(db, 'users', user.uid) means:
    //   database → collection called 'users' → document with ID = user's UID
    //   (UID is a unique ID Firebase gives every user automatically)
    //
    // setDoc writes the data to that document
    await setDoc(doc(db, 'users', user.uid), {
      uid:       user.uid,
      firstName: firstName,
      lastName:  lastName,
      name:      `${firstName} ${lastName}`,  // full name for easy display
      email:     email,
      phone:     phone,
      joinedAt:  new Date().toISOString()      // timestamp
    });

    // Step 9: Show success and switch to OTP state
    showToast('Verification email sent to your college inbox!', 'success');
    setTimeout(showOTP, 600);

  } catch (error) {
    // Firebase gives specific error codes — we translate them to friendly messages
    let msg = 'Something went wrong. Please try again.';
    if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try signing in.';
    if (error.code === 'auth/invalid-email')         msg = 'Invalid email address.';
    if (error.code === 'auth/weak-password')         msg = 'Password is too weak. Use at least 8 characters.';
    showToast(msg, 'error');
  } finally {
    // Always re-enable the button whether success or error
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
}


// ── SIGN IN ─────────────────────────────────────────────────────
// Called when student clicks "Sign In"

async function handleSignIn() {
  const email    = document.getElementById('siEmail').value.trim();
  const password = document.getElementById('siPass').value;

  // Validate
  if (!email)    { showToast('Please enter your email', 'error'); return; }
  if (!password) { showToast('Please enter your password', 'error'); return; }
  if (!email.endsWith('@sliet.ac.in')) {
    showToast('Only @sliet.ac.in emails are allowed', 'error');
    return;
  }

  // Loading state
  const btn = document.querySelector('#stateSignIn .btn-primary');
  btn.textContent = 'Signing In...';
  btn.disabled = true;

  try {
    // signInWithEmailAndPassword checks email + password against Firebase Auth
    // If correct — returns userCredential
    // If wrong — throws an error
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check if email is verified
    // (They must have completed OTP/email verification during sign up)
    if (!user.emailVerified) {
      showToast('Please verify your email first. Check your inbox.', 'error');
      // Optionally resend verification email
      await sendEmailVerification(user);
      showToast('Verification email resent!', 'info');
      await signOut(auth); // sign them out until they verify
      return;
    }

    // All good — redirect to marketplace
    showToast('Welcome back!', 'success');
    setTimeout(() => window.location.href = 'marketplace.html', 800);

  } catch (error) {
    let msg = 'Sign in failed. Please try again.';
    if (error.code === 'auth/user-not-found')    msg = 'No account found with this email.';
    if (error.code === 'auth/wrong-password')    msg = 'Incorrect password.';
    if (error.code === 'auth/invalid-credential') msg = 'Incorrect email or password.';
    if (error.code === 'auth/too-many-requests')  msg = 'Too many attempts. Try again later.';
    showToast(msg, 'error');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}


// ── OTP / EMAIL VERIFICATION CHECK ──────────────────────────────
// Firebase sends a verification LINK (not a code) to the email.
// The student clicks the link in their inbox, then comes back here
// and clicks "I've Verified" to continue.

async function handleOTP() {
  const user = auth.currentUser;

  if (!user) {
    showToast('Session expired. Please sign up again.', 'error');
    return;
  }

  // reload() fetches the latest user data from Firebase
  // This updates user.emailVerified if they just clicked the link
  await user.reload();

  if (user.emailVerified) {
    // Email verified! Redirect to welcome page
    window.location.href = 'welcome.html';
  } else {
    showToast('Email not verified yet. Please click the link in your inbox.', 'error');
  }
}


// ── RESEND VERIFICATION EMAIL ────────────────────────────────────
async function resendVerification() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await sendEmailVerification(user);
    showToast('Verification email resent!', 'success');
  } catch (error) {
    showToast('Could not resend. Please wait a moment.', 'error');
  }
}


// ── MAKE FUNCTIONS AVAILABLE TO HTML ────────────────────────────
// Since we use type="module", functions inside this file are
// NOT automatically available to onclick="" in HTML.
// We must manually attach them to the window object.

window.handleSignIn  = handleSignIn;
window.handleSignUp  = handleSignUp;
window.handleOTP     = handleOTP;
window.resendVerification = resendVerification;

// Also re-attach the non-Firebase helper functions
// (these were previously inline in index.html)

window.switchTab = function(tab) {
  ['tabSignIn','tabSignUp'].forEach(id => document.getElementById(id).classList.remove('active'));
  ['stateSignIn','stateSignUp'].forEach(id => document.getElementById(id).classList.remove('active'));
  if (tab === 'signin') {
    document.getElementById('tabSignIn').classList.add('active');
    document.getElementById('stateSignIn').classList.add('active');
  } else {
    document.getElementById('tabSignUp').classList.add('active');
    document.getElementById('stateSignUp').classList.add('active');
  }
};

window.showOTP = function() {
  document.querySelectorAll('.form-state').forEach(s => s.classList.remove('active'));
  document.getElementById('authTabs').style.visibility = 'hidden';
  document.getElementById('stateOTP').classList.add('active');
  // Update OTP screen text to say "click the link" instead of "enter 6 digits"
  document.querySelector('#stateOTP p').innerHTML =
    'A verification link has been sent to your <strong style="color:var(--txt-1);">@sliet.ac.in</strong> inbox. Click the link, then press the button below.';
  document.querySelector('#stateOTP .btn-primary').textContent = "I've Verified My Email";
};

window.togglePass = function(id, icon) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
};

// OTP input auto-advance (still useful UX even though it's now a link)
document.addEventListener('DOMContentLoaded', () => {
  const otpInputs = document.querySelectorAll('.otp-input');
  otpInputs.forEach((inp, i, arr) => {
    inp.addEventListener('input', e => {
      if (e.target.value.length > 1) e.target.value = e.target.value.slice(-1);
      if (e.target.value && i < arr.length - 1) arr[i + 1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) arr[i - 1].focus();
    });
  });

  // Resend button countdown
  let cd = 60;
  const resendBtn = document.getElementById('resendBtn');
  if (resendBtn) {
    const timer = setInterval(() => {
      cd--;
      if (cd > 0) {
        resendBtn.textContent = `Resend (${cd}s)`;
      } else {
        resendBtn.textContent = 'Resend Verification Email';
        resendBtn.style.color = 'var(--accent)';
        resendBtn.style.cursor = 'pointer';
        resendBtn.onclick = resendVerification;
        clearInterval(timer);
      }
    }, 1000);
  }
});

// Toast (needed before app.js loads on index.html)
window.showToast = function(msg, type = 'info') {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="material-symbols-outlined">${icons[type] || 'info'}</span>${msg}`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};
