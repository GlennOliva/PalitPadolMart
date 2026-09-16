import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import GuestRoute from '../components/auth/GuestRoute'
import SellerRoute from '../components/seller/SellerRoute'
import HomePage from '../pages/HomePage'
import NotFoundPage from '../pages/NotFoundPage'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
import DashboardPage from '../pages/DashboardPage'
import AccountSuspendedPage from '../pages/AccountSuspendedPage'
import ProfilePage from '../pages/account/ProfilePage'
import PreferencesPage from '../pages/account/PreferencesPage'
import FavoritesPage from '../pages/account/FavoritesPage'
import InquiriesPage from '../pages/account/InquiriesPage'
import InquiryDetailPage from '../pages/account/InquiryDetailPage'
import ApplicationErrorPage from '../components/common/ApplicationErrorPage'
import LoadingState from '../components/common/LoadingState'
import OAuthCallbackPage from '../pages/auth/OAuthCallbackPage'
import AdminRoute from '../components/admin/AdminRoute'
import AdminLayout from '../components/admin/AdminLayout'

const AdminPaymentsPage = lazy(() => import('../pages/admin/AdminPaymentsPage'))
const AdminDisputesPage = lazy(() => import('../pages/admin/AdminDisputesPage'))
const AdminRefundsPage = lazy(() => import('../pages/admin/AdminRefundsPage'))
const AdminAuditLogsPage = lazy(() => import('../pages/admin/AdminAuditLogsPage'))
const AdminCategoriesPage = lazy(() => import('../pages/admin/AdminCategoriesPage'))
const AdminBrandsPage = lazy(() => import('../pages/admin/AdminBrandsPage'))

const adminRouteFallback = <LoadingState label="Loading administration view…" />

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ApplicationErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        element: <GuestRoute />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'cart', lazy: async () => ({ Component: (await import('../pages/cart/CartPage')).default }) },
          { path: 'checkout', lazy: async () => ({ Component: (await import('../pages/cart/CheckoutPage')).default }) },
          { path: 'order/review/:listingId', lazy: async () => ({ Component: (await import('../pages/orders/ReviewOrderPage')).default }) },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'preferences', element: <PreferencesPage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'inquiries', element: <InquiriesPage /> },
          { path: 'inquiries/:inquiryId', element: <InquiryDetailPage /> },
          { path: 'orders', lazy: async () => ({ Component: (await import('../pages/orders/BuyerOrdersPage')).default }) },
          { path: 'orders/:orderId', lazy: async () => ({ Component: (await import('../pages/orders/BuyerOrderDetailPage')).default }) },
          { path: 'orders/:orderId/dispute', lazy: async () => ({ Component: (await import('../pages/disputes/OpenOrderDisputePage')).default }) },
          { path: 'orders/:orderId/review/:orderItemId', lazy: async () => ({ Component: (await import('../pages/orders/ReviewItemPage')).default }) },
          { path: 'disputes', lazy: async () => ({ Component: (await import('../pages/disputes/BuyerDisputesPage')).default }) },
          { path: 'disputes/:disputeId', lazy: async () => ({ Component: (await import('../pages/disputes/BuyerDisputeDetailPage')).default }) },
          { path: 'notifications', lazy: async () => ({ Component: (await import('../pages/account/NotificationsPage')).default }) },
          { path: 'seller/onboarding', lazy: async () => ({ Component: (await import('../pages/seller/SellerOnboardingPage')).default }) },
          { path: 'seller/status', lazy: async () => ({ Component: (await import('../pages/seller/SellerStatusPage')).default }) },
          {
            path: 'seller',
            element: <SellerRoute />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', lazy: async () => ({ Component: (await import('../pages/seller/SellerDashboardPage')).default }) },
              { path: 'profile', lazy: async () => ({ Component: (await import('../pages/seller/SellerProfilePage')).default }) },
              { path: 'payment-methods', lazy: async () => ({ Component: (await import('../pages/seller/SellerPaymentSettingsPage')).default }) },
              { path: 'orders', lazy: async () => ({ Component: (await import('../pages/orders/SellerOrdersPage')).default }) },
              { path: 'orders/:orderId', lazy: async () => ({ Component: (await import('../pages/orders/SellerOrderDetailPage')).default }) },
              { path: 'listings', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingsPage')).default }) },
              { path: 'listings/new', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingFormPage')).default }) },
              { path: 'listings/:listingId', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingDetailPage')).default }) },
              { path: 'listings/:listingId/edit', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingFormPage')).default }) },
              { path: 'reviews', lazy: async () => ({ Component: (await import('../pages/seller/SellerReviewsPage')).default }) },
              { path: 'analytics', lazy: async () => ({ Component: (await import('../pages/seller/SellerAnalyticsPage')).default }) },
              { path: 'disputes', lazy: async () => ({ Component: (await import('../pages/disputes/SellerDisputesPage')).default }) },
              { path: 'disputes/:disputeId', lazy: async () => ({ Component: (await import('../pages/disputes/SellerDisputeDetailPage')).default }) },
            ],
          },
          {
            path: 'admin',
            element: <AdminRoute />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('../pages/admin/AdminDashboardPage')).default,
                    }),
                  },
                  { path: 'users', lazy: async () => ({ Component: (await import('../pages/admin/AdminUsersPage')).default }) },
                  { path: 'sellers', lazy: async () => ({ Component: (await import('../pages/admin/AdminSellersPage')).default }) },
                  { path: 'listings', lazy: async () => ({ Component: (await import('../pages/admin/AdminListingsPage')).default }) },
                  { path: 'reports', lazy: async () => ({ Component: (await import('../pages/admin/AdminReportsPage')).default }) },
                  { path: 'reviews', lazy: async () => ({ Component: (await import('../pages/admin/AdminReviewsPage')).default }) },
                  { path: 'orders', lazy: async () => ({ Component: (await import('../pages/admin/AdminOrdersPage')).default }) },
                  { path: 'payments', element: <Suspense fallback={adminRouteFallback}><AdminPaymentsPage /></Suspense> },
                  { path: 'disputes', element: <Suspense fallback={adminRouteFallback}><AdminDisputesPage /></Suspense> },
                  { path: 'refunds', element: <Suspense fallback={adminRouteFallback}><AdminRefundsPage /></Suspense> },
                  { path: 'audit-logs', element: <Suspense fallback={adminRouteFallback}><AdminAuditLogsPage /></Suspense> },
                  { path: 'analytics', lazy: async () => ({ Component: (await import('../pages/admin/AdminAnalyticsPage')).default }) },
                  { path: 'report-center', lazy: async () => ({ Component: (await import('../pages/admin/AdminReportCenterPage')).default }) },
                  { path: 'categories', element: <Suspense fallback={adminRouteFallback}><AdminCategoriesPage /></Suspense> },
                  { path: 'brands', element: <Suspense fallback={adminRouteFallback}><AdminBrandsPage /></Suspense> },
                ],
              },
            ],
          },
        ],
      },
      { path: 'marketplace', lazy: async () => ({ Component: (await import('../pages/marketplace/MarketplacePage')).default }) },
      { path: 'marketplace/:listingId', lazy: async () => ({ Component: (await import('../pages/marketplace/ListingDetailPage')).default }) },
      { path: 'recommendations', lazy: async () => ({ Component: (await import('../pages/recommendations/RecommendationsPage')).default }) },
      { path: 'sellers/:sellerId', lazy: async () => ({ Component: (await import('../pages/seller/PublicSellerProfilePage')).default }) },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'auth/callback', element: <OAuthCallbackPage /> },
      { path: 'account-suspended', element: <AccountSuspendedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
