// URL base del backend. Si la pagina se abre desde el puerto 3000 (http://localhost:3000)
// se usan rutas relativas; si se abre desde Live Server u otro puerto, se apunta al 3000.
window.API_BASE = (location.protocol.startsWith('http') && location.port === '3000') ? '' : 'http://localhost:3000';
const API_URL = `${API_BASE}/api`;
let currentMode = 'login';

// --- SEGURIDAD: SIEMPRE ARRANCAR EN LA PANTALLA DE LOGIN DESCONECTADO ---
document.addEventListener('DOMContentLoaded', () => {
    // Garantizar que la interfaz comience limpia en el Login
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');

    if (authContainer) authContainer.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';

    // Asignar eventos de las pestañas
    document.getElementById('tab-login')?.addEventListener('click', () => setAuthMode('login'));
    document.getElementById('tab-register')?.addEventListener('click', () => setAuthMode('register'));

    // Evento Olvidaste tu contraseña
    document.querySelector('.form-actions-forgot a')?.addEventListener('click', (e) => {
        e.preventDefault();
        abrirModalRecuperar();
    });
});

// Cambiar pestañas de Login y Registro
window.setAuthMode = function(mode) {
    currentMode = mode;
    const btnSubmit = document.getElementById('btn-auth-submit');
    const groupNombre = document.getElementById('group-nombre');
    const groupEmail = document.getElementById('group-email');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (mode === 'register') {
        tabLogin?.classList.remove('active');
        tabRegister?.classList.add('active');
        if (groupNombre) groupNombre.style.display = 'block';
        if (groupEmail) groupEmail.style.display = 'block';
        if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-user-plus"></i> Crear Cuenta';
    } else {
        tabRegister?.classList.remove('active');
        tabLogin?.classList.add('active');
        if (groupNombre) groupNombre.style.display = 'none';
        if (groupEmail) groupEmail.style.display = 'none';
        if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
    }
};

// Formulario Principal (Login / Registro Público)
document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    const nombre = document.getElementById('nombre')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';

    const endpoint = currentMode === 'register' ? '/auth/register' : '/auth/login';
    const payload = currentMode === 'register' ? { username, password, nombre, email } : { username, password };

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            showAuthMessage(data.error || 'Error en la solicitud', 'error');
            return;
        }

        if (currentMode === 'register') {
            showAuthMessage('¡Cuenta creada con éxito! Por favor inicie sesión.', 'success');
            setTimeout(() => {
                setAuthMode('login');
                showAuthMessage('', '');
            }, 1200);
        } else {
            // Iniciar Sesión Segura
            sessionStorage.setItem('user', JSON.stringify(data.user));
            iniciarSesionUI(data.user);
        }
    } catch (err) {
        showAuthMessage('Error: No se pudo conectar con el servidor backend', 'error');
    }
});

function showAuthMessage(msg, type) {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.className = msg ? `alert-message alert-${type}` : '';
    box.innerText = msg;
}

function iniciarSesionUI(user) {
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');

    if (authContainer) authContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    const displayName = document.getElementById('user-display-name');
    const displayRole = document.getElementById('user-display-role');

    if (displayName) displayName.innerText = user.nombre || user.username;
    if (displayRole) displayRole.innerText = user.rol;
}

// Cierre de sesión y limpieza de la aplicación
window.logout = function() {
    sessionStorage.clear();
    localStorage.clear();
    location.reload();
};

// Función Ojo (Ver / Ocultar Clave)
window.togglePasswordVisibility = function(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    }
};

// Modales
window.abrirModalRecuperar = function() {
    const modal = document.getElementById('modal-forgot');
    if (modal) modal.style.display = 'flex';
};

window.cerrarModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
};

// Modal Correo
document.getElementById('form-forgot-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email')?.value.trim();

    try {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Error al solicitar token');

        alert(data.message);
        cerrarModal('modal-forgot');

        const modalReset = document.getElementById('modal-reset-token');
        if (modalReset) modalReset.style.display = 'flex';

    } catch (err) {
        alert('Error de conexión con el servidor');
    }
});

// Modal Token
document.getElementById('form-reset-token')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('reset-token-input')?.value.trim();
    const newPassword = document.getElementById('reset-new-password')?.value.trim();

    try {
        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Token inválido o expirado');

        alert(data.message);
        cerrarModal('modal-reset-token');
        document.getElementById('form-reset-token').reset();

    } catch (err) {
        alert('Error de conexión con el servidor');
    }
});