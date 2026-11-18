const db = require('../config/database');

// 1. Listar inventario con indicadores de alerta
exports.listarInventario = (req, res) => {
    const sql = `
        SELECT 
            p.*,
            c.nombre AS categoria_nombre,
            CASE 
                WHEN p.fecha_vencimiento IS NOT NULL AND DATE(p.fecha_vencimiento) < DATE('now', 'localtime') THEN 'VENCIDO'
                WHEN p.fecha_vencimiento IS NOT NULL AND DATE(p.fecha_vencimiento) <= DATE('now', 'localtime', '+60 days') THEN 'PROXIMO_VENCER'
                ELSE 'VIGENTE'
            END AS estado_vencimiento,
            CASE 
                WHEN p.stock = 0 THEN 'AGOTADO'
                WHEN p.stock <= p.stock_minimo THEN 'BAJO'
                ELSE 'OPTIMO'
            END AS estado_stock
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        ORDER BY p.id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

// 2. Resumen ejecutivo para tarjetas KPI del inventario
exports.obtenerResumenInventario = (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) AS total_productos,
            COALESCE(SUM(stock), 0) AS unidades_totales,
            COALESCE(SUM(stock * precio_compra), 0) AS valor_costo_inventario,
            COALESCE(SUM(stock * precio_venta), 0) AS valor_venta_estimado,
            SUM(CASE WHEN stock <= stock_minimo THEN 1 ELSE 0 END) AS alertas_stock,
            SUM(CASE WHEN fecha_vencimiento IS NOT NULL AND DATE(fecha_vencimiento) <= DATE('now', 'localtime', '+60 days') THEN 1 ELSE 0 END) AS alertas_vencimiento
        FROM productos
    `;
    db.get(sql, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
};

// 3. Crear nuevo producto
exports.crearProducto = (req, res) => {
    const {
        codigo_barras, nombre, principio_activo, presentacion,
        lote, categoria_id, precio_compra, precio_venta,
        stock, stock_minimo, fecha_vencimiento, requiere_receta
    } = req.body;

    if (!nombre || precio_compra == null || precio_venta == null) {
        return res.status(400).json({ error: 'Nombre, precio de compra y precio de venta son obligatorios.' });
    }

    const sql = `
        INSERT INTO productos 
        (codigo_barras, nombre, principio_activo, presentacion, lote, categoria_id, precio_compra, precio_venta, stock, stock_minimo, fecha_vencimiento, requiere_receta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        codigo_barras || null, nombre.trim(), principio_activo || null, presentacion || null,
        lote || null, categoria_id || null, Number(precio_compra), Number(precio_venta),
        Number(stock || 0), Number(stock_minimo || 5), fecha_vencimiento || null, requiere_receta ? 1 : 0
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(400).json({ error: 'Error al guardar producto (verifique que el código no esté duplicado).' });
        res.status(201).json({ id: this.lastID, mensaje: 'Producto registrado en inventario.' });
    });
};

// 4. Actualizar producto completo
exports.actualizarProducto = (req, res) => {
    const { id } = req.params;
    const {
        codigo_barras, nombre, principio_activo, presentacion,
        lote, categoria_id, precio_compra, precio_venta,
        stock, stock_minimo, fecha_vencimiento, requiere_receta
    } = req.body;

    const sql = `
        UPDATE productos SET
            codigo_barras = ?, nombre = ?, principio_activo = ?, presentacion = ?,
            lote = ?, categoria_id = ?, precio_compra = ?, precio_venta = ?,
            stock = ?, stock_minimo = ?, fecha_vencimiento = ?, requiere_receta = ?
        WHERE id = ?
    `;
    const params = [
        codigo_barras || null, nombre, principio_activo || null, presentacion || null,
        lote || null, categoria_id || null, Number(precio_compra), Number(precio_venta),
        Number(stock || 0), Number(stock_minimo || 5), fecha_vencimiento || null, requiere_receta ? 1 : 0, id
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Ficha del producto actualizada.' });
    });
};

// 5. Edición inline celda por celda desde la tabla
exports.actualizarProductoInline = (req, res) => {
    const { id } = req.params;
    const { campo, valor } = req.body;
    const permitidos = [
        'codigo_barras', 'nombre', 'principio_activo', 'presentacion',
        'lote', 'categoria_id', 'precio_compra', 'precio_venta',
        'stock', 'stock_minimo', 'fecha_vencimiento'
    ];

    if (!permitidos.includes(campo)) {
        return res.status(400).json({ error: 'Campo no editable.' });
    }

    const valFinal = valor === '' ? null : valor;
    db.run(`UPDATE productos SET ${campo} = ? WHERE id = ?`, [valFinal, id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Celda actualizada' });
    });
};

// 6. Ajuste de Stock
exports.ajustarStock = (req, res) => {
    const { id } = req.params;
    const { tipo_ajuste, cantidad, lote, fecha_vencimiento } = req.body;
    const cant = Math.abs(Number(cantidad));

    if (!cant || cant <= 0) return res.status(400).json({ error: 'Cantidad inválida.' });
    const delta = tipo_ajuste === 'SALIDA' ? -cant : cant;

    db.get('SELECT stock, nombre FROM productos WHERE id = ?', [id], (err, prod) => {
        if (err || !prod) return res.status(404).json({ error: 'Producto no encontrado.' });
        if (prod.stock + delta < 0) return res.status(400).json({ error: 'El stock no puede quedar negativo.' });

        const sql = `
            UPDATE productos 
            SET stock = stock + ?,
                lote = COALESCE(NULLIF(?, ''), lote),
                fecha_vencimiento = COALESCE(NULLIF(?, ''), fecha_vencimiento)
            WHERE id = ?
        `;
        db.run(sql, [delta, lote || '', fecha_vencimiento || '', id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ mensaje: `Stock de ${prod.nombre} actualizado (${delta > 0 ? '+' : ''}${delta} unid.)` });
        });
    });
};

// 7. Eliminar producto
exports.eliminarProducto = (req, res) => {
    db.run('DELETE FROM productos WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Producto eliminado' });
    });
};

// 8. CRUD Categorías / Tipos de Producto
exports.listarCategorias = (req, res) => {
    db.all('SELECT * FROM categorias ORDER BY nombre ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.crearCategoria = (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.run('INSERT INTO categorias (nombre) VALUES (?)', [nombre.trim()], function (err) {
        if (err) return res.status(400).json({ error: 'La categoría ya existe' });
        res.status(201).json({ id: this.lastID, nombre: nombre.trim() });
    });
};

exports.eliminarCategoria = (req, res) => {
    db.run('DELETE FROM categorias WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ mensaje: 'Categoría eliminada' });
    });
};