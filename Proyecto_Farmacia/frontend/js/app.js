// Navegación por pestañas
function switchTab(tabId) {
    document.querySelectorAll('.view-section').forEach(view => view.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) activeView.style.display = 'block';

    const activeBtn = document.querySelector(`.nav-btn[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'usuarios') {
        cargarTablaUsuarios();
    }
}

// Cargar tabla de usuarios
async function cargarTablaUsuarios() {
    try {
        const res = await fetch(`${API_URL}/auth/users`);
        const usuarios = await res.json();
        const tbody = document.getElementById('users-table-body');
        
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!Array.isArray(usuarios) || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay usuarios registrados.</td></tr>';
            return;
        }

        usuarios.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td><strong>${u.nombre || u.username}</strong></td>
                <td>${u.username}</td>
                <td>${u.email || '<em style="color: #94a3b8;">Sin correo</em>'}</td>
                <td><span class="badge">${u.rol}</span></td>
                <td>
                    ${u.rol !== 'SUPERADMIN' ? `
                        <button onclick="eliminarUsuario(${u.id}, '${u.username}')" class="btn-delete" title="Eliminar Usuario">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : '<small style="color: #94a3b8;">Protegido</small>'}
                </td>
            </tr>
        `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error al cargar usuarios:', err);
    }
}

function abrirModalCrearUsuario() {
    const modal = document.getElementById('modal-user');
    if (modal) modal.style.display = 'flex';
}

// Crear nuevo usuario desde Admin
document.getElementById('form-create-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
        nombre: document.getElementById('new-nombre').value.trim(),
        username: document.getElementById('new-username').value.trim(),
        email: document.getElementById('new-email').value.trim(),
        password: document.getElementById('new-password').value.trim(),
        rol: document.getElementById('new-rol').value
    };

    try {
        const res = await fetch(`${API_URL}/auth/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Error al crear usuario');
            return;
        }

        alert('Usuario creado con éxito');
        cerrarModal('modal-user');
        document.getElementById('form-create-user').reset();
        cargarTablaUsuarios();

    } catch (err) {
        alert('No se pudo conectar con el servidor');
    }
});

// Eliminar usuario
async function eliminarUsuario(id, username) {
    if (!confirm(`¿Está seguro de que desea eliminar al usuario "${username}"?`)) return;

    try {
        const res = await fetch(`${API_URL}/auth/users/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Error al eliminar');
            return;
        }

        cargarTablaUsuarios();
    } catch (err) {
        alert('Error al conectar con el servidor');
    }
}