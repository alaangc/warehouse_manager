import { ArrowLeft, BarChart3, Check, Circle, Home, MapPin, Menu, Package, Pencil, Phone, Save, ShoppingCart, Store, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getVisitedCustomerIds } from '../services/delivery-visits'
import { getDeliveryCustomers } from '../services/delivery-customers'
import { getDeliveries } from '../services/deliveries'

type DeliveredProduct = { id: string; name: string; category: string; quantity: number; unitPriceCents: number }

const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function DeliveryCustomerDetailPage() {
  const { deliveryId, customerId } = useParams()
  const navigate = useNavigate()
  const delivery = getDeliveries().find(({ id }) => id === deliveryId)
  const customers = getDeliveryCustomers(delivery)
  const customer = customers.find(({ id }) => id === customerId)
  const [visitedCustomerIds] = useState(() => getVisitedCustomerIds(customers.filter(({ status }) => status === 'visited').map(({ id }) => id)))
  const [products, setProducts] = useState<DeliveredProduct[]>(() => customer?.deliveredProducts ?? [])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  if (!delivery || !customer) return <Navigate to="/inicio" replace />

  const isVisited = visitedCustomerIds.has(customer.id)
  const categoryTotals = products.reduce<Record<string, number>>((totals, product) => {
    totals[product.category] = (totals[product.category] ?? 0) + product.quantity * product.unitPriceCents
    return totals
  }, {})
  const grandTotalCents = products.reduce((total, product) => total + product.quantity * product.unitPriceCents, 0)
  const totalUnits = products.reduce((total, product) => total + product.quantity, 0)

  function updateProduct(productId: string, field: 'quantity' | 'unitPriceCents', value: number) {
    setProducts((currentProducts) => currentProducts.map((product) => product.id === productId
      ? { ...product, [field]: Math.max(0, value) }
      : product))
  }

  return (
    <main className="customer-detail-page">
      <header className="detail-topbar">
        <button type="button" onClick={() => navigate(`/repartos/${delivery.id}`)} aria-label="Volver al reparto"><ArrowLeft size={21} /></button>
        <strong>Detalles de la entrega</strong><span aria-hidden="true" />
      </header>
      <div className="customer-detail-shell">
        <section className="customer-profile-card">
          <span className="customer-profile-icon"><Store size={30} aria-hidden="true" /></span>
          <div><p>{customer.id}</p><h1>{customer.name}</h1></div>
          <span className={`customer-detail-status customer-detail-status--${isVisited ? 'visited' : 'pending'}`}>{isVisited ? <Check size={14} /> : <Circle size={14} />}{isVisited ? 'Entregado' : 'Pendiente'}</span>
        </section>

        <section className="customer-information" aria-labelledby="customer-information-title">
          <h2 id="customer-information-title">Datos de la entrega</h2>
          <dl>
            <div><dt><MapPin size={18} />Dirección</dt><dd>{customer.address}</dd></div>
            <div><dt><Phone size={18} />Teléfono</dt><dd><a href={`tel:${customer.phone.replaceAll(' ', '')}`}>{customer.phone}</a></dd></div>
            <div><dt><Truck size={18} />Repartidor</dt><dd>{delivery.driverName}</dd></div>
            <div><dt><Package size={18} />Reparto</dt><dd>#{delivery.id} · {delivery.vehicle}</dd></div>
          </dl>
        </section>

        <section className="delivered-products" aria-labelledby="delivered-products-title">
          <div className="delivered-products-heading">
            <div><h2 id="delivered-products-title">Productos entregados</h2><p>{totalUnits} unidades · {products.length} productos</p></div>
            <strong>{currencyFormatter.format(grandTotalCents / 100)}</strong>
          </div>
          {products.length > 0 ? <div className="delivered-product-list">{products.map((product) => {
            const isEditing = editingProductId === product.id
            return <article className="delivered-product-row" key={product.id}>
              <span className="delivered-product-icon"><Package size={19} aria-hidden="true" /></span>
              <div className="delivered-product-copy"><strong>{product.name}</strong><small>{product.category} · {product.id}</small></div>
              <button className="edit-product-button" type="button" onClick={() => setEditingProductId(isEditing ? null : product.id)} aria-label={`Editar ${product.name}`}>{isEditing ? <X size={17} /> : <Pencil size={17} />}</button>
              {isEditing ? <div className="product-edit-form">
                <label>Cantidad<input type="number" min="0" value={product.quantity} onChange={(event) => updateProduct(product.id, 'quantity', Number(event.target.value))} /></label>
                <label>Precio unitario<input type="number" min="0" step="0.01" value={product.unitPriceCents / 100} onChange={(event) => updateProduct(product.id, 'unitPriceCents', Math.round(Number(event.target.value) * 100))} /></label>
                <button type="button" onClick={() => setEditingProductId(null)}><Save size={15} /> Guardar</button>
              </div> : <div className="product-amount"><span>{product.quantity} × {currencyFormatter.format(product.unitPriceCents / 100)}</span><strong>{currencyFormatter.format(product.quantity * product.unitPriceCents / 100)}</strong></div>}
            </article>
          })}</div> : <div className="no-products"><Package size={26} /><p>Aún no hay productos registrados en esta entrega.</p></div>}
        </section>

        {products.length > 0 ? <section className="category-costs" aria-labelledby="category-costs-title">
          <h2 id="category-costs-title">Costo por categoría</h2>
          <dl>{Object.entries(categoryTotals).map(([category, totalCents]) => <div key={category}><dt>{category}</dt><dd>{currencyFormatter.format(totalCents / 100)}</dd></div>)}<div className="category-total"><dt>Total</dt><dd>{currencyFormatter.format(grandTotalCents / 100)}</dd></div></dl>
        </section> : null}

        <button className="return-delivery-button" type="button" onClick={() => navigate(`/repartos/${delivery.id}`)}>Volver al reparto</button>
      </div>
      <nav className="bottom-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button>
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inventario')}><Package size={20} /><span>Inventario</span></button>
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button" onClick={() => navigate(`/repartos/${delivery.id}`)}><ShoppingCart size={20} /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button>
      </nav>
    </main>
  )
}
