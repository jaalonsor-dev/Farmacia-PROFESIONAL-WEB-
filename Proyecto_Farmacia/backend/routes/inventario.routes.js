const router = require('express').Router();
const invCtrl = require('../controllers/inventarioController');

// Productos
router.get('/', invCtrl.listarInventario);
router.get('/resumen', invCtrl.obtenerResumenInventario);
router.post('/', invCtrl.crearProducto);
router.put('/:id', invCtrl.actualizarProducto);
router.patch('/:id/inline', invCtrl.actualizarProductoInline);
router.patch('/:id/stock', invCtrl.ajustarStock);
router.delete('/:id', invCtrl.eliminarProducto);

// Categorías / Tipos de Producto
router.get('/categorias', invCtrl.listarCategorias);
router.post('/categorias', invCtrl.crearCategoria);
router.delete('/categorias/:id', invCtrl.eliminarCategoria);

module.exports = router;