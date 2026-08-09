import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import GuestRoute from '../components/auth/GuestRoute'
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
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
          { path: 'profile', element: <ProfilePage /> },
          { path: 'preferences', element: <PreferencesPage /> },
        ],
      },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'account-suspended', element: <AccountSuspendedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
