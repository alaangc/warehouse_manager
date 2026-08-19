import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { hasTemporarySession } from './services/temporary-auth'

function ProtectedRoute() {
  return hasTemporarySession()
    ? <Outlet />
    : <Navigate to="/iniciar-sesion" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/iniciar-sesion" element={<LoginPage />} />
        <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/inicio" element={<HomePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/iniciar-sesion" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
