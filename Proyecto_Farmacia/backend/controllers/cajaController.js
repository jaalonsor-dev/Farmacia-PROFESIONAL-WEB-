const db = require('../config/database');

// 1. Obtener estado actual de la caja + desglose por método de pago + movimientos
exports.obtenerEstadoCaja = (req, res) => {
    const sqlMovs = `
        SELECT m.*, u.nombre AS cajero 
        FROM movimientos_caja m
        LEFT JOIN usuarios u ON m.usuario_id = u.id
        WHERE DATE(m.fecha) = DATE('now', 'localtime')
        ORDER BY m.id DESC
    `;

    db.all(sqlMovs, [], (err, movimientos) => {
        if (err) return res.status(500).json({ error: err.message });

        let apertura = 0;
        let ingresos = 0;
        let egresos = 0;
        let cajaAbierta = false;
        let cajaCerrada = false;
        const porMetodo = {};

        [...movimientos].reverse().forEach(m => {
            const val = Number(m.monto || 0);
            const metodo = m.metodo_pago || 'EFECTIVO';

            if (m.tipo === 'APERTURA') {
                apertura += val;
                cajaAbierta = true;
                cajaCerrada = false;
            } else if (m.tipo === 'INGRESO' || m.tipo === 'VENTA') {
                ingresos += val;
                porMetodo[metodo] = (porMetodo[metodo] || 0) + val;
            } else if (m.tipo === 'EGRESO') {
                egresos += val;
                porMetodo[metodo] = (porMetodo[metodo] || 0) - val;
            } else if (m.tipo === 'CIERRE') {
                cajaCerrada = true;
                cajaAbierta = false;
            }
        });

        res.json({
            estado: cajaAbierta ? 'ABIERTA' : (cajaCerrada ? 'CERRADA' : 'SIN_APERTURA'),
            resumen: {
                apertura,
                ingresos,
                egresos,
                saldoActual: apertura + ingresos - egresos,
                porMetodo
            },
            movimientos
        });
    });
};

// 2. Registrar movimiento de caja (APERTURA, INGRESO, EGRESO, CIERRE con arqueo)
exports.registrarMovimiento = (req, res) => {
    const { usuario_id, tipo, metodo_pago, monto, descripcion, monto_fisico_contado } = req.body;
    const uid = (req.user && req.user.id) || usuario_id || 1;
    const valor = Number(monto || 0);

    if (!tipo) return res.status(400).json({ error: 'El tipo de movimiento es obligatorio.' });
    if (isNaN(valor) || valor < 0) return res.status(400).json({ error: 'El monto ingresado no es válido.' });

    let descFinal = descripcion ? descripcion.trim() : '';

    if (tipo === 'CIERRE' && monto_fisico_contado !== undefined && monto_fisico_contado !== '') {
        const contado = Number(monto_fisico_contado);
        const diferencia = contado - valor;
        let estadoArqueo = 'CUADRADA';
        if (diferencia > 0) estadoArqueo = `SOBRANTE +$${diferencia.toLocaleString()}`;
        if (diferencia < 0) estadoArqueo = `FALTANTE -$${Math.abs(diferencia).toLocaleString()}`;

        descFinal = `Cierre de Turno | Esperado: $${valor.toLocaleString()} | Contado: $${contado.toLocaleString()} (${estadoArqueo}) ${descFinal ? '- ' + descFinal : ''}`;
    }

    const sql = `INSERT INTO movimientos_caja (usuario_id, tipo, metodo_pago, monto, descripcion) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [uid, tipo, metodo_pago || 'EFECTIVO', valor, descFinal], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({
            id: this.lastID,
            mensaje: `Movimiento (${tipo}) registrado correctamente.`
        });
    });
};

// 3. Edición inline de movimientos de caja
exports.actualizarMovimientoInline = (req, res) => {
    const { id } = req.params;
    const { campo, valor } = req.body;
    const permitidos = ['tipo', 'metodo_pago', 'monto', 'descripcion'];

    if (!permitidos.includes(campo)) {
        return res.status(400).json({ error: 'Campo no editable.' });
    }

    db.run(`UPDATE movimientos_caja SET ${campo} = ? WHERE id = ?`, [valor, id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Movimiento actualizado' });
    });
};

// 4. Eliminar movimiento de caja
exports.eliminarMovimiento = (req, res) => {
    db.run('DELETE FROM movimientos_caja WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Movimiento eliminado' });
    });
};

// 5. CRUD Métodos de Pago Dinámicos
exports.listarMetodosPago = (req, res) => {
    db.all('SELECT * FROM metodos_pago ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.crearMetodoPago = (req, res) => {
    const { nombre, afecta_efectivo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

    db.run(
        'INSERT INTO metodos_pago (nombre, afecta_efectivo) VALUES (?, ?)',
        [nombre.trim().toUpperCase(), afecta_efectivo ? 1 : 0],
        function (err) {
            if (err) return res.status(400).json({ error: 'El método de pago ya existe' });
            res.status(201).json({ id: this.lastID, nombre: nombre.trim().toUpperCase() });
        }
    );
};

exports.actualizarMetodoPago = (req, res) => {
    const { nombre, afecta_efectivo } = req.body;
    db.run(
        'UPDATE metodos_pago SET nombre = ?, afecta_efectivo = ? WHERE id = ?',
        [nombre.trim().toUpperCase(), afecta_efectivo ? 1 : 0, req.params.id],
        function (err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ mensaje: 'Método actualizado' });
        }
    );
};

exports.eliminarMetodoPago = (req, res) => {
    db.run('DELETE FROM metodos_pago WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Método eliminado' });
    });
};

// Helpers para usar sqlite3 con async/await
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row); });
});

// 6. Procesar Venta POS (soporta precio unitario editado en el ticket, descuenta stock e ingresa a caja)
exports.procesarVenta = async (req, res) => {
    const { usuario_id, metodo_pago, items } = req.body;
    const uid = (req.user && req.user.id) || usuario_id || 1;
    const metodoNombre = metodo_pago || 'EFECTIVO';

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El ticket de venta está vacío.' });
    }

    try {
        // 1) Validar todo el ticket antes de tocar la base de datos
        let totalVenta = 0;
        const validados = [];
        for (const item of items) {
            const cantidad = Number(item.cantidad);
            if (!Number.isInteger(cantidad) || cantidad <= 0) {
                throw new Error('Hay una cantidad inválida en el ticket.');
            }
            const prod = await dbGet('SELECT id, nombre, stock, precio_venta FROM productos WHERE id = ?', [item.producto_id]);
            if (!prod) throw new Error('Producto no encontrado.');
            if (prod.stock < cantidad) {
                throw new Error(`Stock insuficiente para ${prod.nombre} (Disponible: ${prod.stock})`);
            }
            const precio = item.precio !== undefined ? Number(item.precio) : prod.precio_venta;
            if (!Number.isFinite(precio) || precio < 0) throw new Error(`Precio inválido para ${prod.nombre}.`);

            const subtotal = precio * cantidad;
            totalVenta += subtotal;
            validados.push({ producto_id: prod.id, cantidad, precio_unitario: precio, subtotal });
        }

        // 2) Guardar todo en una sola transacción
        await dbRun('BEGIN IMMEDIATE');
        try {
            const venta = await dbRun(
                'INSERT INTO ventas (usuario_id, total, metodo_pago) VALUES (?, ?, ?)',
                [uid, totalVenta, metodoNombre]
            );
            const ventaId = venta.lastID;

            for (const d of validados) {
                await dbRun(
                    'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
                    [ventaId, d.producto_id, d.cantidad, d.precio_unitario, d.subtotal]
                );
                const upd = await dbRun(
                    'UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?',
                    [d.cantidad, d.producto_id, d.cantidad]
                );
                if (upd.changes === 0) throw new Error('El stock cambió mientras se procesaba la venta. Intente de nuevo.');
            }

            await dbRun(
                'INSERT INTO movimientos_caja (usuario_id, tipo, metodo_pago, monto, descripcion) VALUES (?, ?, ?, ?, ?)',
                [uid, 'INGRESO', metodoNombre, totalVenta, `Venta POS #${ventaId}`]
            );

            await dbRun('COMMIT');
            res.status(201).json({ mensaje: 'Venta completada', ventaId, totalVenta });
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => {});
            throw err;
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// 7. Reporte de Ventas por Usuario, Estadística Mensual y Últimas Ventas con Productos
exports.obtenerReportes = (req, res) => {
    const sqlUsuarios = `
        SELECT u.id, u.nombre, u.username, u.rol,
               COUNT(v.id) AS total_ventas,
               COALESCE(SUM(v.total), 0) AS monto_total
        FROM usuarios u
        LEFT JOIN ventas v ON u.id = v.usuario_id
        GROUP BY u.id
        ORDER BY monto_total DESC
    `;

    const sqlMensual = `
        SELECT strftime('%Y-%m', fecha) AS mes,
               COUNT(id) AS cantidad_ventas,
               SUM(total) AS ingresos_totales
        FROM ventas
        GROUP BY mes
        ORDER BY mes DESC
        LIMIT 12
    `;

    const sqlHistorialVentas = `
        SELECT v.id, v.total, v.metodo_pago, v.fecha, u.nombre AS cajero,
               GROUP_CONCAT(p.nombre || ' (x' || dv.cantidad || ')', ', ') AS productos_resumen
        FROM ventas v
        LEFT JOIN usuarios u ON v.usuario_id = u.id
        LEFT JOIN detalle_ventas dv ON v.id = dv.venta_id
        LEFT JOIN productos p ON dv.producto_id = p.id
        GROUP BY v.id
        ORDER BY v.id DESC
        LIMIT 100
    `;

    db.all(sqlUsuarios, [], (err, porUsuario) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(sqlMensual, [], (err2, mensual) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.all(sqlHistorialVentas, [], (err3, recientes) => {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ porUsuario, mensual, recientes });
            });
        });
    });
};

// 8. Editar método de pago de un ticket ya emitido
exports.actualizarVentaInline = (req, res) => {
    const { metodo_pago } = req.body;
    db.run('UPDATE ventas SET metodo_pago = ? WHERE id = ?', [metodo_pago, req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Ticket actualizado correctamente' });
    });
};

// 9. Anular venta y devolver unidades al inventario
exports.eliminarVenta = (req, res) => {
    const ventaId = req.params.id;
    db.serialize(() => {
        db.all('SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?', [ventaId], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            items.forEach(it => {
                db.run('UPDATE productos SET stock = stock + ? WHERE id = ?', [it.cantidad, it.producto_id]);
            });
            db.run('DELETE FROM detalle_ventas WHERE venta_id = ?', [ventaId]);
            db.run('DELETE FROM ventas WHERE id = ?', [ventaId], function (delErr) {
                if (delErr) return res.status(400).json({ error: delErr.message });
                res.json({ mensaje: 'Venta anulada y stock restaurado' });
            });
        });
    });
};