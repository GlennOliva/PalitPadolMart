# Phase 9 — Manual Browser Test Checklist

Run these flows against the local dev server (`npm run dev`) using the
confirmed Phase 7/8/9 test accounts (the same ones used by
`verify-phase9.mjs`; their credentials live in the gitignored `.env.local`).
Automated coverage already exists for the DB boundaries (`verify-phase9.mjs`)
and the UI wiring (`tests/unit/*`); this checklist validates the in-browser
journey a real user experiences.

**Accounts** (use separate/incognito windows):

| Window  | Account                          |
| ------- | -------------------------------- |
| 1       | `PHASE7_TEST_SELLER_EMAIL`       |
| 2       | `PHASE7_TEST_BUYER_EMAIL`        |
| 3 (optional) | `PHASE8_TEST_BUYER_B_EMAIL` / `PHASE8_TEST_SELLER_B_EMAIL` |

## 0. Pre-flight

- [ ] `npm run dev` starts and loads `http://localhost:5173` ("Buy. Sell. Play Better.").
- [ ] Sign in as the buyer in window 2 and as the seller in window 1.
- [ ] As the seller, open Seller Dashboard → Payment methods and confirm the
      three methods render with their saved instructions.

## 1. Manual transfer + delivery (happy path)

Payment is only possible on a **confirmed** order (the buyer payment panel
opens only for `Confirmed`; the proof-upload Storage RLS and `submit_payment`
both require it). If the order is still `Pending`, a proof upload is correctly
refused and the UI shows a safe error — never raw database text.

1. Buyer window: open a listing from the seller (ensure the seller offers
   delivery), add to cart, check out with **delivery**.
2. Seller window: open Incoming orders → the new order and **Confirm order** so
   it reaches `Confirmed`.
3. Buyer order detail: pick **Manual transfer**; attach a small PNG/JPG proof
   and a reference; fill in all delivery-address fields; **Submit payment
   details**. Expect the success alert and status `Confirmed`.
4. Seller window: reload the order. Expect a **Submitted** payment badge with
   the proof thumbnail, reference, and amount.
5. Seller clicks **Approve payment**. Expect the order to show `Paid` and the
   fulfillment panel to appear.
6. Seller clicks **Start preparation** → status `Preparing`.
7. Seller clicks **Mark as shipped**, enters courier + tracking, submits.
   Expect status `Shipped` and the tracking details on both the seller and
   buyer views.
8. Buyer window: click **Confirm received** → confirm. Expect status
   `Completed` in both windows and the timeline fully marked.

## 2. Rejection → resubmit (manual transfer)

1. Buyer submits a manual-transfer payment (Section 1 steps 1–2) or resubmits.
2. Seller clicks **Reject**, leaves the reason empty → expect the inline error
   "A reason is required…" with **no** API call (form uses `noValidate` now).
3. Seller enters a reason and confirms. Buyer window must show the reason and
   a **Submit corrected payment** button.
4. Buyer re-uploads a new proof and submits. Seller sees `Submitted` again and
   can approve.

## 3. Cash on pickup

1. Create a buyer order with **pickup**; the seller confirms it so the
   payment panel opens.
2. Buyer: in Payment, expect **Cash on pickup** preselected and no
   proof/address fields.
3. Submit payment → expect the "payment will be collected at the handoff"
   notice, payment `Pending`, fulfillment details showing the seller's pickup
   location/instructions.
4. Seller: **Start preparation** → **Mark ready for pickup**.
5. Before the handoff, there must be **no** "Mark cash received" button jumping
   the gun; once `Ready for pickup` it appears → click it → expect `Paid`.
6. Buyer: **Confirm received** → `Completed`.

## 4. Cash on delivery

1. Create a delivery order where the seller has **Cash on delivery** enabled;
   the seller confirms it so the payment panel opens.
2. Buyer selects it (or it is preselected), fills the address, submits
   (no proof). Payment `Pending`, order `Confirmed`.
3. Seller: **Start preparation** → **Mark as shipped** (tracking required).
   The cash collection button appears only after `Shipped`.
4. Seller marks cash received; buyer confirms received → `Completed`.

## 5. Method visibility + proof guards (UI)

- As seller, disable **Manual transfer** in Payment methods. Reload the buyer's
  confirmed unpaid order → Manual transfer must be hidden (only enabled
  methods listed). Re-enable it afterwards.
- On a manual-transfer submit, try: no proof (error "Upload your payment proof
  to submit."), an oversized file (> 5 MB, "must be a JPG, PNG, WebP, or PDF."
  / upload error), and a non-image type.
- A proof upload refused by Storage (e.g. because the order is not yet
  `Confirmed`) must show the safe copy "We could not upload your proof. Please
  check the order and try again." — never raw database/RLS text.
- Leave a delivery order's address blank → each required field shows
  "… is required." and nothing is submitted until all are filled.

## 6. Multi-seller independence (optional)

- With Buyer B / Seller B set up: Seller A must NOT see Seller B's orders in
  Incoming orders, and attempting Shopify/URL access to Seller B's order detail
  must show "Order not found". Their fulfillment actions must never move the
  other store's order (each order detail page shows only its own actions).

## 7. Cancellation sanity (regression)

- As buyer, place an order and **Cancel order** (confirm). Expect order
  `Cancelled`, items back in stock, and **Remove from history** available.
- As seller, confirm a pending order only after the confirm dialog — the
  cancel/confirm buttons must require the two-step confirm.

## Report back

Mark each box ✅/❌ (with the failing step + console errors if any). I'll
fold the results into the final Phase 9 build report.