// ═══════════════════════════════════════════════════════════════
// js/listings.js — YOUR LISTINGS PAGE
// Handles: Publish listing, upload images, view offers, accept offer
// Used by: listings.html
// ═══════════════════════════════════════════════════════════════

import { db, storage } from './firebase.js';

// Firestore functions
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch   // lets us update multiple documents at once atomically
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Storage functions (for uploading images)
import {
  ref,           // creates a reference to a file location in Storage
  uploadBytes,   // uploads a file
  getDownloadURL // gets the public URL of an uploaded file
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";


// ── STATE ───────────────────────────────────────────────────────
let myListings   = [];    // seller's own listings
let sellingType  = 'fixed'; // currently selected selling type toggle
let uploadedFiles = [];   // files selected for upload (max 3)


// ── TOGGLE: Fixed Price / Open to Offers ─────────────────────────
window.setToggle = function(type) {
  sellingType = type;
  document.getElementById('togFixed').classList.toggle('active',  type === 'fixed');
  document.getElementById('togOffers').classList.toggle('active', type === 'offers');
};


// ── IMAGE PREVIEW ────────────────────────────────────────────────
// When user selects files, show small previews before uploading

window.previewImages = function(input) {
  const container = document.getElementById('previews');
  container.innerHTML = '';
  uploadedFiles = Array.from(input.files).slice(0, 3); // max 3 images

  uploadedFiles.forEach((file, i) => {
    const reader = new FileReader();
    // FileReader reads the file locally (in browser memory, no upload yet)
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'upload-preview-item';
      div.innerHTML = `
        <img src="${e.target.result}" alt="Preview"/>
        <div class="upload-preview-remove" onclick="removePreview(${i})">✕</div>`;
      container.appendChild(div);
    };
    reader.readAsDataURL(file); // converts image to base64 data URL for preview
  });
};

window.removePreview = function(index) {
  uploadedFiles.splice(index, 1);
  // Re-trigger preview with remaining files
  const dt = new DataTransfer();
  uploadedFiles.forEach(f => dt.items.add(f));
  document.getElementById('fileInput').files = dt.files;
  window.previewImages(document.getElementById('fileInput'));
};


// ── UPLOAD IMAGES TO FIREBASE STORAGE ────────────────────────────
// Takes the selected files and uploads them to Firebase Storage.
// Returns an array of download URLs (public links to the images).

async function uploadImages(userId) {
  const urls = [];

  for (const file of uploadedFiles) {
    // Create a unique path for each image in Storage:
    // listings/{userId}/{timestamp}_{filename}
    // This organises images by seller and prevents name collisions
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `listings/${userId}/${fileName}`;

    // ref() creates a "pointer" to where we want to store the file
    const storageRef = ref(storage, filePath);

    // uploadBytes() actually sends the file to Firebase Storage
    const snapshot = await uploadBytes(storageRef, file);

    // getDownloadURL() returns the public HTTPS URL to access the image
    const url = await getDownloadURL(snapshot.ref);
    urls.push(url);
  }

  return urls; // e.g. ["https://firebasestorage.googleapis.com/..."]
}


// ── PUBLISH LISTING ──────────────────────────────────────────────
// Called when seller clicks "Publish Listing".
// Uploads images then saves the listing to Firestore.

window.publishListing = async function() {
  // Read all form values
  const title       = document.getElementById('fTitle').value.trim();
  const category    = document.getElementById('fCat').value;
  const condition   = document.getElementById('fCond').value;
  const description = document.getElementById('fDesc').value.trim();
  const price       = document.getElementById('fPrice').value;

  // Validate
  if (!title)       { showToast('Please enter a product title', 'error'); return; }
  if (!category)    { showToast('Please select a category', 'error'); return; }
  if (!condition)   { showToast('Please select item condition', 'error'); return; }
  if (!description) { showToast('Please describe your item', 'error'); return; }
  if (!price || price <= 0) { showToast('Please enter a valid price', 'error'); return; }

  // Ensure user is logged in (guard.js sets window.currentUser)
  if (!window.currentUser) {
    showToast('You must be logged in', 'error');
    return;
  }

  // Show loading state
  const btn = document.querySelector('button[onclick="publishListing()"]');
  btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Uploading...';
  btn.disabled = true;

  try {
    // Step 1: Upload images to Firebase Storage (if any selected)
    let imageUrls = [];
    if (uploadedFiles.length > 0) {
      showToast('Uploading images...', 'info');
      imageUrls = await uploadImages(window.currentUser.uid);
    }

    // Step 2: Save listing document to Firestore
    // addDoc auto-generates a unique ID for the listing
    await addDoc(collection(db, 'listings'), {
      // Item details
      title:       title,
      category:    category,
      condition:   condition,
      description: description,
      price:       Number(price),
      sellingType: sellingType,   // 'fixed' or 'offers'
      images:      imageUrls,     // array of image URLs from Storage

      // Seller details (from the logged-in user)
      sellerId:    window.currentUser.uid,
      sellerName:  window.currentProfile?.name || 'Unknown',
      sellerEmail: window.currentUser.email,

      // Status — 'active' means visible on marketplace
      // When sold: changes to 'sold'
      status:    'active',
      buyerId:   null,     // no buyer yet
      soldAt:    null,     // not sold yet

      createdAt: serverTimestamp()
    });

    showToast('Your listing is now live on the marketplace! 🎉', 'success');

    // Clear the form
    document.getElementById('fTitle').value       = '';
    document.getElementById('fCat').value         = '';
    document.getElementById('fCond').value        = '';
    document.getElementById('fDesc').value        = '';
    document.getElementById('fPrice').value       = '';
    document.getElementById('previews').innerHTML = '';
    uploadedFiles = [];

  } catch (error) {
    console.error('Publish error:', error);
    showToast('Failed to publish. Please try again.', 'error');
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined">publish</span> Publish Listing';
    btn.disabled = false;
  }
};


// ── LOAD MY LISTINGS (REAL-TIME) ─────────────────────────────────
// Fetches only the listings that belong to the logged-in seller.

function loadMyListings() {
  const user = window.currentUser;
  if (!user) return;

  // Query: listings WHERE sellerId == my UID, ordered by newest first
  const q = query(
    collection(db, 'listings'),
    where('sellerId', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  // onSnapshot: real-time listener
  onSnapshot(q, (snapshot) => {
    myListings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMyListings();
  });
}


// ── RENDER MY LISTINGS GRID ──────────────────────────────────────
function renderMyListings() {
  const grid = document.getElementById('myListingsGrid');

  if (!myListings.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--txt-3);">
        <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;">inventory_2</span>
        No listings yet. List your first item above!
      </div>`;
    return;
  }

  grid.innerHTML = myListings.map(item => {
    const isSold = item.status === 'sold';
    
    // The Logic: If sold, show Relist button. If active, show View Offers.
    const actionButton = isSold 
      ? `<button class="btn btn-outline btn-sm" style="width:100%; margin-top:10px; border-color:var(--danger); color:var(--danger);" 
                 onclick="event.stopPropagation(); relistListing('${item.id}')">
           <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">refresh</span> 
           Relist (Dispute)
         </button>`
      : `<button class="btn btn-primary btn-sm" style="width:100%; margin-top:10px;" 
                 onclick="event.stopPropagation(); openOffersDialog('${item.id}')">
           View Offers
         </button>`;

    return `
      <article class="card" style="${isSold ? 'opacity:.75;' : ''}">
        <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--bg-input);">
          <img src="${item.images?.[0] || 'https://via.placeholder.com/300x225?text=No+Image'}"
               alt="${item.title}" loading="lazy"
               style="width:100%;height:100%;object-fit:cover;${isSold ? 'filter:grayscale(.8)' : ''}"/>
          
          <span class="badge-img badge-img-left ${isSold ? 'badge-sold' : 'badge-active'}" 
                style="background:${isSold ? 'var(--danger)' : 'var(--success)'}">
            ${isSold ? 'Sold' : 'Active'}
          </span>

          <div style="position:absolute;bottom:8px;right:8px;background:rgba(15,15,20,.88);
                      padding:4px 10px;border-radius:var(--r-sm);backdrop-filter:blur(8px);">
            <span class="txt-price" style="font-size:14px;">
              ₹${Number(item.price).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
        <div style="padding:10px 12px;">
          <div class="item-card-title">${item.title}</div>
          <div class="txt-muted" style="margin-top:3px; font-size:12px;">
            ${item.category} · ${isSold ? 'Deal Closed' : 'Accepting Bids'}
          </div>
          ${actionButton}
        </div>
      </article>`;
  }).join('');


  // For each active listing, fetch offer count to show badge
  myListings.forEach(item => {
    if (item.status === 'active') fetchOfferCount(item.id);
  });
}


// ── FETCH OFFER COUNT ────────────────────────────────────────────
// Gets how many pending offers exist for a listing
// and adds an orange badge to the card

async function fetchOfferCount(listingId) {
  const { getDocs } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  const q = query(
    collection(db, 'offers'),
    where('listingId', '==', listingId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  // We can't easily add badges dynamically here without tracking DOM elements
  // This is a placeholder — in a full build you'd use offer subcollections
}


// ── OPEN OFFERS DIALOG ───────────────────────────────────────────
// Called when seller clicks on one of their listing cards.
// Fetches all pending offers for that listing from Firestore.

window.openOffersDialog = async function(listingId) {
  const item = myListings.find(i => i.id === listingId);
  if (!item) return;

  // Fill dialog header
  document.getElementById('offerModalTitle').textContent = item.title;
  document.getElementById('offerModalPrice').textContent =
    `Asking price: ₹${Number(item.price).toLocaleString('en-IN')}`;

  const list = document.getElementById('offersList');
  list.innerHTML = `<p style="color:var(--txt-3);text-align:center;padding:20px;">Loading offers...</p>`;

  openModal('offersModal');

  try {
    // Fetch all PENDING offers for this specific listing
    const { getDocs } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );
    const q = query(
      collection(db, 'offers'),
      where('listingId', '==', listingId),
      where('status', '==', 'pending'),
      where('sellerId', '==', window.currentUser.uid),
      orderBy('offerPrice', 'desc') // highest offer first
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `
        <div style="text-align:center;padding:32px 0;color:var(--txt-3);">
          <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;">inbox</span>
          No offers yet
        </div>`;
      return;
    }

    // Render each offer row
    const offers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.innerHTML = offers.map(offer => `
      <div class="offer-row" id="offer-${offer.id}">
        <div class="offer-avatar">${offer.buyerName?.charAt(0) || '?'}</div>
        <div class="offer-info">
          <div class="offer-name">${offer.buyerName}</div>
          <div class="offer-msg">${offer.message || 'No message'}</div>
        </div>
        <div class="offer-price">₹${Number(offer.offerPrice).toLocaleString('en-IN')}</div>
        <button class="btn btn-success btn-sm"
                onclick="acceptOffer('${listingId}', '${offer.id}', '${offer.buyerId}', '${offer.buyerName}')">
          Accept
        </button>
      </div>
    `).join('');

  } catch (error) {
    console.error('Fetch offers error:', error);
    list.innerHTML = `<p style="color:var(--danger);text-align:center;">Failed to load offers.</p>`;
  }
};


// ── ACCEPT OFFER ─────────────────────────────────────────────────
// The most important seller action.
// When seller clicks Accept, we need to:
// 1. Update the listing status to 'sold'
// 2. Set the listing's buyerId to the accepted buyer
// 3. Set the accepted offer status to 'accepted'
// 4. Set ALL other pending offers on this listing to 'rejected'
//
// We use writeBatch() to do all of this in ONE atomic operation.
// "Atomic" means: either ALL changes succeed, or NONE do.
// No half-updated state.

window.acceptOffer = async function(listingId, offerId, buyerId, buyerName) {
  const confirmed = confirm(`Accept offer from ${buyerName}?`);
  if (!confirmed) return;

  const btn = document.getElementById(`offer-${offerId}`)?.querySelector('.btn-success');
  if (btn) { btn.disabled = true; btn.textContent = 'Finalizing...'; }

  try {
    const batch = writeBatch(db);

    // 1. Mark the LISTING as sold
    const listingRef = doc(db, 'listings', listingId);
    batch.update(listingRef, {
      status: 'sold',
      buyerId: buyerId,
      soldAt: serverTimestamp()
    });

    // 2. Mark the WINNING offer (Abhinav) as accepted
    const acceptedOfferRef = doc(db, 'offers', offerId);
    batch.update(acceptedOfferRef, { status: 'accepted' });

    // 3. FETCH & REJECT ALL OTHERS (Satyam, etc.)
    // We do this INSIDE the same process to ensure Satyam is updated
    const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const otherOffersSnap = await getDocs(query(
      collection(db, 'offers'),
      where('listingId', '==', listingId),
      where('status', '==', 'pending'),
      where('sellerId', '==', window.currentUser.uid)
    ));

    otherOffersSnap.docs.forEach(offerDoc => {
      // If it's not the one we just accepted, it MUST be rejected
      if (offerDoc.id !== offerId) {
        batch.update(offerDoc.ref, { status: 'rejected' });
      }
    });

    // 4. COMMIT EVERYTHING
    // This is the "Atomic" part. All updates happen at once.
    await batch.commit();

    showToast(`Deal closed! Other bidders have been notified.`, 'success');
    closeModal('offersModal');

  } catch (error) {
    console.error('Accept offer error:', error);
    showToast('Failed to close deal. Check your console.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Accept'; }
  }
};


// ── DELETE LISTING ────────────────────────────────────────────────
window.deleteListing = async function(listingId) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;

  try {
    await deleteDoc(doc(db, 'listings', listingId));
    showToast('Listing deleted', 'info');
  } catch (error) {
    showToast('Failed to delete listing', 'error');
  }
};

window.relistListing = async function(listingId) {
  if (!confirm("Relist and clear all old bids?")) return;

  try {
    const batch = writeBatch(db);

    // 1. Reset the Listing
    batch.update(doc(db, 'listings', listingId), {
      status: 'active',
      buyerId: null,
      soldAt: null
    });

    // 2. Clear the "Accepted" status from the previous winner
    // This ensures no one thinks they still have a deal.
    const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const q = query(
      collection(db, 'offers'), 
      where('listingId', '==', listingId),
      where('sellerId', '==', window.currentUser.uid)
    );
    const snap = await getDocs(q);
    
    snap.docs.forEach(offerDoc => {
      // Set everyone back to 'rejected' or 'pending' so the seller starts fresh
      batch.update(offerDoc.ref, { status: 'rejected' });
    });

    await batch.commit();
    showToast('Relisted! All previous bids cleared.', 'success');

  } catch (error) {
    console.error("Relist Batch Error:", error);
    showToast('Relist failed.', 'error');
  }
};

// ── INIT ─────────────────────────────────────────────────────────
// Wait for guard.js to finish auth check before loading data.
// guard.js sets window.currentUser — we poll until it's ready.

function waitForUserThenLoad() {
  if (window.currentUser) {
    loadMyListings();
  } else {
    // Check again in 200ms — guard.js is still working
    setTimeout(waitForUserThenLoad, 200);
  }
}

document.addEventListener('DOMContentLoaded', waitForUserThenLoad);
