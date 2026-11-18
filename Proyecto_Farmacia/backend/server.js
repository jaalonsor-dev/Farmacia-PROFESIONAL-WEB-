const express = require('express');
const cors = require('cors');
const path = require('path');

// Inicializar la base de datos y tablas
require('./config/initDb');

// Importar Rutas
const authRoutes = require('./routes/auth.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const cajaRoutes = require('./routes/caja.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del Frontend (HTML, CSS, JS) desde el mismo puerto 3000
app.use(express.static(path.join(__dirname, '../frontend')));

// Endpoints API
app.use('/api/auth', authRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/caja', cajaRoutes);

// Cualquier ruta no-API devuelve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Arrancar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Droguería POS activo en: http://localhost:${PORT}`);
});