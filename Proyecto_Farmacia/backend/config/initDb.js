const db = require('./database');

db.serialize(() => {
    // 1. Tabla Usuarios
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nombre TEXT NOT NULL,
            email TEXT,
            rol TEXT NOT NULL DEFAULT 'CAJERO',
            reset_token TEXT,
            reset_expires DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error al crear la tabla usuarios:', err.message);
        } else {
            console.log('✅ Tabla "usuarios" lista.');
            crearSuperusuarioRescate();
        }
    });

    // 2. Tabla Categorías / Tipos de Producto (Dinámica y editable)
    db.run(`
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE NOT NULL
        )
    `, () => {
        const cats = [
            'Analgésicos',
            'Antibióticos',
            'Antiinflamatorios',
            'Cuidado Personal',
            'Vitaminas y Suplementos'
        ];
        cats.forEach(c => db.run(`INSERT OR IGNORE INTO categorias (nombre) VALUES (?)`, [c]));
    });

    // 3. Tabla Métodos de Pago (Dinámica y editable)
    db.run(`
        CREATE TABLE IF NOT EXISTS metodos_pago (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE NOT NULL,
            afecta_efectivo INTEGER DEFAULT 1,
            activo INTEGER DEFAULT 1
        )
    `, () => {
        db.run(`INSERT OR IGNORE INTO metodos_pago (nombre, afecta_efectivo) VALUES ('EFECTIVO', 1)`);
        db.run(`INSERT OR IGNORE INTO metodos_pago (nombre, afecta_efectivo) VALUES ('TARJETA', 0)`);
        db.run(`INSERT OR IGNORE INTO metodos_pago (nombre, afecta_efectivo) VALUES ('TRANSFERENCIA', 0)`);
    });

    // 4. Tabla Productos (Inventario unificado y editable)
    db.run(`
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT UNIQUE,
            nombre TEXT NOT NULL,
            principio_activo TEXT,
            presentacion TEXT,
            lote TEXT,
            categoria_id INTEGER,
            precio_compra REAL NOT NULL DEFAULT 0,
            precio_venta REAL NOT NULL DEFAULT 0,
            stock INTEGER NOT NULL DEFAULT 0,
            stock_minimo INTEGER DEFAULT 5,
            fecha_vencimiento DATE,
            requiere_receta INTEGER DEFAULT 0,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
        )
    `, () => {
        // Precarga de 5 productos iniciales si la tabla está vacía
        db.get('SELECT COUNT(*) AS total FROM productos', [], (err, row) => {
            if (!err && row && row.total === 0) {
                const iniciales = [
                    ['7701001', 'Acetaminofén 500mg Caja x 20', 'Acetaminofén', 'Caja x 20', 'L-2026A', 1, 2500, 4500, 40, 10, '2027-12-31'],
                    ['7701002', 'Ibuprofeno 400mg Caja x 10', 'Ibuprofeno', 'Cápsulas', 'L-2026B', 3, 4000, 7500, 25, 8, '2027-08-15'],
                    ['7701003', 'Amoxicilina 500mg x 12', 'Amoxicilina', 'Cápsulas', 'L-2026C', 2, 6500, 12000, 18, 5, '2027-05-20'],
                    ['7701004', 'Alcohol Antiséptico 350ml', 'Alcohol 70%', 'Frasco 350ml', 'L-2026D', 4, 3000, 5500, 30, 10, '2028-01-10'],
                    ['7701005', 'Vitamina C + Zinc x 30', 'Ácido Ascórbico', 'Tabletas', 'L-2026E', 5, 9000, 16000, 15, 5, '2027-10-30']
                ];
                const stmt = db.prepare(`
                    INSERT INTO productos (codigo_barras, nombre, principio_activo, presentacion, lote, categoria_id, precio_compra, precio_venta, stock, stock_minimo, fecha_vencimiento)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                iniciales.forEach(p => stmt.run(p));
                stmt.finalize();
                console.log('📦 5 productos iniciales precargados.');
            }
        });
    });

    // 5. Tabla Movimientos de Caja
    db.run(`
        CREATE TABLE IF NOT EXISTS movimientos_caja (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            metodo_pago TEXT DEFAULT 'EFECTIVO',
            monto REAL NOT NULL,
            descripcion TEXT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `, () => {
        db.run(`ALTER TABLE movimientos_caja ADD COLUMN metodo_pago TEXT DEFAULT 'EFECTIVO'`, () => {});
    });

    // 6. Tabla Ventas
    db.run(`
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            total REAL NOT NULL,
            metodo_pago TEXT NOT NULL DEFAULT 'EFECTIVO',
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);

    // 7. Tabla Detalle de Ventas
    db.run(`
        CREATE TABLE IF NOT EXISTS detalle_ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            cantidad INTEGER NOT NULL,
            precio_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
            FOREIGN KEY (producto_id) REFERENCES productos(id)
        )
    `);
});

// Garantizar el usuario de rescate 'aletech'
function crearSuperusuarioRescate() {
    const queryCheck = `SELECT COUNT(*) AS count FROM usuarios WHERE username = ?`;
    db.get(queryCheck, ['aletech'], (err, row) => {
        if (err) return console.error('❌ Error al verificar superusuario:', err.message);

        if (!row || row.count === 0) {
            const insert = `INSERT INTO usuarios (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)`;
            db.run(insert, ['aletech', 'alejandro2026', 'Soporte AleTech', 'admin@farmacia.com', 'SUPERADMIN'], (err) => {
                if (err) console.error('❌ Error al insertar aletech:', err.message);
                else console.log('🛡️ Usuario de rescate "aletech" verificado/creado con éxito.');
            });
        }
    });

    db.run(`ALTER TABLE usuarios ADD COLUMN reset_token TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN reset_expires DATETIME`, () => {});
}