const SESSION_KEY = 'stock-control:temporary-session'
const TEMPORARY_USER = { username: 'admin', displayName: 'Administrador' }

export function createTemporarySession(remember: boolean) {
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(SESSION_KEY, JSON.stringify(TEMPORARY_USER))
}

export function hasTemporarySession() {
  return Boolean(getTemporaryUser())
}

export function getTemporaryUser() {
  const rawSession = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY)
  if (!rawSession) return null
  if (rawSession === 'admin') return TEMPORARY_USER
  try {
    const storedUser = JSON.parse(rawSession) as typeof TEMPORARY_USER
    return storedUser.username && storedUser.displayName ? storedUser : null
  } catch {
    return null
  }
}

export function clearTemporarySession() {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}
