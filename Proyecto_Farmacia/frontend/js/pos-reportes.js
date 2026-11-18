let carritoPOS = [];
let reportesCache = { porUsuario: [], mensual: [], recientes: [] };

// ==========================================
// 1. PUNTO DE VENTA Y TICKET 100% EDITABLE
// ==========================================
window.inicializarPOS = async function () {
    try {
        const [resProd, resMetodos] = await Promise.all([
            apiFetch('/api/inventario'),
            apiFetch('/api/caja/metodos-pago')
        ]);
        if (!resProd.ok) {
            mostrarErrorPOS(`El servidor respondió con error ${resProd.status} al leer el inventario.`);
            return;
        }
        inventarioLista = await resProd.json();
        metodosPagoLista = resMetodos.ok ? await resMetodos.json() : [];

        const sel = document.getElementById('pos-metodo-pago');
        if (sel) {
            if (metodosPagoLista.length > 0) {
                sel.innerHTML = metodosPagoLista.map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
            } else {
                sel.innerHTML = `<option value="EFECTIVO">EFECTIVO</option><option value="TARJETA">TARJETA</option><option value="TRANSFERENCIA">TRANSFERENCIA</option>`;
            }
        }

        const user = typeof getUsuarioSesion === 'function' ? getUsuarioSesion() : { nombre: 'Cajero' };
        const lblCajero = document.getElementById('ticket-cajero-nombre');
        const lblFecha = document.getElementById('ticket-fecha-hora');
        if (lblCajero) lblCajero.textContent = user.nombre || user.username || 'Cajero';
        if (lblFecha) lblFecha.textContent = new Date().toLocaleString();

        filtrarCatalogoPOS();
        renderCarritoPOS();
    } catch (err) {
        console.error('Error inicializando POS:', err);
        mostrarErrorPOS('No se pudo conectar con el servidor. Verifica que esté corriendo (en la carpeta backend: npm start) y abre http://localhost:3000');
    }
};

function mostrarErrorPOS(msg) {
    const grid = document.getElementById('pos-catalogo-grid');
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#dc2626; font-weight:600;">❌ ${esc(msg)}</div>`;
}

window.filtrarCatalogoPOS = function () {
    const q = (document.getElementById('pos-search')?.value || '').toLowerCase();
    const grid = document.getElementById('pos-catalogo-grid');
    if (!grid) return;

    if (!inventarioLista || inventarioLista.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#64748b;">
            No hay productos en inventario. Ve a <strong>Inventario &gt; + Nuevo Producto</strong> para crear uno.
        </div>`;
        return;
    }

    const filtrados = inventarioLista.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.principio_activo && p.principio_activo.toLowerCase().includes(q)) ||
        (p.categoria_nombre && p.categoria_nombre.toLowerCase().includes(q)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q))
    );

    grid.innerHTML = filtrados.map(p => {
        const sinStock = p.stock <= 0;
        return `
            <div onclick="${sinStock ? '' : `agregarProductoPOS(${p.id})`}" 
                 style="padding:0.85rem; border:1px solid ${sinStock ? '#fecaca' : '#cbd5e1'}; border-radius:10px; cursor:${sinStock ? 'not-allowed' : 'pointer'}; background:${sinStock ? '#fff5f5' : '#f8fafc'};">
                <span style="font-size:0.7rem; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:600;">
                    ${p.categoria_nombre || 'General'}
                </span>
                <div style="font-weight:700; color:#0f172a; font-size:0.95rem; margin-top:0.35rem;">${esc(p.nombre)}</div>
                <div style="font-size:0.78rem; color:#64748b;">${p.principio_activo || 'Producto estándar'}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.65rem; padding-top:0.45rem; border-top:1px dashed #cbd5e1;">
                    <strong style="color:#0066cc; font-size:1rem;">$${Number(p.precio_venta).toLocaleString()}</strong>
                    <span style="font-size:0.76rem; font-weight:700; color:${sinStock ? '#dc2626' : '#059669'};">
                        ${sinStock ? 'AGOTADO' : `Disp: ${p.stock}`}
                    </span>
                </div>
            </div>
        `;
    }).join('');
};

window.agregarProductoPOS = function (id) {
    const prod = inventarioLista.find(p => p.id === id);
    if (!prod || prod.stock <= 0) return;

    const existente = carritoPOS.find(item => item.producto_id === id);
    if (existente) {
        if (existente.cantidad < prod.stock) existente.cantidad++;
        else return alert('⚠️ Stock máximo disponible alcanzado.');
    } else {
        carritoPOS.push({
            producto_id: prod.id,
            nombre: prod.nombre,
            tipo: prod.categoria_nombre || 'General',
            precio: Number(prod.precio_venta),
            cantidad: 1,
            maxStock: prod.stock
        });
    }
    renderCarritoPOS();
};

window.editarItemTicket = function (idx, campo, valor) {
    const num = Number(valor);
    if (campo === 'cantidad') {
        if (num <= 0) carritoPOS.splice(idx, 1);
        else if (num <= carritoPOS[idx].maxStock) carritoPOS[idx].cantidad = num;
        else alert(`⚠️ Stock máximo: ${carritoPOS[idx].maxStock}`);
    } else if (campo === 'precio') {
        if (num >= 0) carritoPOS[idx].precio = num;
    }
    renderCarritoPOS();
};

window.vaciarCarritoPOS = function () {
    carritoPOS = [];
    const rec = document.getElementById('pos-recibido');
    if (rec) rec.value = '';
    renderCarritoPOS();
};

window.renderCarritoPOS = function () {
    const tbody = document.getElementById('pos-carrito-tbody');
    if (!tbody) return;
    let total = 0;
    let unidades = 0;

    if (carritoPOS.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:1.2rem;">Seleccione productos del catálogo para armar el ticket.</td></tr>`;
    } else {
        tbody.innerHTML = carritoPOS.map((item, idx) => {
            const sub = item.precio * item.cantidad;
            total += sub;
            unidades += item.cantidad;
            return `
                <tr>
                    <td>
                        <strong>${esc(item.nombre)}</strong>
                        <div style="font-size:0.74rem; color:#64748b;">${item.tipo}</div>
                    </td>
                    <td><input type="number" min="1" max="${item.maxStock}" value="${item.cantidad}" onchange="editarItemTicket(${idx}, 'cantidad', this.value)" style="width:52px; padding:0.25rem; border:1px solid #cbd5e1; border-radius:4px;"></td>
                    <td><input type="number" min="0" value="${item.precio}" onchange="editarItemTicket(${idx}, 'precio', this.value)" style="width:82px; padding:0.25rem; border:1px solid #cbd5e1; border-radius:4px; color:#0066cc; font-weight:600;"></td>
                    <td><strong>$${sub.toLocaleString()}</strong></td>
                    <td><button type="button" onclick="carritoPOS.splice(${idx},1); renderCarritoPOS();" style="color:#dc2626; background:none; border:none; cursor:pointer; font-weight:bold;">✕</button></td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('pos-total-pagar').textContent = `$${total.toLocaleString()}`;
    const lblItems = document.getElementById('ticket-total-items');
    if (lblItems) lblItems.textContent = unidades;
    calcularCambioPOS();
};

window.calcularCambioPOS = function () {
    const total = carritoPOS.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    const recibido = Number(document.getElementById('pos-recibido')?.value || 0);
    const lbl = document.getElementById('pos-cambio-texto');
    if (!lbl) return;
    if (recibido > 0 && recibido >= total) lbl.textContent = `Cambio: $${(recibido - total).toLocaleString()}`;
    else if (recibido > 0 && recibido < total) lbl.textContent = `Falta: $${(total - recibido).toLocaleString()}`;
    else lbl.textContent = '';
};

window.confirmarVentaPOS = async function () {
    if (carritoPOS.length === 0) return alert('⚠️ Agregue al menos un producto al ticket.');
    const user = typeof getUsuarioSesion === 'function' ? getUsuarioSesion() : { id: 1 };
    const metodo_pago = document.getElementById('pos-metodo-pago').value;

    let res, data;
    try {
        res = await apiFetch('/api/caja/ventas', {
            method: 'POST',
            body: JSON.stringify({
                usuario_id: user.id,
                metodo_pago,
                items: carritoPOS
            })
        });
        data = await res.json();
    } catch (e) {
        return alert('❌ No se pudo conectar con el servidor. ¿Está corriendo npm start?');
    }
    if (res.ok) {
        alert(`✅ Ticket #${data.ventaId} emitido por $${Number(data.totalVenta).toLocaleString()} (${metodo_pago})`);
        vaciarCarritoPOS();
        inicializarPOS();
    } else {
        alert('❌ ' + data.error);
    }
};

// ==========================================
// 2. REPORTES Y EXPORTACIÓN MENSUAL A EXCEL
// ==========================================
window.cargarModuloReportes = async function () {
    const inputMes = document.getElementById('rep-mes-excel');
    if (inputMes && !inputMes.value) {
        inputMes.value = new Date().toISOString().slice(0, 7);
    }

    const [resRep, resMet] = await Promise.all([
        apiFetch('/api/caja/reportes'),
        apiFetch('/api/caja/metodos-pago')
    ]);
    reportesCache = resRep.ok ? await resRep.json() : { porUsuario: [], mensual: [], recientes: [] };
    metodosPagoLista = resMet.ok ? await resMet.json() : [];

    document.getElementById('rep-usuarios-tbody').innerHTML = (reportesCache.porUsuario || []).map(u => `
        <tr>
            <td><strong>${u.nombre}</strong></td>
            <td>${u.username}</td>
            <td>${u.total_ventas}</td>
            <td style="color:#0066cc; font-weight:700;">$${Number(u.monto_total).toLocaleString()}</td>
        </tr>
    `).join('');

    document.getElementById('rep-mensual-tbody').innerHTML = (reportesCache.mensual || []).map(m => `
        <tr>
            <td><strong>${m.mes}</strong></td>
            <td>${m.cantidad_ventas}</td>
            <td style="color:#059669; font-weight:700;">$${Number(m.ingresos_totales).toLocaleString()}</td>
        </tr>
    `).join('');

    document.getElementById('rep-recientes-tbody').innerHTML = (reportesCache.recientes || []).map(r => {
        const opcionesMetodos = metodosPagoLista.map(mp =>
            `<option value="${mp.nombre}" ${mp.nombre === r.metodo_pago ? 'selected' : ''}>${mp.nombre}</option>`
        ).join('');

        return `
            <tr>
                <td><strong>#${r.id}</strong></td>
                <td>${new Date(r.fecha).toLocaleString()}</td>
                <td style="font-size:0.84rem;">${r.productos_resumen || '-'}</td>
                <td>${r.cajero || 'Sistema'}</td>
                <td>
                    <select class="cell-select" onchange="editarMetodoVenta(${r.id}, this)">
                        ${opcionesMetodos}
                    </select>
                </td>
                <td><strong>$${Number(r.total).toLocaleString()}</strong></td>
                <td>
                    <button type="button" class="btn-outline-sm" style="color:#dc2626;" onclick="anularVenta(${r.id})" title="Anular ticket">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

window.exportarReporteMensualExcel = function () {
    const mesSeleccionado = document.getElementById('rep-mes-excel')?.value || new Date().toISOString().slice(0, 7);
    const ventasMes = (reportesCache.recientes || []).filter(v => (v.fecha || '').startsWith(mesSeleccionado));

    if (ventasMes.length === 0) {
        return alert(`⚠️ No hay ventas registradas en el mes ${mesSeleccionado} para exportar.`);
    }

    let totalMes = 0;
    let tablaHTML = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"></head>
        <body>
            <h2>Reporte Mensual de Ventas - Droguería POS (${mesSeleccionado})</h2>
            <table border="1">
                <thead>
                    <tr style="background:#0066cc; color:#ffffff; font-weight:bold;">
                        <th>Ticket #</th>
                        <th>Fecha y Hora</th>
                        <th>Productos Vendidos</th>
                        <th>Cajero</th>
                        <th>Método de Pago</th>
                        <th>Total ($)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    ventasMes.forEach(v => {
        totalMes += Number(v.total || 0);
        tablaHTML += `
            <tr>
                <td>${v.id}</td>
                <td>${new Date(v.fecha).toLocaleString()}</td>
                <td>${v.productos_resumen || ''}</td>
                <td>${v.cajero || ''}</td>
                <td>${v.metodo_pago}</td>
                <td>${Number(v.total)}</td>
            </tr>
        `;
    });

    tablaHTML += `
                    <tr style="font-weight:bold; background:#f1f5f9;">
                        <td colspan="5">TOTAL INGRESOS DEL MES (${mesSeleccionado})</td>
                        <td>${totalMes}</td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob([tablaHTML], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Ventas_${mesSeleccionado}.xls`;
    a.click();
    URL.revokeObjectURL(url);
};

window.editarMetodoVenta = async function (id, selectEl) {
    const res = await apiFetch(`/api/caja/ventas/${id}/inline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo_pago: selectEl.value })
    });
    if (res.ok) {
        selectEl.classList.add('cell-saved');
        setTimeout(() => selectEl.classList.remove('cell-saved'), 600);
    }
};

window.anularVenta = async function (id) {
    if (!confirm('¿Anular este ticket y devolver las unidades al inventario?')) return;
    const res = await apiFetch(`/api/caja/ventas/${id}`, { method: 'DELETE' });
    if (res.ok) cargarModuloReportes();
};

// Cargar automáticamente al entrar
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        inicializarPOS();
    }, 300);
});