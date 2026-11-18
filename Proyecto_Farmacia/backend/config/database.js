const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta absoluta garantizada dentro del directorio /backend
const dbPath = path.resolve(__dirname, '../farmacia.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error crítico al conectar la base de datos:', err.message);
    } else {
        console.log('✅ Base de datos SQLite conectada correctamente.');
    }
});

module.exports = db;