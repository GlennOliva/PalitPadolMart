# PALITPADDLEBAI MART

## MASTER DEVELOPMENT SOP & OPENCODE BUILD PROMPT

**Project Name:** PalitPaddleBai Mart
**System Type:** Web-Based Pickleball Marketplace
**Primary Stack:** React + TypeScript + Supabase
**Development Assistant:** OpenCode
**Database:** Supabase PostgreSQL
**Authentication:** Supabase Auth
**File/Image Storage:** Supabase Storage
**Frontend:** React + TypeScript
**Recommended Build Tool:** Vite
**Architecture:** Supabase-first architecture
**ORM:** None. Do not use Prisma unless specifically instructed later.

---

# 1. YOUR ROLE

You are the senior software engineer, system architect, database engineer, UI/UX developer, QA engineer, and technical documentation specialist responsible for building **PalitPaddleBai Mart**.

Your job is to transform this specification into a complete, secure, maintainable, production-ready web application.

You must work methodically.

Do not immediately build random pages.

Follow the development phases described in this document.

For every phase:

1. Inspect the existing project.
2. Understand existing architecture.
3. Create an implementation plan.
4. Identify affected files.
5. Identify database changes.
6. Implement the feature.
7. Add required security controls.
8. Add loading/error/empty states.
9. Add tests.
10. Run validation commands.
11. Fix discovered problems.
12. Document what was completed.
13. Report remaining blockers.
14. Do not start dependent features until their foundation works.

Never claim something works without testing or verifying it.

---

# 2. CORE DEVELOPMENT RULES

These rules are mandatory throughout development.

## 2.1 Technology Rules

Use:

* React
* TypeScript
* Vite
* Supabase PostgreSQL
* Supabase Auth
* Supabase Storage
* Supabase JavaScript client
* React Router
* A maintainable React state/query architecture
* CSS architecture suitable for a scalable responsive application
* Accessible reusable UI components

You may use a library such as TanStack Query for server-state management if appropriate.

Do NOT introduce:

* Prisma
* Firebase
* MongoDB
* another database
* another authentication provider
* unnecessary backend frameworks

unless specifically requested.

Supabase must remain the primary backend platform.

---

# 3. PROJECT OBJECTIVE

Build a centralized marketplace where pickleball players can buy and sell:

* Pickleball paddles
* Balls
* Bags
* Shoes
* Apparel
* Accessories
* Grips
* Nets
* Training equipment
* Other pickleball equipment

Products may be either:

* New
* Used

The platform must support buyers, sellers, administrators, marketplace transactions, recommendations, reviews, complaints, moderation, reporting, and analytics.

The platform should especially make purchasing pickleball paddles easier for beginner and intermediate players through a personalized **Paddle Recommendation System**.

---

# 4. SYSTEM USER ROLES

The application must support the following roles.

## Guest

Can:

* Browse marketplace products
* Search products
* Apply product filters
* View product details
* View seller public profiles
* View ratings
* Register
* Log in

A guest cannot:

* Favorite products
* Send inquiries
* Create orders
* Submit reviews
* Create listings
* Access private dashboards

---

## Buyer

Can:

* Manage profile
* Upload profile image
* Browse products
* Search products
* Filter products
* Save products
* Receive paddle recommendations
* Contact sellers
* Place orders
* Select pickup or delivery
* View orders
* Track transaction status
* View payment status
* View transaction history
* Complete purchases
* Review sellers/products after completed transactions
* Submit marketplace complaints/disputes
* Receive notifications

---

## Seller

A seller is also a registered user.

Seller capabilities include:

* Seller registration/onboarding
* Seller profile
* Create listings
* Upload multiple product photos
* Edit listings
* Delete/archive listings
* Manage stock
* Mark listings as sold
* Receive buyer inquiries
* Receive marketplace orders
* Confirm orders
* Reject orders
* Update order preparation
* Mark item as shipped
* Mark item ready for pickup
* Review sales
* Review seller rating
* View seller analytics
* View transaction history
* Receive notifications

---

## Administrator

Administrators can:

* Manage users
* Manage sellers
* Suspend accounts
* Reinstate accounts
* Manage marketplace listings
* Remove listings
* Manage categories
* Manage brands
* Moderate reviews
* Review reports
* Review complaints
* Manage disputes
* Resolve disputes
* View orders
* Review marketplace activity
* View analytics dashboards
* Generate reports
* Review moderation history
* View audit logs

Admin privileges must never depend only on hiding frontend components.

Authorization must be enforced through database policies and secure operations.

---

# 5. MAJOR SYSTEM MODULES

PalitPaddleBai Mart must contain the following main modules:

1. Authentication
2. User Management
3. Seller Management
4. Marketplace Catalog
5. Search and Discovery
6. Paddle Recommendation
7. Favorites
8. Buyer/Seller Inquiry
9. Orders
10. Payment Status
11. Delivery/Pickup Management
12. Inventory Management
13. Transaction History
14. Reviews and Ratings
15. Complaints and Disputes
16. Notifications
17. Marketplace Moderation
18. Administrator Management
19. Reports
20. Analytics

---

# 6. AUTHENTICATION REQUIREMENTS

Use Supabase Auth.

Required features:

* User registration
* Email/password login
* Logout
* Password reset
* Password update
* Persistent authenticated session
* Protected routes
* User profile linked to auth.users
* Role-aware navigation
* Role-aware route protection

Never expose the Supabase service-role key in frontend code.

Only public Supabase credentials intended for browser use may exist in frontend environment variables.

Create an `.env.example`.

Never commit real secrets.

---

# 7. USER MANAGEMENT SUBSYSTEM

Users must be able to:

1. Register an account
2. Log in
3. Log out
4. Reset their password
5. Update their profile
6. Upload a profile image
7. Update contact information
8. Configure account preferences
9. View transaction history
10. View notification history
11. Manage favorites
12. Manage seller status if applicable

Suggested profile information:

* First name
* Last name
* Display name
* Username if required
* Email
* Phone
* Profile image
* City
* Province/region
* Account status
* Role
* Created date
* Updated date

Do not duplicate authentication passwords inside application tables.

Authentication credentials remain managed by Supabase Auth.

---

# 8. SELLER MANAGEMENT SUBSYSTEM

A user must be able to register as a seller.

Seller registration should include:

* Store/seller display name
* Description
* Profile image/logo
* Location
* Contact preference
* Pickup availability
* Delivery availability

Seller states should support:

* Pending
* Active
* Suspended
* Rejected

Administrators should be able to moderate seller accounts.

Seller dashboard should show:

* Active listings
* Draft listings
* Sold products
* Pending orders
* Confirmed orders
* Completed orders
* Cancelled orders
* Revenue/transaction value
* Average rating
* Total reviews
* Listing views
* Favorite counts
* Inquiry counts

---

# 9. MARKETPLACE CATALOG SUBSYSTEM

Marketplace listings must support:

* Product title
* Description
* Category
* Brand
* Condition
* Price
* Quantity
* Seller
* Product photos
* Pickup/delivery availability
* Location
* Product status
* Date created
* Date updated

Conditions:

* New
* Used

Recommended listing statuses:

* Draft
* Active
* Reserved
* Sold
* Archived
* Removed

A listing must not appear publicly when:

* Draft
* Removed
* Archived

unless explicitly required.

---

# 10. PRODUCT IMAGE MANAGEMENT

Use Supabase Storage.

Create dedicated storage buckets where appropriate.

Recommended bucket:

`marketplace-products`

Optionally:

`avatars`

Each product must support multiple images.

Required functionality:

* Upload image
* Preview image
* Remove image
* Reorder images
* Choose primary image
* Validate file type
* Validate file size
* Handle upload errors
* Prevent unauthorized users from modifying another seller's images

Database records should reference the uploaded images.

Do not store raw image binary data inside PostgreSQL tables.

---

# 11. CATEGORIES

Administrators must be able to manage categories.

Initial example categories:

* Paddles
* Balls
* Bags
* Shoes
* Apparel
* Grips
* Nets
* Accessories
* Training Equipment
* Other

Categories should be stored in the database and not permanently hardcoded into marketplace logic.

Suggested fields:

* id
* name
* slug
* description
* is_active
* sort_order
* created_at
* updated_at

---

# 12. BRANDS

Brands should be database-managed.

Examples could include different pickleball brands, but the system must not depend on hardcoded brand values.

Suggested fields:

* id
* name
* slug
* logo_url
* description
* is_active
* created_at

Admins should be able to:

* Create brands
* Edit brands
* Deactivate brands

---

# 13. SEARCH AND DISCOVERY

Buyers must be able to search marketplace listings.

Search functionality:

* Keyword search
* Product title search
* Product description search
* Brand filtering
* Category filtering
* Price filtering
* Product condition filtering
* Availability filtering
* Seller filtering where useful

Sorting options should include:

* Newest
* Oldest
* Price: Low to High
* Price: High to Low
* Most Viewed
* Most Popular

Marketplace search must work properly on mobile and desktop.

The URL should preserve meaningful search/filter state when practical.

Example:

`/marketplace?category=paddles&condition=used&minPrice=2000&maxPrice=6000`

---

# 14. FAVORITES / WISHLIST

Authenticated users can favorite products.

Required behavior:

* Add favorite
* Remove favorite
* Favorite indicator on marketplace cards
* Favorites page
* Prevent duplicate favorites
* Automatically handle unavailable/removed products

Suggested database uniqueness constraint:

`user_id + listing_id`

must be unique.

---

# 15. PADDLE RECOMMENDATION SYSTEM

Create a recommendation feature specifically for paddle listings.

The system should ask the user:

* Skill level
* Playing style
* Preferred paddle weight
* Control versus power preference
* Budget

Possible skill levels:

* Beginner
* Intermediate
* Advanced

Possible playing styles:

* Control-oriented
* Balanced
* Power-oriented
* Defensive
* Aggressive

Recommended paddle metadata should support:

* Weight
* Control score
* Power score
* Skill suitability
* Playing style suitability
* Price
* Brand
* Condition

Do not initially create an unnecessarily complex machine-learning model.

Start with a deterministic weighted recommendation algorithm.

Example scoring logic:

Budget match = 25 points
Skill compatibility = 20 points
Playing style compatibility = 20 points
Weight preference = 15 points
Control/power compatibility = 20 points

Maximum possible score:

100

The exact weighting may be adjusted when technically justified.

Recommendation results should display:

* Recommended paddle
* Recommendation score
* Price
* Condition
* Seller
* Why the paddle was recommended

Example explanation:

"This paddle matches your beginner skill level, balanced playing style, lightweight preference, and ₱5,000 budget."

Recommendations must only return:

* Active products
* Available products
* Paddle category products

The recommendation algorithm must be isolated into reusable application logic so it can later be upgraded without rewriting the marketplace.

---

# 16. PRODUCT INQUIRIES

Buyers must be able to contact sellers regarding listings.

An inquiry should reference:

* Buyer
* Seller
* Listing
* Creation date
* Status

Possible inquiry statuses:

* Open
* Responded
* Closed

Support threaded messages when feasible.

Each message should include:

* Inquiry ID
* Sender ID
* Message
* Created date
* Read status

Users may only access conversations they participate in.

Administrators may access inquiries only where moderation requirements justify it.

---

# 17. ORDER SUBSYSTEM

An authenticated buyer can create an order.

Required flow:

1. Buyer selects available product
2. System validates availability
3. Buyer enters required transaction details
4. Buyer selects pickup or delivery
5. System calculates amount
6. Order is generated
7. Seller receives notification
8. Seller confirms or rejects order
9. Transaction progresses through defined statuses

Required order statuses:

`Pending`

→ `Confirmed`

→ `Paid`

→ `Preparing`

→ `Shipped`

or

→ `Ready for Pickup`

→ `Completed`

Additional statuses:

* Cancelled
* Disputed

Use enums or validated database status fields.

Do not rely only on frontend validation for status changes.

Invalid transitions must be rejected.

Examples:

Completed → Pending

should not normally be allowed.

Cancelled → Shipped

must not be allowed.

---

# 18. ORDER AVAILABILITY PROTECTION

Order creation must check inventory.

Protect against situations where two buyers attempt to purchase the final item simultaneously.

Use database-level validation/transactions/RPC functions where appropriate.

Do not rely solely on:

```typescript
if (quantity > 0)
```

inside the browser.

Critical transaction operations should be atomic.

---

# 19. PAYMENT STATUS

Current project scope requires **payment-status recording**.

Do not pretend a real payment has occurred unless an actual payment provider has been integrated.

Payment statuses should include:

* Unpaid
* Pending
* Paid
* Failed
* Refunded

Possible payment information:

* Order ID
* Payment method
* Payment reference
* Amount
* Payment status
* Payment date
* Created date

The architecture must allow a real payment gateway to be added later.

Do not hardcode the application around one provider unless instructed.

---

# 20. PICKUP AND DELIVERY

Each order should support:

### Pickup

Information may include:

* Pickup location
* Pickup instructions
* Scheduled pickup date
* Ready status

### Delivery

Information may include:

* Recipient
* Phone
* Address
* City
* Province
* Postal code
* Delivery notes
* Tracking number if applicable
* Courier if applicable

Sensitive delivery information must only be accessible to the appropriate buyer, seller, and authorized administrator.

---

# 21. INVENTORY MANAGEMENT

Sellers must be able to manage product quantity.

Required functionality:

* Quantity available
* Quantity sold
* Listing status
* Mark sold
* Restore inventory when valid cancelled transactions require it
* Prevent negative stock

For unique used equipment, quantity will commonly equal:

`1`

When quantity reaches zero, the system should automatically mark the listing unavailable/sold when appropriate.

---

# 22. TRANSACTION HISTORY

Buyer transaction history should show:

* Order number
* Product
* Seller
* Date
* Amount
* Status
* Payment status
* Fulfillment type

Seller transaction history should show:

* Order number
* Buyer
* Product
* Date
* Amount
* Transaction status

Administrators should be able to filter marketplace transactions.

---

# 23. REVIEW AND RATING SYSTEM

Reviews can only be created after a transaction reaches:

`Completed`

A user must not review a seller/product for a transaction they did not participate in.

Review data:

* Order
* Reviewer
* Seller
* Listing/product
* Rating
* Comment
* Created date
* Moderation status

Rating range:

1–5

Prevent duplicate reviews for the same applicable transaction unless the business rules explicitly allow editing the original review.

Seller rating should be calculated from eligible reviews.

Display:

* Average rating
* Number of reviews
* Individual feedback

Administrators must be able to remove or hide inappropriate reviews.

Moderation actions must be logged.

---

# 24. COMPLAINT AND DISPUTE MANAGEMENT

Users must be able to report marketplace issues.

Possible dispute reasons:

* Item not received
* Item not as described
* Damaged product
* Seller issue
* Buyer issue
* Payment issue
* Fraud concern
* Inappropriate listing
* Other

Suggested dispute statuses:

* Open
* Under Review
* Awaiting Buyer
* Awaiting Seller
* Resolved
* Rejected
* Closed

Disputes should reference:

* User
* Order
* Listing if applicable
* Seller
* Reason
* Description
* Status
* Administrator
* Resolution
* Dates

Support evidence attachments if feasible.

Dispute records must maintain historical integrity.

Do not silently delete resolved disputes.

---

# 25. MARKETPLACE REPORTING

Users should be able to report listings.

Possible report reasons:

* Scam
* Counterfeit product
* Inappropriate content
* Misleading listing
* Prohibited item
* Incorrect category
* Spam
* Other

Admin should have a moderation queue.

Admin actions may include:

* Dismiss report
* Warn seller
* Remove listing
* Suspend listing
* Suspend seller

Actions must be recorded in audit logs.

---

# 26. NOTIFICATION SYSTEM

Create an in-app notification system.

Notifications may be generated when:

* Order created
* Order confirmed
* Order rejected
* Payment status updated
* Order preparing
* Order shipped
* Product ready for pickup
* Order completed
* New inquiry
* Inquiry reply
* Review received
* Dispute created
* Dispute updated
* Listing reported
* Seller status changed

Notification fields:

* Recipient
* Type
* Title
* Message
* Related entity
* Read status
* Created date

Users should be able to:

* View notifications
* Mark one as read
* Mark all as read

Design the architecture so email notifications can later be added without rewriting the core notification logic.

---

# 27. ADMINISTRATION SUBSYSTEM

Create a secure administrator interface.

Recommended routes:

`/admin`

`/admin/users`

`/admin/sellers`

`/admin/listings`

`/admin/orders`

`/admin/reviews`

`/admin/reports`

`/admin/disputes`

`/admin/categories`

`/admin/brands`

`/admin/analytics`

`/admin/audit-logs`

Administrator functionality must include:

### Users

* View users
* Search users
* Filter users
* Suspend user
* Reactivate user

### Sellers

* Review sellers
* Approve seller
* Reject seller
* Suspend seller

### Listings

* View listings
* Search listings
* Remove inappropriate listings
* Restore listings when appropriate

### Reviews

* View reviews
* Hide inappropriate reviews

### Complaints

* Review complaints
* Resolve disputes
* Document resolutions

### Marketplace Configuration

* Categories
* Brands

### Reporting

* Reports dashboard
* Marketplace analytics

---

# 28. REPORTING SUBSYSTEM

The application must be capable of generating the following information:

* Number of active users
* Number of sellers
* Number of active sellers
* Number of listings
* Active listings
* Products sold
* Total transaction value
* Most popular categories
* Most viewed products
* Most favorited products
* Top sellers
* Completed transactions
* Cancelled transactions
* Disputed transactions
* Complaints
* Resolved disputes
* Marketplace activity by month

Reports should support sensible filters such as:

* Date range
* Category
* Seller
* Transaction status

When possible, reports should derive from real transaction/database information rather than duplicated counters that can become inconsistent.

---

# 29. MARKETPLACE ANALYTICS

Administrator analytics dashboard should eventually include cards and charts for:

* Registered users
* Active sellers
* Active listings
* Orders
* Completed orders
* Transaction value
* Monthly transactions
* Listing growth
* Popular categories
* Popular brands
* Marketplace conversion activity

Seller analytics should include:

* Listing views
* Favorites
* Inquiries
* Orders
* Completed sales
* Total sales value
* Average rating

Do not allow sellers to access other sellers' private analytics.

---

# 30. DATABASE ARCHITECTURE

Create proper Supabase migrations.

Do not manually create an untracked production schema.

Suggested tables include:

### Core

`profiles`

`user_preferences`

`seller_profiles`

### Catalog

`categories`

`brands`

`listings`

`listing_images`

`listing_views`

### Discovery

`favorites`

`recommendation_profiles`

`recommendation_events`

### Communication

`inquiries`

`inquiry_messages`

### Commerce

`orders`

`order_items`

`payments`

`fulfillment_details`

### Reviews

`reviews`

### Moderation

`listing_reports`

`disputes`

`dispute_messages`

`dispute_evidence`

### Notifications

`notifications`

### Administration

`admin_actions`

`audit_logs`

Additional tables may be introduced when there is a clear architectural reason.

Do not create unnecessary duplicate tables.

---

# 31. DATABASE RELATIONSHIP PRINCIPLES

Use UUID primary keys.

Use proper foreign keys.

Example relationships:

`profiles.id → auth.users.id`

`seller_profiles.user_id → profiles.id`

`listings.seller_id → seller_profiles.id`

`listing_images.listing_id → listings.id`

`favorites.user_id → profiles.id`

`favorites.listing_id → listings.id`

`inquiries.buyer_id → profiles.id`

`inquiries.seller_id → seller_profiles.id`

`inquiries.listing_id → listings.id`

`orders.buyer_id → profiles.id`

`orders.seller_id → seller_profiles.id`

`order_items.order_id → orders.id`

`reviews.order_id → orders.id`

`notifications.user_id → profiles.id`

Create indexes on frequently queried foreign keys and filter fields.

---

# 32. DATABASE TIMESTAMPS

Important tables should use:

* created_at
* updated_at

Use consistent timestamp types.

Prefer UTC storage.

Frontend can display localized dates.

Implement reusable updated-at handling where appropriate.

---

# 33. DATABASE ENUMS

Consider PostgreSQL enums for strongly controlled states.

Suggested enums include:

`account_status`

`user_role`

`seller_status`

`listing_condition`

`listing_status`

`order_status`

`payment_status`

`fulfillment_type`

`inquiry_status`

`dispute_status`

`report_status`

`notification_type`

Do not use inconsistent free-text status values throughout the application.

---

# 34. ROW LEVEL SECURITY

RLS is mandatory for private tables.

Enable Row Level Security on all user-sensitive application tables.

Examples:

### Profiles

Users may:

* Read public profile information as allowed
* Update their own profile

Users must not edit another user's private profile.

### Seller Profiles

Seller manages own profile.

Public users can see only approved/public seller information.

### Listings

Public users can read active listings.

Seller can create/update/delete their own listings.

Seller cannot edit another seller's listing.

### Favorites

User can:

* Read own favorites
* Insert own favorites
* Delete own favorites

### Orders

Buyer can read orders where:

`buyer_id = current user`

Seller can read orders belonging to their seller account.

Other marketplace users cannot read those orders.

### Reviews

Public may read approved reviews.

Only eligible transaction participants may create valid reviews.

### Notifications

Only notification recipient can read/update their notifications.

### Admin

Admin privileges must be securely validated.

Do not create dangerous policies such as unrestricted:

`USING (true)`

for private write operations.

---

# 35. DATABASE SECURITY

Never trust:

* Buyer-provided prices
* Seller IDs provided by clients
* Client-side roles
* Client-side order totals
* Client-side inventory
* Client-side payment status
* Client-side admin flags

Critical values must be resolved from trusted database information.

For example:

When creating an order:

Do NOT trust:

`price = request.body.price`

Instead retrieve the current listing price from the database.

---

# 36. ATOMIC DATABASE OPERATIONS

Use PostgreSQL functions/RPC operations where useful for operations requiring consistency.

Examples:

* Create order
* Validate stock
* Reduce stock
* Update status
* Restore stock after cancellation
* Complete transaction

These operations should avoid race conditions.

---

# 37. SUPABASE STORAGE SECURITY

Storage policies must prevent users from overwriting other users' content.

Suggested structure:

`avatars/{user_id}/...`

`marketplace-products/{seller_id}/{listing_id}/...`

Validate:

* File MIME type
* File size
* Ownership

Never use unrestricted upload policies.

---

# 38. APPLICATION ROUTES

Recommended public routes:

`/`

`/marketplace`

`/marketplace/:listingId`

`/sellers/:sellerId`

`/recommendations`

`/login`

`/register`

`/forgot-password`

`/reset-password`

Authenticated routes:

`/dashboard`

`/profile`

`/favorites`

`/inquiries`

`/inquiries/:id`

`/orders`

`/orders/:id`

`/notifications`

Seller routes:

`/seller`

`/seller/onboarding`

`/seller/listings`

`/seller/listings/new`

`/seller/listings/:id/edit`

`/seller/orders`

`/seller/analytics`

Admin routes:

`/admin`

`/admin/users`

`/admin/sellers`

`/admin/listings`

`/admin/orders`

`/admin/reports`

`/admin/disputes`

`/admin/reviews`

`/admin/categories`

`/admin/brands`

`/admin/analytics`

`/admin/audit-logs`

---

# 39. FRONTEND ARCHITECTURE

Maintain a clear application structure.

Recommended structure:

```text
src/
├── app/
├── components/
│   ├── common/
│   ├── layout/
│   ├── marketplace/
│   ├── orders/
│   ├── sellers/
│   ├── reviews/
│   └── admin/
├── features/
│   ├── auth/
│   ├── users/
│   ├── sellers/
│   ├── marketplace/
│   ├── favorites/
│   ├── recommendations/
│   ├── inquiries/
│   ├── orders/
│   ├── payments/
│   ├── reviews/
│   ├── disputes/
│   ├── notifications/
│   └── analytics/
├── hooks/
├── lib/
│   └── supabase/
├── pages/
├── routes/
├── services/
├── types/
├── utils/
└── main.tsx

supabase/
├── migrations/
├── functions/
├── seed.sql
└── config.toml

tests/
├── unit/
├── integration/
└── e2e/
```

Adapt this structure if the repository already has a strong architecture.

Do not restructure working code unnecessarily.

---

# 40. TYPESCRIPT STANDARDS

Use strict TypeScript.

Avoid excessive use of:

`any`

Create typed models/interfaces.

Use generated Supabase database types when practical.

Generate database types after migrations.

Keep database types and application domain types organized.

Do not manually duplicate large database schemas unnecessarily.

---

# 41. COMPONENT DESIGN

Build reusable components such as:

* Button
* Input
* Select
* Modal
* Dialog
* Badge
* Card
* Pagination
* Skeleton
* EmptyState
* ErrorState
* ProductCard
* ProductGrid
* ProductGallery
* PriceDisplay
* SellerCard
* RatingDisplay
* SearchBar
* FilterPanel
* OrderStatusBadge
* NotificationItem
* ConfirmDialog

Avoid giant page components containing all marketplace logic.

---

# 42. UI/UX REQUIREMENTS

Design PalitPaddleBai Mart as a clean, modern pickleball marketplace.

The interface should feel:

* Friendly
* Sport-oriented
* Modern
* Trustworthy
* Community-focused
* Easy for beginners

Prioritize mobile responsiveness.

The marketplace must work well on:

* Mobile
* Tablet
* Laptop
* Desktop

Every important screen should include appropriate:

* Loading state
* Skeleton state
* Empty state
* Error state
* Success feedback

Do not leave users looking at blank screens while data loads.

---

# 43. ACCESSIBILITY

Implement reasonable accessibility standards.

Include:

* Form labels
* Keyboard navigation
* Semantic buttons
* Accessible dialogs
* Image alternative text
* Adequate contrast
* Clear validation messages
* Focus states

---

# 44. ERROR HANDLING

Never silently ignore failures.

Handle:

* Authentication failures
* Database errors
* Network errors
* Storage upload errors
* Invalid input
* Missing records
* Unauthorized actions
* Failed order operations

Show friendly messages to users while retaining useful developer diagnostics.

Do not expose sensitive technical information to end users.

---

# 45. VALIDATION

Validate forms.

Examples:

Listing:

* Title required
* Description required
* Valid category
* Positive price
* Quantity >= 0
* Valid product condition

Order:

* Authenticated buyer required
* Product active
* Inventory available
* Valid fulfillment method
* Delivery information required when delivery selected

Review:

* Rating between 1–5
* Completed transaction required

---

# 46. AUDIT LOGGING

Administrative actions should be auditable.

Record things such as:

* User suspension
* User restoration
* Seller approval
* Seller suspension
* Listing removal
* Review removal
* Dispute resolution

Suggested audit fields:

* Actor
* Action
* Entity type
* Entity ID
* Previous state where practical
* New state where practical
* Timestamp

---

# 47. TESTING REQUIREMENTS

Testing is mandatory.

Use appropriate testing libraries for the React environment.

Implement:

## Unit Tests

Test:

* Recommendation scoring
* Order calculations
* Status validation
* Utilities
* Validation functions

## Integration Tests

Test:

* Authentication
* Database operations
* Favorites
* Listing creation
* Order creation
* Reviews
* RLS-sensitive operations where practical

## End-to-End Tests

Use Playwright or an equivalent suitable testing solution.

Important E2E flows:

### Authentication

Register → Login → Logout

### Buyer

Login → Browse → Search → Filter → Favorite → Inquiry → Order

### Seller

Login → Create Listing → Edit Listing → Receive Order → Confirm → Update Status

### Transaction

Buyer order → Seller confirmation → Payment status → Preparation → Pickup/Shipping → Completion

### Review

Completed transaction → Review submitted

### Admin

Admin login → Review reports → Moderate listing → View analytics

---

# 48. REQUIRED VALIDATION COMMANDS

Before declaring a phase complete, run applicable commands similar to:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

When E2E tests exist:

```bash
npm run test:e2e
```

When Supabase scripts exist, also verify:

* migrations
* database type generation
* local database health
* RLS
* seed functionality

Never report PASS when these commands fail.

---

# 49. SEED DATA

Create useful development seed data.

Include examples of:

* Categories
* Brands
* Marketplace listings
* New paddles
* Used paddles
* Other pickleball equipment

Do not put real passwords, production keys, or personally sensitive information into seeds.

---

# 50. DEVELOPMENT PHASES

Development must follow these phases.

---

# PHASE 0 — PROJECT INITIALIZATION

Objectives:

* Inspect repository
* Initialize OpenCode
* Generate/update AGENTS.md
* Understand project architecture
* Verify Git state
* Verify environment
* Establish React + TypeScript foundation
* Establish Supabase foundation

Actions:

1. Run `/init` in OpenCode.
2. Review generated `AGENTS.md`.
3. Update `AGENTS.md` if needed.
4. Inspect repository structure.
5. Inspect package.json.
6. Inspect configuration.
7. Identify existing code.
8. Identify potential conflicts.
9. Create `.env.example`.
10. Establish base scripts.
11. Configure linting.
12. Configure TypeScript.
13. Configure application routing.
14. Configure Supabase client.
15. Create README architecture section.

Do not expose or print secrets.

### Phase 0 Completion Criteria

* Application starts
* TypeScript works
* Supabase configuration exists
* Environment variables documented
* Build succeeds
* Lint passes
* Repository structure documented

---

# PHASE 1 — DATABASE FOUNDATION

Create Supabase migrations for core schema.

Implement:

* enums
* profiles
* seller profiles
* categories
* brands
* listings
* listing images
* favorites
* inquiries
* orders
* reviews
* reports
* disputes
* notifications
* audit logs

Add:

* foreign keys
* unique constraints
* indexes
* timestamps
* triggers where justified
* RLS

Generate TypeScript database types.

### Phase 1 Completion Criteria

* All migrations apply successfully
* No broken foreign keys
* RLS enabled
* Basic seed data works
* Generated types succeed

---

# PHASE 2 — AUTHENTICATION AND USER MANAGEMENT

Implement:

* Registration
* Login
* Logout
* Password reset
* Session handling
* Protected routes
* Profile editing
* Avatar upload
* Preferences

Test unauthenticated and authenticated access.

---

# PHASE 3 — SELLER MANAGEMENT

Implement:

* Seller registration
* Seller onboarding
* Seller profile
* Seller approval state
* Seller dashboard
* Seller authorization

Seller cannot access another seller's management data.

---

# PHASE 4 — MARKETPLACE CATALOG

Implement:

* Create listing
* Edit listing
* Archive/delete listing
* Product images
* Category
* Brand
* Condition
* Price
* Quantity
* Product detail page
* Marketplace grid

---

# PHASE 5 — SEARCH AND DISCOVERY

Implement:

* Search
* Filters
* Sorting
* Pagination
* Category navigation
* Brand filtering
* Price range
* Condition filtering

Ensure query/filter performance is acceptable.

---

# PHASE 6 — PADDLE RECOMMENDATION SYSTEM

Implement:

* Recommendation questionnaire
* User paddle preferences
* Recommendation scoring
* Recommendation explanations
* Ranked paddle results

Unit test scoring logic.

---

# PHASE 7 — FAVORITES AND INQUIRIES

Implement:

* Add favorite
* Remove favorite
* Favorites page
* Product inquiry
* Inquiry messages
* Seller replies
* Read/unread state

---

# PHASE 8 — ORDER AND TRANSACTION SYSTEM

Implement:

* Order placement
* Product availability validation
* Atomic stock handling
* Order calculations
* Seller confirmation/rejection
* Order statuses
* Transaction history

Test concurrency-sensitive stock behavior.

---

# PHASE 9 — PAYMENT STATUS AND FULFILLMENT

Implement:

* Payment status
* Payment records
* Pickup information
* Delivery information
* Shipment/tracking information
* Ready-for-pickup state

Do not simulate successful external payment processing unless an actual provider exists.

---

# PHASE 10 — RATINGS AND REVIEWS

Implement:

* Review eligibility
* Review creation
* Rating calculations
* Seller reviews
* Product feedback
* Review moderation

Verify reviews cannot be created before transaction completion.

---

# PHASE 11 — COMPLAINTS, REPORTS AND DISPUTES

Implement:

* Report listing
* Complaint creation
* Dispute creation
* Dispute status
* Admin investigation
* Resolution records
* Moderation actions

---

# PHASE 12 — NOTIFICATIONS

Implement notifications for major marketplace events.

Include:

* Notification center
* Unread count
* Mark read
* Mark all read

---

# PHASE 13 — ADMINISTRATION

Implement secure admin dashboard.

Include:

* Users
* Sellers
* Listings
* Reviews
* Orders
* Reports
* Disputes
* Categories
* Brands
* Audit logs

---

# PHASE 14 — REPORTING AND ANALYTICS

Implement:

### Marketplace KPIs

* Active users
* Sellers
* Listings
* Products sold
* Transaction value
* Top categories
* Popular listings
* Top sellers
* Cancelled transactions
* Disputed transactions

### Charts

* Monthly activity
* Monthly transactions
* Marketplace growth
* Category distribution

Use database queries/views/RPC functions where beneficial.

---

# PHASE 15 — UI/UX HARDENING

Audit every page for:

* Mobile layout
* Tablet layout
* Desktop layout
* Loading state
* Skeleton state
* Error state
* Empty state
* Form validation
* Confirmation dialogs
* Accessibility
* Navigation
* Broken links

---

# PHASE 16 — SECURITY AUDIT

Verify:

* No service-role key exposed
* No secrets committed
* RLS on protected tables
* Storage policies
* Role authorization
* Admin authorization
* Input validation
* Order amount integrity
* Inventory race protection
* Unauthorized seller access protection
* Unauthorized order access protection
* Unauthorized message access protection
* Review eligibility
* Dispute privacy

---

# PHASE 17 — FINAL QUALITY ASSURANCE

Run complete test suite.

Verify:

### Guest

* Browse works
* Search works
* Filters work
* Protected actions require authentication

### Buyer

* Registration works
* Profile works
* Favorites work
* Inquiry works
* Recommendations work
* Order placement works
* History works
* Reviews work

### Seller

* Seller onboarding works
* Create listing works
* Edit listing works
* Images work
* Inventory works
* Orders work
* Seller analytics work

### Admin

* Admin authorization works
* Moderation works
* Reports work
* Disputes work
* Marketplace analytics work

---

# PHASE 18 — DOCUMENTATION

Create/update:

`README.md`

`AGENTS.md`

`ARCHITECTURE.md`

`DATABASE.md`

`SECURITY.md`

`TESTING.md`

`DEPLOYMENT.md`

`CHANGELOG.md`

If appropriate:

`docs/`

Document:

* Setup
* Environment variables
* Architecture
* Database
* RLS
* Authentication
* Storage
* Testing
* Deployment
* Marketplace workflows
* Recommendation algorithm
* Admin operations

---

# 51. OPENCODE DEVELOPMENT SOP

When working with OpenCode, follow this exact methodology.

## STEP 1

Open project:

```bash
cd /path/to/palitpaddlebai-mart
```

Start:

```bash
opencode
```

Initialize:

```text
/init
```

Review generated:

```text
AGENTS.md
```

Commit `AGENTS.md` with the project when appropriate.

---

# 52. PLAN BEFORE IMPLEMENTATION

Before each major phase, use OpenCode Plan Mode.

Press:

```text
TAB
```

Switch into Plan Mode.

Then instruct OpenCode:

"Review the MASTER_BUILD_SPEC and the current repository. Create an implementation plan for the next incomplete phase. Do not modify files yet. Identify required files, database migrations, RLS policies, tests, risks, dependencies, and completion criteria."

Review the generated plan.

Then switch back to Build Mode.

---

# 53. IMPLEMENTATION INSTRUCTION

After the plan is complete, use:

"Implement the approved phase completely. Work through all safe tasks without stopping unnecessarily. Do not skip validation. Do not expose secrets. Do not introduce another database or ORM. After implementation, run the relevant tests, lint, typecheck, build, database validation, and security checks. Fix failures before reporting completion."

---

# 54. AUTONOMOUS WORK RULE

Do not repeatedly ask the user minor technical questions.

When a decision can reasonably be made using:

* Current architecture
* This specification
* Industry-standard implementation patterns

make the decision and document the assumption.

Only report a blocker when it genuinely requires:

* Missing credentials
* Missing external service access
* Business decision unavailable from this specification
* Deployment access
* Third-party account configuration

A blocker in one area must not stop unrelated safe work.

---

# 55. NO FAKE COMPLETION

Never write:

"Everything works."

unless it has actually been validated.

Differentiate clearly between:

* IMPLEMENTED
* TESTED
* VERIFIED
* BLOCKED
* NOT STARTED

If a feature was implemented but not verified against a live external service, explicitly state that.

---

# 56. SAFE GIT RULES

Before major work:

```bash
git status
```

Do not:

* Force push
* Rewrite shared history
* Delete unrelated user work
* Reset working changes
* Remove files without understanding them
* Commit secrets

Never run destructive Git commands merely to clean the repository.

Do not push to a remote repository unless authorized.

---

# 57. SECRET MANAGEMENT

Never print secrets.

Never commit:

* Supabase service-role key
* Database password
* Production access token
* Third-party secret
* Private API key

Use environment variables.

Create documentation using placeholders.

Example:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

If server-side privileged operations exist, keep service credentials outside browser-prefixed environment variables.

---

# 58. CODE QUALITY RULES

Avoid:

* Giant components
* Duplicate database queries everywhere
* Hardcoded role checks scattered throughout pages
* Hardcoded categories
* Hardcoded brands
* `any` everywhere
* Ignored promises
* Silent catch blocks
* Fake data remaining in production paths
* Frontend-only security

Prefer:

* Reusable hooks
* Reusable services
* Typed API/database responses
* Reusable components
* Centralized route guards
* Centralized permissions
* Centralized status mappings
* Clear domain modules

---

# 59. PERFORMANCE RULES

Avoid unnecessary database calls.

Use:

* Pagination
* Indexed search fields
* Query caching
* Lazy loading
* Image optimization
* Debounced search where appropriate

Do not load thousands of marketplace products into the browser just to apply filters client-side.

Search, filtering, sorting, and pagination should primarily occur through database queries.

---

# 60. MARKETPLACE BUSINESS RULES

The following rules are mandatory.

### Rule 1

Only active listings can normally be purchased.

### Rule 2

A seller cannot purchase their own listing.

### Rule 3

Users cannot modify another user's favorites.

### Rule 4

Sellers cannot modify another seller's listings.

### Rule 5

Users cannot read unrelated private orders.

### Rule 6

Users cannot read unrelated private inquiries.

### Rule 7

Reviews require completed transactions.

### Rule 8

Inventory cannot become negative.

### Rule 9

A completed order should preserve historical product/price information even if the seller later changes the listing.

Store appropriate order-item snapshots.

### Rule 10

Deleting a listing must not destroy historical transaction records.

Prefer archive/soft removal where transaction relationships exist.

### Rule 11

Marketplace transaction values must come from trusted database information.

### Rule 12

Admin actions must be authorized and logged.

---

# 61. ORDER DATA SNAPSHOTS

When creating an order, store appropriate historical product information.

For example:

* Product title at time of purchase
* Unit price
* Quantity
* Seller
* Listing reference

This prevents historical orders from changing when a seller edits their listing later.

---

# 62. RECOMMENDATION DATA MODEL

Paddle listings should optionally contain structured attributes.

Example:

* weight_grams
* weight_class
* control_score
* power_score
* recommended_skill_level
* recommended_play_style

Keep paddle-specific fields optional so non-paddle products can still exist in the same listing system.

If a cleaner relational architecture is needed, create a dedicated paddle attributes table associated with listings.

Choose the approach that produces the cleanest schema without overengineering.

---

# 63. ANALYTICS EVENT TRACKING

Where appropriate, track marketplace interactions such as:

* Product view
* Favorite
* Inquiry
* Recommendation click
* Order creation
* Completed sale

Avoid logging excessive sensitive information.

Use these records to generate meaningful marketplace analytics.

---

# 64. ERROR AND SECURITY LOGGING

Developer logs may include:

* Event type
* Error code
* Entity ID
* Operation
* Timestamp

Do not log:

* Passwords
* Authentication tokens
* Service keys
* Full sensitive payment data

---

# 65. ACCEPTANCE CRITERIA FOR THE COMPLETE PROJECT

PalitPaddleBai Mart is considered functionally complete only when:

✅ Users can register and authenticate.

✅ Users can manage their profiles.

✅ Sellers can register.

✅ Sellers can create marketplace listings.

✅ Sellers can upload multiple product images.

✅ Marketplace supports new and used products.

✅ Categories and brands work.

✅ Search works.

✅ Filters work.

✅ Sorting works.

✅ Favorites work.

✅ Paddle recommendations work.

✅ Buyer/seller inquiries work.

✅ Buyers can place orders.

✅ Availability is validated securely.

✅ Sellers can confirm/reject orders.

✅ Payment status can be recorded.

✅ Pickup and delivery information work.

✅ Inventory works.

✅ Transaction history works.

✅ Reviews require completed transactions.

✅ Seller rating calculations work.

✅ Complaints work.

✅ Disputes work.

✅ Notifications work.

✅ Admin moderation works.

✅ Categories and brands can be administered.

✅ Reports work.

✅ Marketplace analytics work.

✅ RLS protects private data.

✅ Storage policies protect files.

✅ Mobile layout works.

✅ Loading states exist.

✅ Error states exist.

✅ Empty states exist.

✅ Tests pass.

✅ TypeScript passes.

✅ Build succeeds.

✅ Documentation exists.

---

# 66. REQUIRED PHASE COMPLETION REPORT

After completing every development phase, respond using this exact structure:

```text
PHASE COMPLETED:
[Phase name]

STATUS:
PASS / PARTIAL / BLOCKED

FILES CREATED:
- ...

FILES MODIFIED:
- ...

DATABASE CHANGES:
- ...

FEATURES IMPLEMENTED:
- ...

SECURITY IMPLEMENTED:
- ...

RLS POLICIES:
- ...

TESTS ADDED:
- ...

COMMANDS EXECUTED:
- ...

TEST RESULTS:
- ...

BUILD STATUS:
- ...

KNOWN ISSUES:
- ...

BLOCKERS:
- ...

NEXT RECOMMENDED PHASE:
- ...
```

Do not omit failures.

---

# 67. FINAL PROJECT REPORT

When all phases are finished, produce:

```text
PALITPADDLEBAI MART — FINAL BUILD REPORT

PROJECT STATUS:

ARCHITECTURE:

DATABASE:

AUTHENTICATION:

USER MANAGEMENT:

SELLER MANAGEMENT:

MARKETPLACE:

SEARCH:

RECOMMENDATION SYSTEM:

FAVORITES:

INQUIRIES:

ORDERS:

PAYMENTS:

FULFILLMENT:

INVENTORY:

REVIEWS:

DISPUTES:

NOTIFICATIONS:

ADMINISTRATION:

REPORTING:

ANALYTICS:

SECURITY:

RLS:

STORAGE:

TESTING:

BUILD:

DOCUMENTATION:

DEPLOYMENT READINESS:

REMAINING BLOCKERS:

FINAL VERDICT:
PASS / PARTIAL / BLOCKED
```

---

# 68. FIRST OPENCODE TASK

Begin by performing **PHASE 0 ONLY**.

Do not implement the entire marketplace immediately.

Perform the following:

1. Analyze the repository.
2. Read `AGENTS.md` if it already exists.
3. Read `package.json`.
4. Inspect current React/TypeScript implementation.
5. Inspect existing Supabase configuration.
6. Inspect existing migrations.
7. Inspect environment configuration without printing secrets.
8. Inspect Git status.
9. Identify reusable existing components.
10. Identify architecture issues.
11. Establish the correct project foundation.
12. Configure missing base infrastructure.
13. Run build/lint/typecheck.
14. Produce the required Phase 0 report.

After Phase 0 is verified, state what Phase 1 should implement.

Do not begin Phase 1 in the same operation unless explicitly instructed.

---

# 69. SECOND OPENCODE COMMAND AFTER PHASE 0

Once Phase 0 passes, use:

"Proceed with Phase 1 — Database Foundation from the PalitPaddleBai Mart MASTER BUILD SPEC. Inspect the currently committed Phase 0 implementation first. Design and apply the complete Supabase marketplace schema, enums, relationships, constraints, indexes, RLS policies, storage foundation, seed data, and generated TypeScript database types. Test the migrations and policies before declaring PASS. Do not begin Phase 2."

---

# 70. STANDARD CONTINUATION COMMAND

For every phase afterward, use:

"Continue PalitPaddleBai Mart from the current verified repository state. Read AGENTS.md, the MASTER BUILD SPEC, current migrations, documentation, and the previous phase implementation. Determine the next incomplete phase. Create a plan first, then implement only that phase. Preserve working functionality. Apply appropriate Supabase schema/RLS/security changes, implement responsive UI states, add tests, run lint/typecheck/tests/build, fix failures, update documentation, and provide the required phase completion report. Do not skip ahead."

---

# 71. BUG-FIX COMMAND

If a phase fails testing, use:

"Do not start another feature. Investigate the failed PalitPaddleBai Mart tests/build/runtime behavior. Determine the root cause rather than masking the symptom. Fix the issue with the smallest maintainable change, add or update regression tests, run the affected test suite plus lint/typecheck/build, and report the exact root cause, fix, affected files, regression protection, and final verification result."

---

# 72. FINAL SECURITY REVIEW COMMAND

Before production deployment use:

"Perform a complete PalitPaddleBai Mart pre-production security audit. Focus on Supabase RLS, storage policies, role escalation, admin authorization, seller isolation, order privacy, inquiry privacy, inventory race conditions, price manipulation, review eligibility, dispute access, environment secrets, frontend bundle exposure, authentication/session handling, dangerous database functions, and unauthorized status transitions. Fix safe code-side issues, add regression tests, run the complete validation suite, and provide PASS/PARTIAL/BLOCKED for every security area."

---

# 73. FINAL QA COMMAND

Use:

"Perform the final PalitPaddleBai Mart production-readiness QA. Test the complete guest, buyer, seller, and administrator journeys. Validate responsive behavior, loading states, errors, empty states, search, filtering, recommendations, favorites, inquiries, orders, inventory, payment status, fulfillment, reviews, disputes, notifications, moderation, reports, and analytics. Run all automated tests, lint, TypeScript checks, and production build. Do not mark the project PASS if a critical workflow remains unverified."

---

# 74. DEFINITION OF DONE

A feature is only DONE when:

1. Database support exists.
2. Required migration exists.
3. RLS is correct.
4. TypeScript types are correct.
5. UI exists.
6. Loading state exists.
7. Error handling exists.
8. Validation exists.
9. Authorization exists.
10. Tests exist where appropriate.
11. Tests pass.
12. Typecheck passes.
13. Build passes.
14. Documentation is updated.
15. No known critical regression remains.

Creating only the visual page does not mean the feature is complete.

Creating only a database table does not mean the feature is complete.

The complete vertical workflow must work.

---

# 75. START NOW

Analyze the current PalitPaddleBai Mart repository and execute **PHASE 0 — PROJECT INITIALIZATION AND FOUNDATION**.

Work carefully and autonomously.

Do not expose secrets.

Do not use Prisma.

Do not introduce another database.

Do not skip tests.

Do not fake completed functionality.

If an external-access blocker exists, document it and continue all unrelated safe work.

End with the required Phase 0 completion report.
