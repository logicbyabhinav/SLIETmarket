// ═══════════════════════════════════════════════════════════════
// js/bids.js — YOUR BIDS PAGE
// Handles: Fetching buyer's offers, showing status, revealing
//          seller contact on accepted offers, withdrawing bids
// Used by: bids.html
// ═══════════════════════════════════════════════════════════════

import { db } from './firebase.js';

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDoc    // fetches a single document by ID
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── LOAD MY BIDS (REAL-TIME) ─────────────────────────────────────
// Fetches all offers the logged-in student has made as a BUYER.
// Uses onSnapshot so the status updates in real-time:
// When seller accepts → this page instantly shows "Accepted" ✅

function loadMyBids() {
  const user = window.currentUser;
  if (!user) return;

  // Query: offers WHERE buyerId == my UID, ordered newest first
  const q = query(
    collection(db, 'offers'),
    where('buyerId', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    const bids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderBids(bids);
  });
}


// ── RENDER BIDS LIST ─────────────────────────────────────────────
function renderBids(bids) {
  const list = document.getElementById('bidsList');

  if (!bids.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:60px 0;color:var(--txt-3);">
        <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px;">gavel</span>
        No bids yet. Go browse the marketplace!
      </div>`;
    return;
  }

  list.innerHTML = bids.map(bid => {
    // Choose badge colour based on status
    const badgeClass = {
      accepted: 'badge-accepted',
      pending:  'badge-pending',
      rejected: 'badge-rejected'
    }[bid.status] || 'badge-pending';

    const badgeLabel = bid.status.charAt(0).toUpperCase() + bid.status.slice(1);

    // Choose action buttons based on status
    let actions = '';
    if (bid.status === 'accepted') {
      // ✅ Accepted: show "View Seller Contact" button
      // Seller's phone is only revealed here after acceptance
      actions = `
        <button class="btn btn-outline btn-sm" onclick="showSellerContact('${bid.id}')">
          <span class="material-symbols-outlined" style="font-size:15px;">call</span>
          View Contact
        </button>`;
    } else if (bid.status === 'pending') {
      // 🟡 Pending: show Withdraw button
      actions = `
        <div class="bid-btns">
          <button class="btn btn-danger-outline btn-sm" onclick="withdrawBid('${bid.id}')">
            Withdraw
          </button>
        </div>`;
    } else {
      // ❌ Rejected: show Remove button
      actions = `
        <button class="btn btn-ghost btn-sm"
                onclick="removeBid('${bid.id}')"
                style="color:var(--danger);border-color:var(--danger);">
          Remove
        </button>`;
    }

    return `
      <div class="bid-row" id="bid-row-${bid.id}"
           style="${bid.status === 'rejected' ? 'opacity:.65' : ''}">
        <div class="bid-thumb">
          <img src="${bid.listingImage || 'https://via.placeholder.com/88?text=?'}"
               alt="${bid.listingTitle}" loading="lazy"/>
        </div>
        <div class="bid-info">
          <div class="bid-title">${bid.listingTitle}</div>
          <div class="bid-seller">Seller: ${bid.sellerName}</div>
          <div class="bid-prices">
            <span class="bid-original">
              ₹${Number(bid.listingPrice || 0).toLocaleString('en-IN')}
            </span>
            <span class="txt-price" style="font-size:clamp(15px,2vw,18px);">
              ₹${Number(bid.offerPrice).toLocaleString('en-IN')}
            </span>
          </div>
          ${bid.message ? `<div class="txt-muted" style="margin-top:4px;font-style:italic;">"${bid.message}"</div>` : ''}
        </div>
        <div class="bid-actions">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          ${actions}
        </div>
      </div>`;
  }).join('');
}


// ── SHOW SELLER CONTACT ──────────────────────────────────────────
// Only called when an offer is ACCEPTED.
// Fetches the seller's user profile from Firestore to get their phone.
//
// WHY NOT STORE PHONE IN THE OFFER?
// Privacy. We never store the seller's phone in the offer document.
// It lives only in the seller's user profile (users/{uid}).
// And we only fetch it when the offer status is 'accepted'.
// This way, rejected or pending buyers can NEVER see the phone.

window.showSellerContact = async function(offerId) {
  try {
    // Step 1: Get the offer document to find the sellerId
    const offerDoc = await getDoc(doc(db, 'offers', offerId));
    if (!offerDoc.exists()) {
      showToast('Offer not found', 'error');
      return;
    }
    const offer = offerDoc.data();

    // Step 2: Double-check status is still 'accepted'
    if (offer.status !== 'accepted') {
      showToast('This offer has not been accepted', 'error');
      return;
    }

    // Step 3: Fetch the SELLER's profile from users collection
    // This is where the phone number lives
    const sellerDoc = await getDoc(doc(db, 'users', offer.sellerId));
    if (!sellerDoc.exists()) {
      showToast('Seller profile not found', 'error');
      return;
    }
    const seller = sellerDoc.data();

    // Step 4: Fill the contact modal with seller info
    document.getElementById('contactName').textContent   = seller.name || seller.firstName;
    document.getElementById('contactHostel').textContent = seller.email;
    document.getElementById('contactPhone').textContent  = seller.phone || 'Not provided';
    document.getElementById('contactAvatar').textContent =
      (seller.name || seller.firstName || '?').charAt(0).toUpperCase();

    openModal('contactModal');

  } catch (error) {
    console.error('Show contact error:', error);
    showToast('Could not load seller contact', 'error');
  }
};


// ── WITHDRAW BID ─────────────────────────────────────────────────
// Buyer changes their mind — cancel the offer.
// Updates the offer status to 'rejected' in Firestore.

window.withdrawBid = async function(offerId) {
  if (!confirm('Withdraw this offer?')) return;

  try {
    // updateDoc updates specific fields of an existing document
    // doc(db, 'offers', offerId) → points to the specific offer document
    await updateDoc(doc(db, 'offers', offerId), {
      status: 'rejected'
    });
    showToast('Bid withdrawn', 'info');
    // The onSnapshot listener will automatically re-render the list

  } catch (error) {
    console.error('Withdraw error:', error);
    showToast('Failed to withdraw bid', 'error');
  }
};


// ── REMOVE BID (from view) ────────────────────────────────────────
// For rejected bids the buyer wants to clean up.
// Permanently deletes the offer document from Firestore.

window.removeBid = async function(offerId) {
  try {
    await deleteDoc(doc(db, 'offers', offerId));
    showToast('Removed from your bids', 'info');
    // onSnapshot auto-removes it from the rendered list

  } catch (error) {
    console.error('Remove bid error:', error);
    showToast('Failed to remove bid', 'error');
  }
};


// ── INIT ─────────────────────────────────────────────────────────
function waitForUserThenLoad() {
  if (window.currentUser) {
    loadMyBids();
  } else {
    setTimeout(waitForUserThenLoad, 200);
  }
}

document.addEventListener('DOMContentLoaded', waitForUserThenLoad);
