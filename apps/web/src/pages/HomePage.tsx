import { Boxes, LogOut, PackageSearch, Route, ShoppingCart, Warehouse } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearTemporarySession } from '../services/temporary-auth'

const overviewCards = [
  { label: 'Inventario', detail: 'Consulta existencias por sucursal', icon: Boxes },
  { label: 'Productos', detail: 'Administra el catálogo disponible', icon: PackageSearch },
  { label: 'Ventas', detail: 'Revisa la actividad reciente', icon: ShoppingCart },
  { label: 'Rutas', detail: 'Controla cargas y entregas', icon: Route },
]

export function HomePage() {
  const navigate = useNavigate()

  function logout() {
    clearTemporarySession()
    navigate('/iniciar-sesion', { replace: true })
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <div className="home-brand"><Warehouse size={26} aria-hidden="true" /><span>Stock Control</span></div>
        <button className="logout-button" type="button" onClick={logout}><LogOut size={18} aria-hidden="true" /> Cerrar sesión</button>
      </header>
      <section className="home-content" aria-labelledby="welcome-title">
        <div className="welcome-block">
          <p className="eyebrow">Panel administrativo</p>
          <h1 id="welcome-title">Bienvenido, admin</h1>
          <p>Esta es la pantalla inicial temporal. Desde aquí construiremos los módulos operativos.</p>
        </div>
        <div className="overview-grid">
          {overviewCards.map(({ label, detail, icon: Icon }) => (
            <article className="overview-card" key={label}>
              <span className="overview-card__icon"><Icon size={23} aria-hidden="true" /></span>
              <h2>{label}</h2>
              <p>{detail}</p>
              <span className="coming-soon">Próximamente</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
