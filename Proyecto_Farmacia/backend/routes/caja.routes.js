const router = require('express').Router();
const cajaCtrl = require('../controllers/cajaController');

// Estado y movimientos de caja
router.get('/estado', cajaCtrl.obtenerEstadoCaja);
router.post('/movimientos', cajaCtrl.registrarMovimiento);
router.patch('/movimientos/:id/inline', cajaCtrl.actualizarMovimientoInline);
router.delete('/movimientos/:id', cajaCtrl.eliminarMovimiento);

// Métodos de pago dinámicos
router.get('/metodos-pago', cajaCtrl.listarMetodosPago);
router.post('/metodos-pago', cajaCtrl.crearMetodoPago);
router.put('/metodos-pago/:id', cajaCtrl.actualizarMetodoPago);
router.delete('/metodos-pago/:id', cajaCtrl.eliminarMetodoPago);

// Ventas POS y Reportes
router.post('/ventas', cajaCtrl.procesarVenta);
router.get('/reportes', cajaCtrl.obtenerReportes);
router.patch('/ventas/:id/inline', cajaCtrl.actualizarVentaInline);
router.delete('/ventas/:id', cajaCtrl.eliminarVenta);

module.exports = router;