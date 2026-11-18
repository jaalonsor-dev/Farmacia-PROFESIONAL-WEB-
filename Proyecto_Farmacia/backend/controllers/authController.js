const db = require('../config/database');
const crypto = require('crypto');

// Opcional: Descomentar si usas el módulo de correo
// const mailer = require('../config/mailer');

// 1. Login con feedback granular de errores
exports.login = (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Por favor ingrese usuario y contraseña' });
    }

    const query = `SELECT * FROM usuarios WHERE username = ?`;
    db.get(query, [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Error en la base de datos' });

        if (!user) {
            return res.status(404).json({ error: 'El nombre de usuario no existe' });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: 'Contraseña incorrecta. Intente de nuevo.' });
        }

        res.json({
            message: 'Inicio de sesión exitoso',
            user: {
                id: user.id,
                username: user.username,
                nombre: user.nombre,
                email: user.email,
                rol: user.rol
            }
        });
    });
};

// 2. Registro público para nuevos usuarios desde la pantalla principal
exports.registerPublic = (req, res) => {
    const { username, password, nombre, email } = req.body;

    if (!username || !password || !nombre) {
        return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    db.get(`SELECT COUNT(*) AS count FROM usuarios WHERE rol != 'SUPERADMIN'`, [], (err, row) => {
        const defaultRole = (row && row.count === 0) ? 'ADMIN' : 'CAJERO';

        const insert = `INSERT INTO usuarios (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)`;
        db.run(insert, [username, password, nombre, email || '', defaultRole], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
                }
                return res.status(500).json({ error: 'Error al registrar la cuenta' });
            }
            res.status(201).json({ message: 'Registro exitoso. Ya puede iniciar sesión.' });
        });
    });
};

// 3. Endpoint de prueba de conexión
exports.checkUsers = (req, res) => {
    res.json({ status: 'ok', server: 'running' });
};

// 4. Obtener todos los usuarios (para la tabla del panel de administración)
exports.getAllUsers = (req, res) => {
    const query = `SELECT id, username, nombre, email, rol, created_at FROM usuarios ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
        res.json(rows);
    });
};

// 5. Crear usuario desde el modal de administración
exports.createUser = (req, res) => {
    const { username, password, nombre, email, rol } = req.body;

    if (!username || !password || !nombre) {
        return res.status(400).json({ error: 'Los campos nombre, usuario y contraseña son obligatorios' });
    }

    const userRole = rol || 'CAJERO';
    const insert = `INSERT INTO usuarios (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)`;

    db.run(insert, [username, password, nombre, email || '', userRole], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'El nombre de usuario ya existe' });
            }
            return res.status(500).json({ error: 'Error al crear el usuario' });
        }
        res.status(201).json({ message: 'Usuario creado exitosamente', id: this.lastID });
    });
};

// 6. Eliminar usuario por ID (Protegiendo al SUPERADMIN de rescate)
exports.deleteUser = (req, res) => {
    const { id } = req.params;

    db.get(`SELECT rol FROM usuarios WHERE id = ?`, [id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Error al consultar usuario' });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (user.rol === 'SUPERADMIN') {
            return res.status(403).json({ error: 'No se puede eliminar la cuenta de Superusuario de rescate' });
        }

        db.run(`DELETE FROM usuarios WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: 'Error al eliminar el usuario' });
            res.json({ message: 'Usuario eliminado exitosamente' });
        });
    });
};

// 7. Solicitar token de recuperación
exports.forgotPassword = (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Debe ingresar un correo válido' });

    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'No existe una cuenta registrada con este correo' });
        }

        const token = crypto.randomBytes(8).toString('hex');
        const expires = new Date(Date.now() + 3600000).toISOString();

        db.run(`UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?`, [token, expires, user.id], async (err) => {
            if (err) return res.status(500).json({ error: 'Error al procesar solicitud' });

            console.log(`🔑 TOKEN GENERADO PARA [${user.email}]: ${token}`);

            /* Si tienes nodemailer configurado:
            try {
                await mailer.enviarCorreoRecuperacion(user.email, token);
            } catch (mErr) { console.error(mErr); }
            */

            res.json({ message: `Token enviado correctamente al correo. (Token de prueba local: ${token})` });
        });
    });
};

// 8. Validar Token y Guardar Nueva Contraseña
exports.resetPassword = (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token y nueva contraseña obligatorios' });
    }

    const query = `SELECT * FROM usuarios WHERE reset_token = ? AND reset_expires > CURRENT_TIMESTAMP`;
    db.get(query, [token], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'El token es inválido o ha expirado' });
        }

        db.run(`UPDATE usuarios SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`, [newPassword, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Error al cambiar la contraseña' });
            res.json({ message: 'Contraseña actualizada correctamente. Ya puede iniciar sesión.' });
        });
    });
};