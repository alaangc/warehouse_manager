import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Box,
  CheckSquare,
  ChevronRight,
  Home,
  Menu,
  Package,
  ShoppingCart,
  Store,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { inventoryProducts } from '../data/inventory-products'

const branches = [
  { name: 'Magdalena', count: 125, status: 'Stock suficiente', tone: 'enough', icon: Store },
  { name: 'Tucson', count: 98, status: 'Stock bajo', tone: 'low', icon: Package },
  { name: 'Camioneta', count: 25, status: 'Sin stock', tone: 'empty', icon: Box },
] as const

export function InventoryPage() {
  const navigate = useNavigate()
  const [branch, setBranch] = useState('Todas las sucursales')
  const visibleBranches = useMemo(
    () => branch === 'Todas las sucursales' ? branches : branches.filter(({ name }) => name === branch),
    [branch],
  )

  return (
    <main className="inventory-page">
      <header className="inventory-topbar">
        <button type="button" onClick={() => navigate('/inicio')} aria-label="Volver a inicio"><ArrowLeft size={21} /></button>
        <span className="inventory-title-icon"><Box size={24} /></span>
        <div><h1>Inventario</h1><p>Control total de tu inventario</p></div>
      </header>

      <section className="inventory-shell">
        <section className="inventory-summary" aria-labelledby="inventory-summary-title">
          <h2 id="inventory-summary-title">Resumen rápido</h2>
          <div>
            <article><span className="inventory-metric inventory-metric--blue"><Box size={23} /></span><strong>248</strong><small>Productos totales</small></article>
            <article><span className="inventory-metric inventory-metric--green"><CheckSquare size={23} /></span><strong>186</strong><small>Stock suficiente</small></article>
            <article><span className="inventory-metric inventory-metric--orange"><AlertTriangle size={23} /></span><strong>32</strong><small>Stock bajo</small></article>
            <article><span className="inventory-metric inventory-metric--purple">↓</span><strong>30</strong><small>Sin stock</small></article>
          </div>
        </section>

        <section className="branch-section" aria-labelledby="branch-title">
          <div className="inventory-section-heading">
            <h2 id="branch-title">Inventario por sucursal</h2>
            <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filtrar por sucursal">
              <option>Todas las sucursales</option>
              {branches.map(({ name }) => <option key={name}>{name}</option>)}
            </select>
          </div>
          <div className="branch-list">
            {visibleBranches.map(({ name, count, status, tone, icon: Icon }) => (
              <button type="button" className="branch-row" key={name}>
                <span className={`branch-icon branch-icon--${tone}`}><Icon size={22} /></span>
                <span className="branch-copy"><strong>{name}</strong><small>{count} productos</small></span>
                <span className={`stock-pill stock-pill--${tone}`}>{status}</span>
                <small className="branch-details">Ver detalles</small>
              </button>
            ))}
          </div>
        </section>

        <section className="low-stock-section" aria-labelledby="low-stock-title">
          <div className="inventory-section-heading"><h2 id="low-stock-title">Productos con stock bajo</h2><button type="button">Ver todos</button></div>
          <div className="low-stock-list">
            {inventoryProducts.map((product) => {
              const percentage = Math.min(100, (product.available / product.minimum) * 100)
              return (
                <button className="low-stock-row" type="button" key={product.id} onClick={() => navigate(`/inventario/productos/${product.id}`)}>
                  <span className={`product-initial product-initial--${product.tone}`}>{product.initial}</span>
                  <span className="product-copy"><strong>{product.name}</strong><small>Disponible: {product.available} piezas</small></span>
                  <span className="stock-level"><small>Stock mínimo: {product.minimum}</small><i><b style={{ width: `${percentage}%` }} /></i></span>
                  <span className="product-arrow"><ChevronRight size={18} /></span>
                </button>
              )
            })}
          </div>
        </section>
      </section>

      <div className="inventory-action"><button type="button">Agregar producto</button></div>
      <nav className="bottom-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button>
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button"><Box size={20} /><span>Inventario</span></button>
        <button className="bottom-navigation__item" type="button" disabled><ShoppingCart size={20} /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button>
      </nav>
    </main>
  )
}
