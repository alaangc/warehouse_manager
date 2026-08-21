import { ArrowLeft, ArrowRight, BarChart3, Box, Check, ChevronRight, Home, Menu, Minus, Monitor, Package, Plus, Search, ShoppingCart, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDeliveries, saveDelivery } from '../services/deliveries'

const availableCustomers = [
  { id: 'CLI-00125', name: 'Abarrotes La Esquina', contact: 'Juan Pérez', phone: '662 123 4567', email: 'juan.perez@laesquina.com', address: 'Av. Reforma 123, Col. Centro', city: 'Hermosillo, Sonora, 83000', active: true },
  { id: 'CLI-00126', name: 'Mini Súper El Sol', contact: 'María López', phone: '662 987 6543', active: true },
  { id: 'CLI-00127', name: 'Tienda Don Chuy', contact: 'José Ramírez', phone: '662 555 7890', active: true },
  { id: 'CLI-00128', name: 'Depósito San José', contact: 'Ana Torres', phone: '662 111 2233', active: true },
]

const availableProducts = [
  { id: 'PROD-0001', name: 'Coca-Cola 600 ml', category: 'Sodas', price: 16, packSize: 24, tone: 'red' },
  { id: 'PROD-0002', name: 'Coca-Cola 2 L', category: 'Sodas', price: 28, packSize: 12, tone: 'red' },
  { id: 'PROD-0003', name: 'Sprite 600 ml', category: 'Sodas', price: 16, packSize: 24, tone: 'green' },
  { id: 'PROD-0010', name: 'Carbón 3 kg', category: 'Carbón', price: 38, packSize: 10, tone: 'black' },
  { id: 'PROD-0011', name: 'Carbón 5 kg', category: 'Carbón', price: 60, packSize: 8, tone: 'black' },
  { id: 'PROD-0020', name: 'Tostadas 20 pzas.', category: 'Tostadas', price: 28, packSize: 10, tone: 'orange' },
]

type ProductQuantity = { units: number; packs: number }
type QuantityKind = keyof ProductQuantity

export function NewDeliveryPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [query, setQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('CLI-00125')
  const [activeOnly, setActiveOnly] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [quantities, setQuantities] = useState<Record<string, ProductQuantity>>({})
  const [observations, setObservations] = useState('')
  const [notice, setNotice] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('es-MX')
  const customers = availableCustomers.filter((customer) => (!activeOnly || customer.active) && (!normalizedQuery || `${customer.name} ${customer.id} ${customer.contact}`.toLocaleLowerCase('es-MX').includes(normalizedQuery)))
  const normalizedProductQuery = productQuery.trim().toLocaleLowerCase('es-MX')
  const products = availableProducts.filter((product) => (category === 'Todos' || product.category === category) && (!normalizedProductQuery || `${product.name} ${product.id}`.toLocaleLowerCase('es-MX').includes(normalizedProductQuery)))
  const selectedCustomer = availableCustomers.find(({ id }) => id === selectedCustomerId)
  const selectedProducts = availableProducts.filter((product) => (quantities[product.id]?.units ?? 0) + (quantities[product.id]?.packs ?? 0) > 0)
  const totalItems = selectedProducts.reduce((total, product) => total + (quantities[product.id]?.units ?? 0) + (quantities[product.id]?.packs ?? 0) * product.packSize, 0)

  function changeQuantity(productId: string, kind: QuantityKind, change: number) {
    setQuantities((current) => {
      const quantity = current[productId] ?? { units: 0, packs: 0 }
      return { ...current, [productId]: { ...quantity, [kind]: Math.max(0, quantity[kind] + change) } }
    })
    setNotice('')
  }

  function goBack() {
    if (step === 3) setStep(2)
    else if (step === 2) setStep(1)
    else navigate('/inicio')
  }

  function createDelivery() {
    if (!selectedCustomer || selectedProducts.length === 0) return
    const deliveryNumber = String(23 + getDeliveries().length).padStart(5, '0')
    const now = new Date()
    const amountCents = selectedProducts.reduce((total, product) => total + ((quantities[product.id]?.units ?? 0) + (quantities[product.id]?.packs ?? 0) * product.packSize) * product.price * 100, 0)
    saveDelivery({
      id: `R-${deliveryNumber}`,
      driverName: 'Juan Pérez',
      startTime: now.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
      status: 'en-route',
      origin: 'Magdalena',
      vehicle: 'Camioneta 1',
      startedAt: now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
      accountName: selectedCustomer.name,
      accountCode: selectedCustomer.id,
      totalItems,
      loadedProducts: totalItems,
      soldProducts: 0,
      observations: observations.trim() || 'Sin observaciones',
      customers: [{
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        status: 'pending',
        amountCents,
        amount: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amountCents / 100),
        note: 'Pendiente de visita',
        address: [selectedCustomer.address, selectedCustomer.city].filter(Boolean).join(' · '),
        phone: selectedCustomer.phone,
        deliveredProducts: selectedProducts.map((product) => ({ id: product.id, name: product.name, category: product.category, quantity: (quantities[product.id]?.units ?? 0) + (quantities[product.id]?.packs ?? 0) * product.packSize, unitPriceCents: product.price * 100 })),
      }],
    })
    navigate('/inicio', { replace: true })
  }

  return (
    <main className="new-delivery-page">
      <header className="new-delivery-topbar"><button type="button" onClick={goBack} aria-label={step === 2 ? 'Volver a seleccionar cliente' : 'Volver al inicio'}><ArrowLeft size={21} /></button><strong>Nuevo reparto</strong><span aria-hidden="true" /></header>
      <div className="new-delivery-shell">
        <ol className="delivery-stepper" aria-label="Progreso del nuevo reparto">
          <li className={`delivery-step${step === 1 ? ' delivery-step--active' : ' delivery-step--complete'}`}><span>{step > 1 ? <Check size={17} /> : '1'}</span><strong>Cliente</strong></li>
          <li className={`delivery-step${step === 2 ? ' delivery-step--active' : step > 2 ? ' delivery-step--complete' : ''}`}><span>{step > 2 ? <Check size={17} /> : '2'}</span><strong>Productos</strong></li>
          <li className={`delivery-step${step === 3 ? ' delivery-step--active' : ''}`}><span>3</span><strong>Resumen</strong></li>
        </ol>

        {step === 1 ? <section className="customer-selection" aria-labelledby="select-customer-title">
          <div className="new-delivery-heading"><h1 id="select-customer-title">Seleccionar cliente</h1><p>Busca y selecciona el cliente al que se realizará el reparto.</p></div>
          <div className="new-delivery-search-row"><label className="new-delivery-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente por nombre o código..." /></label><button className={`customer-filter${activeOnly ? ' customer-filter--active' : ''}`} type="button" onClick={() => setActiveOnly((current) => !current)} aria-pressed={activeOnly} aria-label="Mostrar solamente clientes activos"><SlidersHorizontal size={18} /></button></div>
          <div className="selectable-customer-list">{customers.map((customer) => {
            const selected = selectedCustomerId === customer.id
            return <button className={`selectable-customer${selected ? ' selectable-customer--selected' : ''}`} type="button" key={customer.id} onClick={() => { setSelectedCustomerId(customer.id); setNotice('') }} aria-pressed={selected}>
              <span className="customer-radio" aria-hidden="true"><i /></span><span className="selectable-customer-title"><strong>{customer.name}</strong>{customer.active ? <em>ACTIVO</em> : null}</span>
              <span className="selectable-customer-data"><small>Código: <b>{customer.id}</b></small><small>Contacto: <b>{customer.contact}</b></small><small>Teléfono: <b>{customer.phone}</b></small>{customer.email ? <small>Email: <b>{customer.email}</b></small> : null}{customer.address ? <small>Dirección: <b>{customer.address}</b></small> : null}{customer.city ? <small>Ciudad: <b>{customer.city}</b></small> : null}</span>
            </button>
          })}{customers.length === 0 ? <div className="new-delivery-empty"><Search size={26} /><p>No encontramos clientes con esa búsqueda.</p></div> : null}</div>
        </section> : step === 2 ? <section className="product-selection" aria-labelledby="select-products-title">
          <div className="new-delivery-heading"><h1 id="select-products-title">Productos del reparto</h1><p>Agrega los productos que llevarás en este reparto.</p></div>
          <label className="new-delivery-search product-search"><Search size={18} /><input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto por nombre o código" /></label>
          <div className="product-categories" aria-label="Filtrar productos por categoría">{['Todos', 'Sodas', 'Carbón', 'Tostadas', 'Otros'].map((item) => <button className={category === item ? 'product-category--active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="product-picker-list">{products.map((product) => {
            const quantity = quantities[product.id] ?? { units: 0, packs: 0 }
            return <article className="product-picker-card" key={product.id}>
              <span className={`product-picker-image product-picker-image--${product.tone}`}><Package size={25} /></span>
              <span className="product-picker-copy"><strong>{product.name}</strong><small>Código: {product.id}</small><small>Precio: ${product.price.toFixed(2)}</small></span>
              <QuantityControl label="Individual" unitLabel="Pieza" value={quantity.units} onDecrease={() => changeQuantity(product.id, 'units', -1)} onIncrease={() => changeQuantity(product.id, 'units', 1)} />
              <QuantityControl label={`Paquete (${product.packSize} pzas.)`} unitLabel="Paquetes" value={quantity.packs} onDecrease={() => changeQuantity(product.id, 'packs', -1)} onIncrease={() => changeQuantity(product.id, 'packs', 1)} />
            </article>
          })}{products.length === 0 ? <div className="new-delivery-empty"><Search size={26} /><p>No encontramos productos con esos filtros.</p></div> : null}</div>
        </section> : <section className="delivery-review" aria-labelledby="delivery-review-title">
          <div className="new-delivery-heading"><h1 id="delivery-review-title">Resumen del reparto</h1><p>Revisa la información antes de crear el reparto.</p></div>
          {selectedCustomer ? <button className="review-customer-card" type="button" onClick={() => setStep(1)}>
            <span className="review-customer-icon"><Monitor size={25} /></span><span className="review-customer-title"><strong>{selectedCustomer.name}</strong><em>ACTIVO</em><small>Código: {selectedCustomer.id}</small></span><ChevronRight size={24} />
            <span className="review-customer-data"><small>Contacto</small><b>{selectedCustomer.contact}</b><small>Teléfono</small><b>{selectedCustomer.phone}</b>{selectedCustomer.email ? <><small>Correo</small><b>{selectedCustomer.email}</b></> : null}<small>Dirección</small><b>{[selectedCustomer.address, selectedCustomer.city].filter(Boolean).join(' · ')}</b></span>
          </button> : null}
          <section className="review-products-card"><div className="review-card-heading"><h2>Productos del reparto ({selectedProducts.length})</h2><button type="button" onClick={() => setStep(2)}>Editar</button></div>
            {selectedProducts.map((product) => { const quantity = quantities[product.id] ?? { units: 0, packs: 0 }; return <div className="review-product-row" key={product.id}><i className={`review-product-swatch review-product-swatch--${product.tone}`} /><span><strong>{product.name}</strong><small>{quantity.units > 0 ? `Individual: ${quantity.units} piezas` : ''}{quantity.units > 0 && quantity.packs > 0 ? ' · ' : ''}{quantity.packs > 0 ? `Paquete (${product.packSize} pzas.): ${quantity.packs} paquetes` : ''}</small></span><b>{quantity.packs > 0 ? `${quantity.packs} paquetes` : `${quantity.units} piezas`}</b></div> })}
            <div className="review-products-total"><span><Box size={18} /></span><strong>Total de artículos</strong><b>{totalItems} unidades</b></div>
          </section>
          <section className="review-delivery-info"><h2>Información del reparto</h2><dl><div><dt>Fecha</dt><dd>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt>Repartidor</dt><dd>Juan Pérez</dd></div><div><dt>Vehículo</dt><dd>Camioneta 1</dd></div></dl><label className="delivery-observations"><span>Observaciones</span><textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Agrega indicaciones, notas de entrega o comentarios..." maxLength={500} /><small>{observations.length}/500</small></label></section>
        </section>}
      </div>

      <div className="new-delivery-action-bar">
        {step === 1 ? <button type="button" disabled={!selectedCustomerId} onClick={() => { setStep(2); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Siguiente: Productos <ArrowRight size={18} /></button> : step === 2 ? <button type="button" disabled={selectedProducts.length === 0} onClick={() => { setStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Siguiente: Resumen <ArrowRight size={18} /></button> : <button type="button" onClick={createDelivery}>Crear reparto <Check size={19} /></button>}
        {notice ? <p id="new-delivery-notice" role="status">{notice}</p> : null}
      </div>
      <nav className="bottom-navigation" aria-label="Navegación principal"><button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button><button className="bottom-navigation__item" type="button" onClick={() => navigate('/inventario')}><Box size={20} /><span>Inventario</span></button><button className="bottom-navigation__item bottom-navigation__item--active" type="button"><ShoppingCart size={20} /><span>Repartos</span></button><button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button><button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button></nav>
    </main>
  )
}

function QuantityControl({ label, unitLabel, value, onDecrease, onIncrease }: { label: string; unitLabel: string; value: number; onDecrease: () => void; onIncrease: () => void }) {
  return <div className="quantity-control"><strong>{label}</strong><span><button type="button" onClick={onDecrease} disabled={value === 0} aria-label={`Quitar ${unitLabel.toLowerCase()}`}><Minus size={14} /></button><b>{value}</b><button type="button" onClick={onIncrease} aria-label={`Agregar ${unitLabel.toLowerCase()}`}><Plus size={14} /></button></span><small>{unitLabel}</small></div>
}
