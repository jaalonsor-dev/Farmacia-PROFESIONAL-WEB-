let inventarioLista = [];
let categoriasLista = [];
let metodosPagoLista = [];
let saldoEsperadoCaja = 0;

function getUsuarioSesion() {
    const raw = sessionStorage.getItem('user') || sessionStorage.getItem('usuario') || localStorage.getItem('user');
    try {
        return raw ? JSON.parse(raw) : { id: 1, nombre: 'Super Admin', rol: 'SUPERADMIN' };
    } catch {
        return { id: 1, nombre: 'Super Admin', rol: 'SUPERADMIN' };
    }
}

// Escapa texto para usarlo dentro de atributos HTML (evita que comillas rompan la tabla)
window.esc = function (v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

async function apiFetch(url, options = {}) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };
    return fetch(`${window.API_BASE || ''}${url}`, { ...options, headers });
}

// ==========================================
// 1. NAVEGACIÓN Y MODALES GLOBALES
// ==========================================
window.cambiarVista = function (vista, btn) {
    document.querySelectorAll('.view-section').forEach(s => (s.style.display = 'none'));
    const target = document.getElementById(`view-${vista}`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.sidebar-nav .nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (vista === 'pos' && typeof inicializarPOS === 'function') inicializarPOS();
    if (vista === 'inventario') cargarModuloInventario();
    if (vista === 'caja') cargarModuloCaja();
    if (vista === 'reportes' && typeof cargarModuloReportes === 'function') cargarModuloReportes();
    if (vista === 'usuarios' && typeof cargarTablaUsuarios === 'function') cargarTablaUsuarios();
};

window.abrirModal = function (id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
};

window.cerrarModal = function (id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
};

window.abrirModalCategorias = function () {
    renderListaCategorias();
    abrirModal('modal-categorias');
};

window.abrirModalMetodosPago = function () {
    renderListaMetodosPago();
    abrirModal('modal-metodos-pago');
};

// ==========================================
// 2. INVENTARIO EDITABLE CELDA POR CELDA
// ==========================================
window.cargarModuloInventario = async function () {
    try {
        const [resProd, resResumen, resCats] = await Promise.all([
            apiFetch('/api/inventario'),
            apiFetch('/api/inventario/resumen'),
            apiFetch('/api/inventario/categorias')
        ]);

        if (!resProd.ok) {
            mostrarErrorInventario(`El servidor respondió con error ${resProd.status} al leer el inventario.`);
            return;
        }

        inventarioLista = await resProd.json();
        const resumen = resResumen.ok ? await resResumen.json() : {};
        categoriasLista = resCats.ok ? await resCats.json() : [];

        document.getElementById('kpi-inv-total').textContent = resumen.total_productos || inventarioLista.length;
        document.getElementById('kpi-inv-valor').textContent = `$${Number(resumen.valor_venta_estimado || 0).toLocaleString()}`;
        document.getElementById('kpi-inv-stock').textContent = resumen.alertas_stock || 0;
        document.getElementById('kpi-inv-venc').textContent = resumen.alertas_vencimiento || 0;

        filtrarInventario();
    } catch (e) {
        console.error('Error en cargarModuloInventario:', e);
        mostrarErrorInventario('No se pudo conectar con el servidor. Verifica que esté corriendo (en la carpeta backend: npm start) y abre http://localhost:3000');
    }
};

function mostrarErrorInventario(msg) {
    const tbody = document.getElementById('inventario-tbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:1.5rem; color:#dc2626; font-weight:600;">❌ ${esc(msg)}</td></tr>`;
    }
}

window.filtrarInventario = function () {
    const texto = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const estado = document.getElementById('inv-filter-estado')?.value || 'TODOS';
    const tbody = document.getElementById('inventario-tbody');
    if (!tbody) return;

    const filtrados = inventarioLista.filter(p => {
        const match =
            (p.nombre && p.nombre.toLowerCase().includes(texto)) ||
            (p.principio_activo && p.principio_activo.toLowerCase().includes(texto)) ||
            (p.codigo_barras && p.codigo_barras.toLowerCase().includes(texto)) ||
            (p.lote && p.lote.toLowerCase().includes(texto));

        if (!match) return false;
        if (estado === 'BAJO') return Number(p.stock) <= Number(p.stock_minimo);
        if (estado === 'VENCIMIENTO') return p.estado_vencimiento && p.estado_vencimiento !== 'VIGENTE';
        return true;
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:1.5rem; color:#64748b;">
            No hay productos. Haz clic en <strong>+ Nuevo Producto</strong> arriba a la derecha.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(p => {
        const opcionesCat = `<option value="">Sin tipo</option>` +
            categoriasLista.map(c => `<option value="${c.id}" ${c.id == p.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

        const colorStock = Number(p.stock) <= Number(p.stock_minimo)
            ? 'color:#dc2626; font-weight:700;'
            : 'color:#059669; font-weight:700;';

        return `
            <tr>
                <td><input class="cell-input" style="width:95px" value="${esc(p.codigo_barras)}" onchange="editarCeldaInventario(${p.id}, 'codigo_barras', this)"></td>
                <td><input class="cell-input" style="font-weight:600; min-width:160px" value="${esc(p.nombre)}" onchange="editarCeldaInventario(${p.id}, 'nombre', this)"></td>
                <td><input class="cell-input" style="min-width:130px" value="${esc(p.principio_activo)}" onchange="editarCeldaInventario(${p.id}, 'principio_activo', this)"></td>
                <td><select class="cell-select" style="min-width:135px" onchange="editarCeldaInventario(${p.id}, 'categoria_id', this)">${opcionesCat}</select></td>
                <td><input class="cell-input" style="width:85px" value="${esc(p.lote)}" onchange="editarCeldaInventario(${p.id}, 'lote', this)"></td>
                <td><input type="date" class="cell-input" value="${p.fecha_vencimiento || ''}" onchange="editarCeldaInventario(${p.id}, 'fecha_vencimiento', this)"></td>
                <td><input type="number" class="cell-input" style="width:90px" value="${p.precio_compra}" onchange="editarCeldaInventario(${p.id}, 'precio_compra', this)"></td>
                <td><input type="number" class="cell-input" style="width:90px; color:#0066cc; font-weight:700" value="${p.precio_venta}" onchange="editarCeldaInventario(${p.id}, 'precio_venta', this)"></td>
                <td><input type="number" class="cell-input" style="width:70px; ${colorStock}" value="${p.stock}" onchange="editarCeldaInventario(${p.id}, 'stock', this)"></td>
                <td><input type="number" class="cell-input" style="width:60px" value="${p.stock_minimo}" onchange="editarCeldaInventario(${p.id}, 'stock_minimo', this)"></td>
                <td style="white-space:nowrap;">
                    <button type="button" class="btn-outline-sm" style="color:#059669; border-color:#a7f3d0;" onclick="venderDesdeInventario(${p.id})" title="Vender (agregar al ticket del POS)" ${Number(p.stock) <= 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    <button type="button" class="btn-outline-sm" style="color:#0066cc; border-color:#bfdbfe;" onclick="ajustarStockInventario(${p.id})" title="Ajustar stock (entrada / salida)">
                        <i class="fa-solid fa-plus-minus"></i>
                    </button>
                    <button type="button" class="btn-outline-sm" style="color:#dc2626; border-color:#fecaca;" onclick="eliminarProducto(${p.id})" title="Eliminar producto">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

// Vender: agrega el producto al ticket del Punto de Venta y salta a esa vista
window.venderDesdeInventario = function (id) {
    const prod = inventarioLista.find(p => p.id === id);
    if (!prod) return alert('❌ Producto no encontrado. Actualiza el inventario.');
    if (Number(prod.stock) <= 0) return alert('⚠️ Este producto está agotado.');
    if (typeof agregarProductoPOS !== 'function') return alert('❌ El módulo de ventas no cargó. Recarga la página (Ctrl+F5).');
    agregarProductoPOS(id);
    const btnPos = document.querySelector(".sidebar-nav .nav-btn[onclick*=\"'pos'\"]");
    cambiarVista('pos', btnPos);
};

// Ajustar stock: positivo = entrada, negativo = salida (merma, daño, etc.)
window.ajustarStockInventario = async function (id) {
    const prod = inventarioLista.find(p => p.id === id);
    if (!prod) return;
    const txt = prompt(`Ajustar stock de "${prod.nombre}" (actual: ${prod.stock}).\nEscribe un número: positivo para ENTRADA (ej. 10), negativo para SALIDA (ej. -3).`);
    if (txt === null) return;
    const n = Number(txt);
    if (!Number.isFinite(n) || n === 0) return alert('⚠️ Escribe un número distinto de cero.');

    const res = await apiFetch(`/api/inventario/${id}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ tipo_ajuste: n < 0 ? 'SALIDA' : 'ENTRADA', cantidad: Math.abs(n) })
    });
    if (res.ok) {
        await cargarModuloInventario();
    } else {
        const err = await res.json().catch(() => ({}));
        alert('❌ ' + (err.error || 'No se pudo ajustar el stock'));
    }
};

window.editarCeldaInventario = async function (id, campo, inputEl) {
    const res = await apiFetch(`/api/inventario/${id}/inline`, {
        method: 'PATCH',
        body: JSON.stringify({ campo, valor: inputEl.value })
    });

    if (res.ok) {
        inputEl.classList.add('cell-saved');
        setTimeout(() => inputEl.classList.remove('cell-saved'), 600);
        const resResumen = await apiFetch('/api/inventario/resumen');
        if (resResumen.ok) {
            const resumen = await resResumen.json();
            document.getElementById('kpi-inv-total').textContent = resumen.total_productos || 0;
            document.getElementById('kpi-inv-valor').textContent = `$${Number(resumen.valor_venta_estimado || 0).toLocaleString()}`;
            document.getElementById('kpi-inv-stock').textContent = resumen.alertas_stock || 0;
            document.getElementById('kpi-inv-venc').textContent = resumen.alertas_vencimiento || 0;
        }
    } else {
        const err = await res.json();
        alert('❌ Error guardando celda: ' + (err.error || 'Verifica los datos'));
    }
};

window.agregarFilaRapidaInventario = async function () {
    const codigoAuto = 'PRD-' + Math.floor(1000 + Math.random() * 9000);
    const res = await apiFetch('/api/inventario', {
        method: 'POST',
        body: JSON.stringify({
            codigo_barras: codigoAuto,
            nombre: 'Nuevo Producto (Editar)',
            principio_activo: '',
            categoria_id: categoriasLista[0]?.id || null,
            precio_compra: 1000,
            precio_venta: 2000,
            stock: 10,
            stock_minimo: 3
        })
    });
    if (res.ok) {
        await cargarModuloInventario();
    } else {
        const err = await res.json();
        alert('❌ No se pudo crear el producto: ' + (err.error || res.status));
    }
};

window.eliminarProducto = async function (id) {
    if (!confirm('¿Eliminar este producto de la base de datos?')) return;
    const res = await apiFetch(`/api/inventario/${id}`, { method: 'DELETE' });
    if (res.ok) cargarModuloInventario();
    else alert('❌ No se puede eliminar porque ya tiene ventas registradas.');
};

function renderListaCategorias() {
    const ul = document.getElementById('lista-categorias-ul');
    if (!ul) return;
    ul.innerHTML = categoriasLista.map(c => `
        <li style="display:flex; justify-content:space-between; padding:0.55rem; border-bottom:1px solid #e2e8f0;">
            <span>${c.nombre}</span>
            <button type="button" onclick="eliminarCategoria(${c.id})" style="color:#dc2626; background:none; border:none; cursor:pointer; font-weight:bold;">✕</button>
        </li>
    `).join('');
}

window.eliminarCategoria = async function (id) {
    await apiFetch(`/api/inventario/categorias/${id}`, { method: 'DELETE' });
    await cargarModuloInventario();
    renderListaCategorias();
};

// ==========================================
// 3. FLUJO DE CAJA EDITABLE Y MÉTODOS DE PAGO
// ==========================================
window.actualizarFormularioCaja = function () {
    const tipo = document.getElementById('caja-tipo')?.value;
    const ocultarMedio = (tipo === 'APERTURA' || tipo === 'CIERRE');
    const grpMedio = document.getElementById('grupo-caja-metodo');
    const lblMonto = document.getElementById('lbl-caja-monto');
    if (grpMedio) grpMedio.style.display = ocultarMedio ? 'none' : 'block';
    if (lblMonto) lblMonto.textContent = tipo === 'CIERRE' ? 'Efectivo Físico Contado ($)' : 'Monto ($)';
};

window.cargarModuloCaja = async function () {
    try {
        const [resEstado, resMetodos] = await Promise.all([
            apiFetch('/api/caja/estado'),
            apiFetch('/api/caja/metodos-pago')
        ]);

        if (!resEstado.ok) return;

        const data = await resEstado.json();
        metodosPagoLista = resMetodos.ok ? await resMetodos.json() : [];
        saldoEsperadoCaja = Number(data.resumen?.saldoActual || 0);

        const selMetodo = document.getElementById('caja-metodo-pago');
        if (selMetodo) {
            selMetodo.innerHTML = metodosPagoLista.map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
        }

        document.getElementById('kpi-caja-apertura').textContent = `$${Number(data.resumen.apertura || 0).toLocaleString()}`;
        document.getElementById('kpi-caja-ingresos').textContent = `$${Number(data.resumen.ingresos || 0).toLocaleString()}`;
        document.getElementById('kpi-caja-egresos').textContent = `$${Number(data.resumen.egresos || 0).toLocaleString()}`;
        document.getElementById('kpi-caja-saldo').textContent = `$${saldoEsperadoCaja.toLocaleString()}`;

        const desgloseDiv = document.getElementById('caja-desglose-metodos');
        if (desgloseDiv) {
            const entries = Object.entries(data.resumen.porMetodo || {});
            desgloseDiv.innerHTML = entries.map(([metodo, total]) => `
                <div class="metodo-chip">
                    <span style="color:#64748b">${metodo}:</span>
                    <strong style="color:#0f172a; margin-left:4px;">$${Number(total).toLocaleString()}</strong>
                </div>
            `).join('');
        }

        const badge = document.getElementById('caja-badge-estado');
        if (badge) {
            if (data.estado === 'ABIERTA') {
                badge.textContent = '🟢 CAJA ABIERTA';
                badge.className = 'status-pill pill-open';
            } else {
                badge.textContent = '🔴 SIN APERTURA / CERRADA';
                badge.className = 'status-pill pill-closed';
            }
        }

        actualizarFormularioCaja();

        const tbody = document.getElementById('caja-movimientos-tbody');
        if (!tbody) return;

        if (!data.movimientos || data.movimientos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">
                No hay movimientos registrados hoy.
            </td></tr>`;
            return;
        }

        tbody.innerHTML = data.movimientos.map(m => {
            const opcionesMetodos = metodosPagoLista.map(mp =>
                `<option value="${mp.nombre}" ${mp.nombre === m.metodo_pago ? 'selected' : ''}>${mp.nombre}</option>`
            ).join('');

            return `
                <tr>
                    <td>${new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                        <select class="cell-select" onchange="editarCeldaCaja(${m.id}, 'tipo', this)">
                            <option value="APERTURA" ${m.tipo === 'APERTURA' ? 'selected' : ''}>APERTURA</option>
                            <option value="INGRESO" ${m.tipo === 'INGRESO' ? 'selected' : ''}>INGRESO</option>
                            <option value="EGRESO" ${m.tipo === 'EGRESO' ? 'selected' : ''}>EGRESO</option>
                            <option value="CIERRE" ${m.tipo === 'CIERRE' ? 'selected' : ''}>CIERRE</option>
                        </select>
                    </td>
                    <td>
                        <select class="cell-select" onchange="editarCeldaCaja(${m.id}, 'metodo_pago', this)">
                            ${opcionesMetodos}
                        </select>
                    </td>
                    <td><input class="cell-input" value="${m.descripcion || ''}" onchange="editarCeldaCaja(${m.id}, 'descripcion', this)"></td>
                    <td>${m.cajero || 'Sistema'}</td>
                    <td><input type="number" class="cell-input" style="width:110px; font-weight:700;" value="${m.monto}" onchange="editarCeldaCaja(${m.id}, 'monto', this)"></td>
                    <td>
                        <button type="button" class="btn-outline-sm" style="color:#dc2626; border-color:#fecaca;" onclick="eliminarMovimientoCaja(${m.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error en cargarModuloCaja:', e);
    }
};

window.editarCeldaCaja = async function (id, campo, inputEl) {
    const res = await apiFetch(`/api/caja/movimientos/${id}/inline`, {
        method: 'PATCH',
        body: JSON.stringify({ campo, valor: inputEl.value })
    });
    if (res.ok) {
        inputEl.classList.add('cell-saved');
        setTimeout(() => {
            inputEl.classList.remove('cell-saved');
            cargarModuloCaja();
        }, 400);
    }
};

window.eliminarMovimientoCaja = async function (id) {
    if (!confirm('¿Eliminar este movimiento de caja?')) return;
    const res = await apiFetch(`/api/caja/movimientos/${id}`, { method: 'DELETE' });
    if (res.ok) cargarModuloCaja();
};

function renderListaMetodosPago() {
    const div = document.getElementById('lista-metodos-div');
    if (!div) return;
    div.innerHTML = metodosPagoLista.map(m => `
        <div style="display:flex; gap:0.5rem; align-items:center; padding:0.45rem; border:1px solid #e2e8f0; border-radius:6px;">
            <input class="cell-input" value="${m.nombre}" onchange="actualizarMetodoPago(${m.id}, this.value, ${m.afecta_efectivo})" style="flex:1; font-weight:600;">
            <label style="font-size:0.78rem; white-space:nowrap;">
                <input type="checkbox" ${m.afecta_efectivo ? 'checked' : ''} onchange="actualizarMetodoPago(${m.id}, '${m.nombre}', this.checked)"> Efectivo
            </label>
            <button type="button" onclick="eliminarMetodoPago(${m.id})" style="color:#dc2626; background:none; border:none; cursor:pointer; font-weight:bold;">✕</button>
        </div>
    `).join('');
}

window.actualizarMetodoPago = async function (id, nombre, afecta_efectivo) {
    await apiFetch(`/api/caja/metodos-pago/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre, afecta_efectivo })
    });
    cargarModuloCaja();
};

window.eliminarMetodoPago = async function (id) {
    await apiFetch(`/api/caja/metodos-pago/${id}`, { method: 'DELETE' });
    await cargarModuloCaja();
    renderListaMetodosPago();
};

// ==========================================
// 4. LISTENERS DE FORMULARIOS SEGUROS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-nueva-categoria')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-nueva-categoria');
        const res = await apiFetch('/api/inventario/categorias', {
            method: 'POST',
            body: JSON.stringify({ nombre: input.value })
        });
        if (res.ok) {
            input.value = '';
            await cargarModuloInventario();
            renderListaCategorias();
        }
    });

    document.getElementById('form-nuevo-metodo')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-nuevo-metodo');
        const check = document.getElementById('input-metodo-efectivo');
        const res = await apiFetch('/api/caja/metodos-pago', {
            method: 'POST',
            body: JSON.stringify({ nombre: input.value, afecta_efectivo: check.checked })
        });
        if (res.ok) {
            input.value = '';
            await cargarModuloCaja();
            renderListaMetodosPago();
        }
    });

    document.getElementById('form-caja-mov')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getUsuarioSesion();
        const tipo = document.getElementById('caja-tipo').value;
        const isCierre = tipo === 'CIERRE';
        const valorInput = document.getElementById('caja-monto').value;

        const payload = {
            usuario_id: user.id,
            tipo,
            metodo_pago: (tipo === 'APERTURA' || isCierre) ? 'EFECTIVO' : document.getElementById('caja-metodo-pago').value,
            monto: isCierre ? saldoEsperadoCaja : valorInput,
            monto_fisico_contado: isCierre ? valorInput : undefined,
            descripcion: document.getElementById('caja-desc').value
        };

        const res = await apiFetch('/api/caja/movimientos', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            e.target.reset();
            cargarModuloCaja();
        } else {
            const err = await res.json();
            alert('❌ Error registrando movimiento: ' + (err.error || res.status));
        }
    });
});