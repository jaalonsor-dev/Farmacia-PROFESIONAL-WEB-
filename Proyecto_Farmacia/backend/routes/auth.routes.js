const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 1. Estado inicial del sistema
router.get('/check-users', authController.checkUsers);

// 2. Autenticación y Registro público
router.post('/login', authController.login);
router.post('/register', authController.registerPublic);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// 3. Gestión de usuarios (Panel Administrativo)
router.get('/users', authController.getAllUsers);        // Obtener la lista de usuarios
router.post('/users', authController.createUser);       // Crear usuario desde el modal de admin
router.delete('/users/:id', authController.deleteUser);  // Eliminar usuario por ID

module.exports = router;