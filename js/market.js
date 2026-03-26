// ═══════════════════════════════════════════════════════════════
// js/market.js — MARKETPLACE PAGE
// Handles: Fetching listings, search, filter, item detail, offers
// Used by: marketplace.html
// ═══════════════════════════════════════════════════════════════

import { db } from './firebase.js';

// Firestore functions we need:
import {
  collection,  // points to a collection (like a table)
  query,       // builds a database query
  where,       // adds a filter condition to a query
  orderBy,     // sorts results
  getDocs,     // fetches documents (one-time read)
  onSnapshot,  // listens for real-time updates
  addDoc,      // adds a new document with auto-generated ID
  serverTimestamp  // gets the server's current timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── STATE ───────────────────────────────────────────────────────
// These variables track the current state of the page
let allListings    = [];   // all active listings fetched from Firestore
let activeCategory = 'All'; // currently selected category chip
let currentItem    = null;  // the item currently open in the detail modal


// ── FETCH LISTINGS (REAL-TIME) ───────────────────────────────────
// onSnapshot is more powerful than getDocs.
// getDocs = reads once and stops.
// onSnapshot = reads AND keeps listening for changes.
//
// So if Seller A marks an item as sold while Buyer B is browsing,
// Buyer B's marketplace AUTOMATICALLY updates and the item disappears.
// No page refresh needed. This is Firestore's "real-time" superpower.

function loadListings() {
  // Build the query:
  // collection(db, 'listings') → the 'listings' collection in Firestore
  // where('status', '==', 'active') → only show items that are still for sale
  // orderBy('createdAt', 'desc') → newest items first
  const q = query(
    collection(db, 'listings'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );

  // onSnapshot runs IMMEDIATELY with current data,
  // then runs AGAIN every time data changes in Firestore
  onSnapshot(q, (snapshot) => {
    // snapshot.docs is an array of document snapshots
    // .map() converts each snapshot into a plain JS object
    // doc.data() gives the document's field values
    // doc.id gives the auto-generated document ID
    allListings = snapshot.docs.map(doc => ({
      id: doc.id,      // Firestore document ID (e.g. "abc123xyz")
      ...doc.data()    // spread all fields: title, price, seller, etc.
    }));

    // Re-render the cards with the fresh data
    filterAndRender();
  });
}


// ── FILTER + RENDER CARDS ────────────────────────────────────────
// Called whenever: search input changes, category chip changes,
// or new data arrives from Firestore

function filterAndRender() {
  const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';

  const filtered = allListings.filter(item => {
    // Category filter: show all if 'All', or match specific category
    const matchCategory = activeCategory === 'All' || item.category === activeCategory;

    // Search filter: check if title or description contains the search text
    const matchSearch =
      item.title.toLowerCase().includes(searchQuery) ||
      item.description.toLowerCase().includes(searchQuery);

    return matchCategory && matchSearch;
  });

  renderCards(filtered);
}


// ── RENDER ITEM CARDS ────────────────────────────────────────────
// Takes an array of listing objects and builds the card HTML

function renderCards(items) {
  const grid = document.getElementById('cardGrid');
  const countEl = document.getElementById('itemCount');

  // Update the "X listings found" counter
  if (countEl) countEl.textContent = `${items.length} listing${items.length !== 1 ? 's' : ''} found`;

  if (!items.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 0;color:var(--txt-3);">
        <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px;">search_off</span>
        No listings found
      </div>`;
    return;
  }

  // Build each card's HTML
  grid.innerHTML = items.map(item => `
    <article class="card item-card" onclick="openDetail('${item.id}')">
      <div class="item-card-img">
        <img src="${item.images?.[0] || 'https://via.placeholder.com/400x225?text=No+Image'}"
             alt="${item.title}" loading="lazy"/>
        <span class="badge-img badge-img-left">${item.category}</span>
        <span class="badge-img badge-img-right">
          ${item.sellingType === 'offers' ? 'Open to Offers' : 'Fixed Price'}
        </span>
      </div>
      <div class="item-card-body">
        <div class="item-card-title">${item.title}</div>
        <div class="item-card-desc">${item.description}</div>
        <div class="txt-price" style="margin-bottom:10px;">
          ₹${Number(item.price).toLocaleString('en-IN')}
        </div>
        <div class="item-card-footer">
          <div class="item-card-seller">
            <span class="material-symbols-outlined" style="font-size:14px;">person</span>
            <span>${item.sellerName} · ${formatTime(item.createdAt)}</span>
          </div>
          <button class="btn btn-outline btn-sm">View Details</button>
        </div>
      </div>
    </article>
  `).join('');
}


// ── OPEN ITEM DETAIL MODAL ───────────────────────────────────────
// Called when a card is clicked. Fills the modal with item data.

window.openDetail = function(itemId) {
  // Find the item in our local allListings array
  currentItem = allListings.find(i => i.id === itemId);
  if (!currentItem) return;

  // Fill modal fields
  document.getElementById('detailImg').src = currentItem.images?.[0] || '';
  document.getElementById('detailTitle').textContent = currentItem.title;
  document.getElementById('detailPrice').textContent = `₹${Number(currentItem.price).toLocaleString('en-IN')}`;
  document.getElementById('detailCat').textContent   = currentItem.category;
  document.getElementById('detailDesc').textContent  = currentItem.description;
  document.getElementById('detailSellerName').textContent = currentItem.sellerName;
  document.getElementById('detailPosted').textContent     = formatTime(currentItem.createdAt);
  document.getElementById('detailSellerAv').textContent   = currentItem.sellerName?.charAt(0) || '?';

  // Reset offer form
  document.getElementById('offerForm')?.classList.remove('open');
  document.getElementById('offerPrice') && (document.getElementById('offerPrice').value = '');
  document.getElementById('offerMsg')   && (document.getElementById('offerMsg').value = '');

  // Show different action button based on selling type
  const actionsEl = document.getElementById('detailActions');

  // Don't show buy/offer button on your OWN listing
  if (currentItem.sellerId === window.currentUser?.uid) {
    actionsEl.innerHTML = `
      <div style="text-align:center;padding:10px;background:var(--bg-input);border-radius:var(--r);">
        <p style="font-size:13px;color:var(--txt-3);">This is your listing</p>
      </div>`;
  } else if (currentItem.sellingType === 'fixed') {
    // Fixed price: just show the seller's email
    actionsEl.innerHTML = `
      <button class="btn btn-primary btn-full"
        onclick="showToast('Seller email: ${currentItem.sellerEmail}', 'info')">
        <span class="material-symbols-outlined">mail</span>
        Contact Seller
      </button>`;
  } else {
    // Open to offers: show "Make an Offer" button
    actionsEl.innerHTML = `
      <button class="btn btn-primary btn-full"
        onclick="document.getElementById('offerForm').classList.add('open')">
        <span class="material-symbols-outlined">local_offer</span>
        Make an Offer
      </button>`;
  }

  openModal('detailModal');
};


// ── SUBMIT OFFER ─────────────────────────────────────────────────
// Called when buyer clicks "Submit Offer" in the detail modal.
// Creates a new document in the 'offers' collection in Firestore.

window.submitOffer = async function() {
  const offerPriceInput = document.getElementById('offerPrice');
  const offerMsgInput   = document.getElementById('offerMsg');

  const offerPrice = offerPriceInput?.value;
  const offerMsg   = offerMsgInput?.value || '';

  // 1. Basic Validation
  if (!offerPrice || offerPrice <= 0) {
    showToast('Please enter a valid offer price', 'error');
    return;
  }

  if (!window.currentUser || !window.currentProfile) {
    showToast('You must be logged in to make an offer', 'error');
    return;
  }

  const btn = document.querySelector('#offerForm .btn-primary');
  btn.textContent = 'Checking existing bids...';
  btn.disabled = true;

  try {
    // ─── NEW: ANTI-SPAM CHECK ──────────────────────────────────────
    // Check if this specific buyer already has a 'pending' or 'accepted' 
    // offer for this specific item.
    const qCheck = query(
      collection(db, 'offers'),
      where('listingId', '==', currentItem.id),
      where('buyerId', '==', window.currentUser.uid),
      where('status', 'in', ['pending', 'accepted']) // Check both states
    );

    const existingSnap = await getDocs(qCheck);

    if (!existingSnap.empty) {
      showToast('You already have a deal in progress for this item!', 'error');
      btn.textContent = 'Submit Offer';
      btn.disabled = false;
      return;
    }
    // ──────────────────────────────────────────────────────────────

    btn.textContent = 'Submitting...';

    // 2. Add the new document
    await addDoc(collection(db, 'offers'), {
      listingId:    currentItem.id,
      listingTitle: currentItem.title,
      sellerId:     currentItem.sellerId,
      sellerName:   currentItem.sellerName,
      buyerId:      window.currentUser.uid,
      buyerName:    window.currentProfile.name,
      buyerEmail:   window.currentUser.email,
      offerPrice:   Number(offerPrice),
      message:      offerMsg,
      status:       'pending',
      createdAt:    serverTimestamp()
    });

    showToast(`Offer of ₹${Number(offerPrice).toLocaleString('en-IN')} submitted!`, 'success');
    closeModal('detailModal');

  } catch (error) {
    console.error('Offer error:', error);
    showToast('Failed to submit offer.', 'error');
  } finally {
    btn.textContent = 'Submit Offer';
    btn.disabled = false;
  }
};


// ── CHIP FILTER ──────────────────────────────────────────────────
window.setChip = function(el, category) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  activeCategory = category;
  filterAndRender();
};

// Search input handler
window.filterCards = filterAndRender;


// ── HELPER: FORMAT TIMESTAMP ─────────────────────────────────────
// Firestore stores timestamps as special objects.
// This converts them to human-readable strings like "2h ago".

function formatTime(timestamp) {
  if (!timestamp) return 'recently';

  // Firestore Timestamp objects have a .toDate() method
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  const diffMs = now - date;
  const diffMins  = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays  = Math.floor(diffMs / 86400000);

  if (diffMins  < 60)  return `${diffMins}m ago`;
  if (diffHours < 24)  return `${diffHours}h ago`;
  if (diffDays  < 7)   return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN');
}


// ── INIT: Run when page loads ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadListings();
});
