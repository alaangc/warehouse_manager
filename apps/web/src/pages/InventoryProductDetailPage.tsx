import { ArrowLeft, BarChart3, Box, Camera, Home, Menu, Package, ShoppingCart } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getInventoryProduct } from '../data/inventory-products'

export function InventoryProductDetailPage() {
  const navigate = useNavigate()
  const { productId } = useParams()
  const product = getInventoryProduct(productId)
  if (!product) return <Navigate to="/inventario" replace />

  const shortage = Math.max(0, product.minimum - product.available)

  return (
    <main className="product-detail-page">
      <header className="product-detail-topbar">
        <button type="button" onClick={() => navigate('/inventario')} aria-label="Volver al inventario"><ArrowLeft size={22} /></button>
        <span><Box size={22} /></span>
        <div><h1>Detalle del producto</h1><p>Información, stock y configuración</p></div>
      </header>

      <div className="product-detail-shell">
        <section className="product-hero">
          <div className={`product-photo product-photo--${product.tone}`}><Package size={42} /><small>{product.initial}</small><button type="button"><Camera size={10} /> Cambiar foto</button></div>
          <div className="product-hero-copy"><h2>{product.name}</h2><p>Código: {product.code} · Categoría: {product.category}</p><span>STOCK BAJO</span><small>Precio de venta</small><strong>{product.price}</strong></div>
          <div className="product-hero-actions"><button type="button">Editar producto</button><button type="button">Agregar stock</button></div>
        </section>

        <section className="inventory-detail-summary"><h2>Resumen de inventario</h2><div>
          <article><small>Stock total</small><strong>{product.available} piezas</strong></article>
          <article><small>Stock mínimo</small><strong>{product.minimum} piezas</strong></article>
          <article><small>Por surtir</small><strong className="danger-text">{shortage} piezas</strong></article>
          <article><small>Actualizado</small><strong>Hoy 10:42</strong></article>
        </div></section>

        <div className="product-detail-columns">
          <section className="location-stock-card"><h2>Stock por ubicación</h2><p>Distribución actual del producto</p>
            {product.locations.map((location) => {
              const percentage = Math.min(100, (location.stock / location.minimum) * 100)
              return <article key={location.name}><span><strong>{location.name}</strong><small className={location.stock === 0 ? 'danger-text' : ''}>{location.stock === 0 ? 'Sin existencias' : `${location.stock} piezas`} · mínimo {location.minimum}</small></span><i><b className={location.stock === 0 ? 'empty' : ''} style={{ width: `${percentage}%` }} /></i></article>
            })}
          </section>
          <section className="product-data-card"><h2>Datos del producto</h2><dl>
            <div><dt>Unidad de venta</dt><dd>{product.unit}</dd></div><div><dt>Paquete</dt><dd>{product.packageSize}</dd></div><div><dt>Proveedor</dt><dd>{product.supplier}</dd></div><div><dt>Costo</dt><dd>{product.cost}</dd></div><div><dt>Estado</dt><dd className="active-text">Activo</dd></div>
          </dl></section>
        </div>

        <section className="movement-card"><div><h2>Movimientos recientes</h2><button type="button">Ver historial</button></div>
          {product.movements.map((movement, index) => <article key={`${movement.type}-${index}`}><span><strong>{movement.type}</strong><small>{movement.detail}</small></span><b className={movement.amount > 0 ? 'positive-text' : 'danger-text'}>{movement.amount > 0 ? '+' : ''}{movement.amount} piezas</b></article>)}
        </section>
      </div>

      <div className="product-detail-actions"><button type="button">Eliminar producto</button><button type="button">Editar producto</button><button type="button">Agregar stock</button></div>
      <nav className="bottom-navigation" aria-label="Navegación principal"><button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button><button className="bottom-navigation__item bottom-navigation__item--active" type="button" onClick={() => navigate('/inventario')}><Box size={20} /><span>Inventario</span></button><button className="bottom-navigation__item" type="button" disabled><ShoppingCart size={20} /><span>Repartos</span></button><button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button><button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button></nav>
    </main>
  )
}
