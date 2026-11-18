const nodemailer = require('nodemailer');

// Configuración SMTP (Servidor de correo)
const transporter = nodemailer.createTransport({
    service: 'gmail', // O configura tu proveedor SMTP (Outlook, Mailtrap, etc.)
    auth: {
        user: 'tu_correo@gmail.com', // Coloca tu correo emisor
        pass: 'tu_app_password'     // App Password de tu correo
    }
});

exports.enviarCorreoRecuperacion = async (toEmail, token) => {
    const link = `http://localhost:3000/reset-password.html?token=${token}`;

    const mailOptions = {
        from: '"Farmacia POS Soporte" <tu_correo@gmail.com>',
        to: toEmail,
        subject: '🔐 Recuperación de Contraseña - Farmacia POS',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #0284c7;">Restablecer Contraseña</h2>
                <p>Ha recibido este mensaje porque se solicitó un restablecimiento de contraseña para su cuenta.</p>
                <p>Haga clic en el siguiente enlace para crear una nueva contraseña (válido por 1 hora):</p>
                <a href="${link}" style="background-color: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0;">Restablecer Contraseña</a>
                <p style="font-size: 0.85rem; color: #64748b;">Si no realizó esta solicitud, puede ignorar este mensaje de forma segura.</p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
};