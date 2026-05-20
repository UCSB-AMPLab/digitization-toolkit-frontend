<script lang="ts">
  // ============================================================================
  // PÁGINA: Gestión de Usuarios
  // Ruta: /dashboard/users
  // Archivo: src/routes/(dashboard)/dashboard/users/+page.svelte
  //
  // Solo visible para administradores (el layout ya controla el acceso).
  //
  // Funcionalidades:
  //   - Tabla de usuarios: avatar, nombre, username, rol, estado, última
  //     conexión, rendimiento, acciones (···)
  //   - Búsqueda por nombre o username
  //   - Filtro por Rol y por Estado
  //   - Menú de acciones (···) con opciones: Editar | Eliminar
  //   - Modal "Crear nuevo usuario" con campos: nombre, apellido, username,
  //     contraseña, confirmar contraseña, asignar rol (radio)
  //   - Modal "Editar usuario" — mismo formulario con datos pre-cargados
  //   - Modal "Eliminar" — confirmación antes de borrar
  //
  // MODO DEMO (token = 'demo-token'):
  //   Crea/edita/elimina localmente sin llamar al backend.
  //
  // Para conectar con el backend, busca los comentarios "TODO: backend"
  // y reemplaza con las llamadas a usersApi cuando esté disponible.
  // ============================================================================

  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';

  // ---------------------------------------------------------------------------
  // TIPOS
  // ---------------------------------------------------------------------------

  type UserRole = 'operator' | 'reviewer' | 'admin';
  type UserStatus = 'active' | 'inactive';

  interface User {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
    email?: string;
    role: UserRole;
    status: UserStatus;
    lastSeen: string;       // texto relativo: "Hace 5 min", "Ahora", etc.
    performance?: number;   // porcentaje 0-100 | undefined = sin dato
  }

  // ---------------------------------------------------------------------------
  // TODO
  // Se usan cuando no hay conexión con el backend.
  // Para conectar con el backend, reemplazar MOCK_USERS con usersApi.list()
  // ---------------------------------------------------------------------------
  const MOCK_USERS: User[] = [
    { id: 1, firstName: 'María',  lastName: 'García', username: 'maria_garcia', role: 'operator', status: 'active',   lastSeen: 'Hace 5 min',  performance: 93 },
    { id: 2, firstName: 'Juan',   lastName: 'López',  username: 'juan_lopez',   role: 'reviewer', status: 'active',   lastSeen: 'Hace 15 min', performance: undefined },
    { id: 3, firstName: 'Pedro',  lastName: 'Mora',   username: 'pedro_mora',   role: 'operator', status: 'inactive', lastSeen: 'Hace 2 días', performance: 82 },
    { id: 4, firstName: 'Ana',    lastName: 'Ruiz',   username: 'ana_ruiz',     role: 'operator', status: 'active',   lastSeen: 'Hace 1 hora', performance: 91 },
    { id: 5, firstName: 'Admin',  lastName: 'Sistema',username: 'admin',        role: 'admin',    status: 'active',   lastSeen: 'Ahora',       performance: undefined },
  ];

  // ---------------------------------------------------------------------------
  // ESTADO: lista de usuarios
  // ---------------------------------------------------------------------------
  let users       = $state<User[]>([]);
  let isLoading   = $state(true);

  // Filtros
  let searchQuery   = $state('');
  let filterRole    = $state<UserRole | ''>('');
  let filterStatus  = $state<UserStatus | ''>('');

  // Usuarios filtrados según búsqueda + filtros activos
  let filteredUsers = $derived(users.filter(u => {
    const matchSearch = !searchQuery ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole   = !filterRole   || u.role === filterRole;
    const matchStatus = !filterStatus || u.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  }));

  // ---------------------------------------------------------------------------
  // ESTADO: menú de acciones (···)
  // openMenuId = id del usuario cuyo menú está abierto | null = cerrado
  // ---------------------------------------------------------------------------
  let openMenuId = $state<number | null>(null);

  // Posición del dropdown en coordenadas de la ventana (position: fixed)
  // Se recalcula cada vez que se abre el menú para evitar que se corte
  let dropdownPos = $state({ top: 0, right: 0 });

  // Cierra el menú al hacer click fuera
  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.actions-menu-wrapper')) {
      openMenuId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // ESTADO: Modal de crear/editar usuario
  // ---------------------------------------------------------------------------
  let showUserModal = $state(false);
  let isEditMode    = $state(false);   // false = crear | true = editar
  let editingUserId = $state<number | null>(null);

  // Campos del formulario
  let formFirstName  = $state('');
  let formLastName   = $state('');
  let formUsername   = $state('');
  let formPassword   = $state('');
  let formConfirm    = $state('');
  let formRole       = $state<UserRole>('operator');

  // Visibilidad de las contraseñas
  let showPassword   = $state(false);
  let showConfirm    = $state(false);

  // Error de formulario
  let formError      = $state('');
  let isSaving       = $state(false);

  // ---------------------------------------------------------------------------
  // ESTADO: Modal de eliminar usuario
  // ---------------------------------------------------------------------------
  let showDeleteModal  = $state(false);
  let deletingUser     = $state<User | null>(null);
  let isDeleting       = $state(false);

  // ---------------------------------------------------------------------------
  // AL MONTAR: carga usuarios
  // ---------------------------------------------------------------------------
  onMount(() => {
  document.addEventListener('click', handleOutsideClick);
  loadUsers(); // sin await — no bloquea
  return () => document.removeEventListener('click', handleOutsideClick);
});

  // ---------------------------------------------------------------------------
  // FUNCIÓN: cargar usuarios
  // TODO: backend — reemplazar MOCK_USERS por:
  //   users = await usersApi.list();
  // ---------------------------------------------------------------------------
  async function loadUsers() {
    try {
      isLoading = true;
      // Simular delay de red
      await new Promise(r => setTimeout(r, 300));
      users = [...MOCK_USERS];
    } catch (err) {
      console.error('[Users] Error cargando:', err);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // ABRIR MODAL: Crear nuevo usuario
  // ---------------------------------------------------------------------------
  function openCreateModal() {
    isEditMode    = false;
    editingUserId = null;
    formFirstName = '';
    formLastName  = '';
    formUsername  = '';
    formPassword  = '';
    formConfirm   = '';
    formRole      = 'operator';
    formError     = '';
    showUserModal = true;
  }

  // ---------------------------------------------------------------------------
  // ABRIR MODAL: Editar usuario existente
  // Pre-carga los datos del usuario en el formulario
  // ---------------------------------------------------------------------------
  function openEditModal(user: User) {
    openMenuId    = null;
    isEditMode    = true;
    editingUserId = user.id;
    formFirstName = user.firstName;
    formLastName  = user.lastName;
    formUsername  = user.username;
    formPassword  = '';        // nunca pre-carga la contraseña por seguridad
    formConfirm   = '';
    formRole      = user.role;
    formError     = '';
    showUserModal = true;
  }

  // ---------------------------------------------------------------------------
  // GUARDAR: Crear o editar usuario
  // Modo demo: modifica el array local.
  // TODO: backend — llamar a usersApi.create() o usersApi.update()
  // ---------------------------------------------------------------------------
  async function handleSaveUser() {
    // Validaciones básicas
    if (!formFirstName.trim() || !formLastName.trim() || !formUsername.trim()) {
      formError = 'Nombre, apellido y nombre de usuario son obligatorios.';
      return;
    }
    if (!isEditMode && !formPassword.trim()) {
      formError = 'La contraseña es obligatoria para nuevos usuarios.';
      return;
    }
    if (formPassword && formPassword !== formConfirm) {
      formError = 'Las contraseñas no coinciden.';
      return;
    }

    isSaving  = true;
    formError = '';

    try {
      const isDemoToken = $authStore.token === 'demo-token';

      if (isDemoToken || true) {
        // Modo demo / sin backend: modificar array local
        if (isEditMode && editingUserId !== null) {
          // Editar usuario existente
          users = users.map(u =>
            u.id === editingUserId
              ? { ...u, firstName: formFirstName.trim(), lastName: formLastName.trim(),
                  username: formUsername.trim(), role: formRole }
              : u
          );
        } else {
          // Crear nuevo usuario
          const newUser: User = {
            id:          Date.now(),
            firstName:   formFirstName.trim(),
            lastName:    formLastName.trim(),
            username:    formUsername.trim(),
            role:        formRole,
            status:      'active',
            lastSeen:    'Ahora',
            performance: undefined,
          };
          users = [...users, newUser];
        }
      }
      // TODO: backend
      // else if (isEditMode) {
      //   await usersApi.update(editingUserId, { firstName, lastName, username, role, password });
      //   await loadUsers();
      // } else {
      //   await usersApi.create({ firstName, lastName, username, password, role });
      //   await loadUsers();
      // }

      showUserModal = false;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      formError = `Error al guardar: ${msg}`;
    } finally {
      isSaving = false;
    }
  }

  // ---------------------------------------------------------------------------
  // ABRIR MODAL: Eliminar usuario
  // ---------------------------------------------------------------------------
  function openDeleteModal(user: User) {
    openMenuId    = null;
    deletingUser  = user;
    showDeleteModal = true;
  }

  // ---------------------------------------------------------------------------
  // CONFIRMAR: Eliminar usuario
  // Modo demo: elimina del array local.
  // TODO: backend — llamar a usersApi.delete(id)
  // ---------------------------------------------------------------------------
  async function handleConfirmDelete() {
    if (!deletingUser) return;
    isDeleting = true;

    try {
      // TODO: backend — await usersApi.delete(deletingUser.id);
      users = users.filter(u => u.id !== deletingUser!.id);
      showDeleteModal = false;
      deletingUser    = null;
    } catch (err) {
      console.error('[Users] Error eliminando:', err);
    } finally {
      isDeleting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS DE UI
  // ---------------------------------------------------------------------------

  // Etiqueta y color del rol
  function roleLabel(role: UserRole): string {
    const map: Record<UserRole, string> = {
      operator: 'Operario',
      reviewer: 'Revisor',
      admin:    'Administrador',
    };
    return map[role] ?? role;
  }

  function roleBadgeStyle(role: UserRole): string {
    const styles: Record<UserRole, string> = {
      operator: 'color: var(--color-primary); background: rgba(90,140,98,0.15); border-color: rgba(90,140,98,0.3)',
      reviewer: 'color: var(--color-warning); background: rgba(208,154,68,0.15); border-color: rgba(208,154,68,0.3)',
      admin:    'color: var(--color-secondary); background: rgba(150,177,240,0.15); border-color: rgba(150,177,240,0.3)',
    };
    return styles[role] ?? '';
  }

  // Iniciales del avatar
  function getInitials(u: User): string {
    return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  }

  // Color del avatar (basado en el rol)
  function avatarBg(role: UserRole): string {
    const colors: Record<UserRole, string> = {
      operator: 'rgba(90,140,98,0.4)',
      reviewer: 'rgba(188,130,60,0.4)',
      admin:    'rgba(150,177,240,0.3)',
    };
    return colors[role] ?? 'rgba(171,183,183,0.2)';
  }

  // Color del rendimiento: verde ≥90, amarillo ≥70, rojo <70
  function performanceColor(p: number): string {
    if (p >= 90) return 'var(--color-success)';
    if (p >= 70) return 'var(--color-warning)';
    return 'var(--color-error)';
  }

  // Roles disponibles para el selector del formulario
  const ROLES: { value: UserRole; label: string; desc: string; icon: string }[] = [
    { value: 'operator', label: 'Operario',       desc: 'Digitalización de documentos', icon: 'user' },
    { value: 'reviewer', label: 'Revisor',         desc: 'Control de calidad',           icon: 'shield' },
    { value: 'admin',    label: 'Administrador',   desc: 'Gestión completa del sistema', icon: 'shield-filled' },
  ];
</script>

<!-- ============================================================
     PÁGINA DE GESTIÓN DE USUARIOS
     ============================================================ -->
<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Gestión de Usuarios</h1>
      <p class="page-subtitle">Control de acceso y roles del personal</p>
    </div>
    <!-- Botón "Nuevo Usuario" — siempre visible para el admin -->
    <button class="btn-primary" onclick={openCreateModal}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Nuevo Usuario
    </button>
  </div>

  <!-- ── Barra de búsqueda y filtros ── -->
  <div class="toolbar">
    <!-- Búsqueda por nombre o username -->
    <div class="search-wrapper">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder="Buscar usuario..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>

    <!-- Filtro por Rol -->
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      <select class="filter-select" bind:value={filterRole}>
        <option value="">Rol</option>
        <option value="operator">Operario</option>
        <option value="reviewer">Revisor</option>
        <option value="admin">Administrador</option>
      </select>
    </div>

    <!-- Filtro por Estado -->
    <div class="filter-group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <select class="filter-select" bind:value={filterStatus}>
        <option value="">Estado</option>
        <option value="active">Activo</option>
        <option value="inactive">Inactivo</option>
      </select>
    </div>
  </div>

  <!-- ── Tabla de usuarios ── -->
  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Cargando usuarios...</span>
    </div>

  {:else if filteredUsers.length === 0}
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <span>{searchQuery || filterRole || filterStatus ? 'Sin resultados para los filtros aplicados' : 'No hay usuarios aún'}</span>
    </div>

  {:else}
    <div class="table-wrapper">
      <table class="users-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Última Conexión</th>
            <th>Rendimiento</th>
            <th class="col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredUsers as user}
            <tr class="table-row">

              <!-- Avatar + nombre + username -->
              <td>
                <div class="user-cell">
                  <div class="avatar" style="background: {avatarBg(user.role)}">
                    {getInitials(user)}
                  </div>
                  <div class="user-info">
                    <span class="user-fullname">{user.firstName} {user.lastName}</span>
                    <span class="user-username">{user.username}</span>
                  </div>
                </div>
              </td>

              <!-- Badge de rol -->
              <td>
                <span class="role-badge" style={roleBadgeStyle(user.role)}>
                  {roleLabel(user.role)}
                </span>
              </td>

              <!-- Estado: punto de color + texto -->
              <td>
                <div class="status-cell">
                  <div class="status-dot" class:active={user.status === 'active'}></div>
                  <span class:inactive={user.status === 'inactive'}>
                    {user.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </td>

              <!-- Última conexión -->
              <td class="meta-cell">{user.lastSeen}</td>

              <!-- Rendimiento -->
              <td>
                {#if user.performance !== undefined}
                  <span class="performance" style="color: {performanceColor(user.performance)}">
                    {user.performance}%
                  </span>
                {:else}
                  <span class="meta-cell">—</span>
                {/if}
              </td>

              <!-- Menú de acciones (···) -->
              <td class="col-actions">
                <div class="actions-menu-wrapper">
                  <!-- Botón de los tres puntos -->
                  <button
                    class="btn-actions"
                    onclick={(e) => {
                      e.stopPropagation();
                      if (openMenuId === user.id) {
                        openMenuId = null;
                      } else {
                        // Calcular posición del botón para anclar el dropdown con position:fixed
                        // Esto evita que se corte cuando el botón está cerca del borde inferior
                        const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const dropdownHeight = 90; // altura estimada del dropdown
                        const spaceBelow = viewportHeight - btn.bottom;

                        if (spaceBelow < dropdownHeight) {
                          // No hay espacio abajo → abrir hacia arriba
                          dropdownPos = { top: btn.top - dropdownHeight - 4, right: window.innerWidth - btn.right };
                        } else {
                          // Hay espacio abajo → abrir hacia abajo (comportamiento normal)
                          dropdownPos = { top: btn.bottom + 4, right: window.innerWidth - btn.right };
                        }
                        openMenuId = user.id;
                      }
                    }}
                    aria-label="Acciones"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                      <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                    </svg>
                  </button>

                  <!-- Dropdown del menú -->
                  {#if openMenuId === user.id}
                    <!-- Dropdown con position:fixed para no cortarse por el borde del contenedor -->
                    <div class="actions-dropdown"
                      style="top: {dropdownPos.top}px; right: {dropdownPos.right}px;">
                      <!-- Editar: abre el modal con datos pre-cargados -->
                      <button class="dropdown-item" onclick={() => openEditModal(user)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Editar
                      </button>
                      <!-- Separador -->
                      <div class="dropdown-sep"></div>
                      <!-- Eliminar: abre modal de confirmación -->
                      <button class="dropdown-item danger" onclick={() => openDeleteModal(user)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                        Eliminar
                      </button>
                    </div>
                  {/if}
                </div>
              </td>

            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

</div>

<!-- ============================================================
     MODAL: Crear / Editar Usuario
     isEditMode = false → "Crear nuevo usuario"
     isEditMode = true  → "Editar usuario"
     ============================================================ -->
{#if showUserModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      showUserModal = false;
    }
  }}>
    <div class="modal-card">

      <!-- Cabecera del modal -->
      <div class="modal-header">
        <div>
          <h3 class="modal-title">
            {isEditMode ? 'Editar usuario' : 'Crear nuevo usuario'}
          </h3>
          <p class="modal-subtitle">
            {isEditMode ? 'Modifica los datos del usuario' : 'Agregar usuario al sistema'}
          </p>
        </div>
        <button class="modal-close" onclick={() => showUserModal = false} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Campos del formulario -->
      <div class="modal-body">

        <!-- Nombre + Apellido en dos columnas -->
        <div class="form-row">
          <div class="form-field">
            <label class="field-label">Nombre</label>
            <input class="field-input" type="text" placeholder="Ej: María" bind:value={formFirstName} />
          </div>
          <div class="form-field">
            <label class="field-label">Apellido</label>
            <input class="field-input" type="text" placeholder="Ej: García" bind:value={formLastName} />
          </div>
        </div>

        <!-- Nombre de usuario -->
        <div class="form-field">
          <label class="field-label">Nombre de usuario</label>
          <input class="field-input" type="text" placeholder="Ej: maria.garcia" bind:value={formUsername} />
        </div>

        <!-- Contraseña -->
        <div class="form-field">
          <label class="field-label">
            {isEditMode ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
          </label>
          <div class="password-wrapper">
            <input
              class="field-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Ingrese contraseña"
              bind:value={formPassword}
            />
            <button class="eye-btn" onclick={() => showPassword = !showPassword} aria-label="Toggle contraseña">
              {#if showPassword}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Confirmar contraseña -->
        <div class="form-field">
          <label class="field-label">Confirmar contraseña</label>
          <div class="password-wrapper">
            <input
              class="field-input"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirme contraseña"
              bind:value={formConfirm}
            />
            <button class="eye-btn" onclick={() => showConfirm = !showConfirm} aria-label="Toggle confirmar">
              {#if showConfirm}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Asignar rol — radio buttons estilizados como cards -->
        <div class="form-field">
          <label class="field-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Asignar rol
          </label>
          <div class="roles-list">
            {#each ROLES as roleOpt}
              <button
                class="role-option"
                class:selected={formRole === roleOpt.value}
                onclick={() => formRole = roleOpt.value}
              >
                <div class="role-option-icon">
                  {#if roleOpt.icon === 'user'}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  {:else}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  {/if}
                </div>
                <div class="role-option-text">
                  <span class="role-option-label">{roleOpt.label}</span>
                  <span class="role-option-desc">{roleOpt.desc}</span>
                </div>
                <!-- Radio visual -->
                <div class="radio-circle" class:selected={formRole === roleOpt.value}>
                  {#if formRole === roleOpt.value}
                    <div class="radio-dot"></div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Error de formulario -->
        {#if formError}
          <div class="form-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {formError}
          </div>
        {/if}

      </div><!-- /modal-body -->

      <!-- Botones del modal -->
      <div class="modal-actions">
        <button class="btn-ghost" onclick={() => showUserModal = false}>Cancelar</button>
        <button class="btn-crear" onclick={handleSaveUser} disabled={isSaving}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {isSaving ? 'Guardando...' : isEditMode ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>

    </div>
  </div>
{/if}

<!-- ============================================================
     MODAL: Confirmar eliminación
     Aparece cuando el usuario elige "Eliminar" en el menú de acciones
     ============================================================ -->
{#if showDeleteModal && deletingUser}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      showDeleteModal = false;
    }
  }}>
    <!-- Modal de confirmación — mismo estilo que el popup "Retomar la foto" de Gallery -->
    <div class="modal-card modal-confirm">

      <!-- Título alineado a la izquierda -->
      <h3 class="confirm-title">¿Eliminar usuario?</h3>

      <!-- Descripción con el nombre del usuario destacado -->
      <p class="confirm-desc">
        ¿Estás seguro que quieres eliminar a
        <strong>{deletingUser.firstName} {deletingUser.lastName}</strong>
        ({deletingUser.username})?
        Esta acción no se puede deshacer.
      </p>

      <!-- Botones: Cancelar (ghost) + Sí, eliminar (rojo) -->
      <div class="modal-actions">
        <button class="btn-ghost" onclick={() => showDeleteModal = false} disabled={isDeleting}>
          Cancelar
        </button>
        <button class="btn-delete" onclick={handleConfirmDelete} disabled={isDeleting}>
          {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
        </button>
      </div>

    </div>
  </div>
{/if}

<style>
  .page { padding: 32px; max-width: 1200px; }

  /* ── Header ── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 28px;
  }

  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* ── Buttons ── */
  .btn-primary {
    display: flex; align-items: center; gap: 8px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    padding: 9px 18px; min-height: var(--touch-target-min);
    cursor: pointer; transition: background-color var(--transition-base);
    white-space: nowrap; flex-shrink: 0;
  }

  .btn-primary:hover { background-color: var(--color-primary-hover); }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 7px;
    background: none; border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 9px 18px;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .btn-ghost:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* ── Toolbar ── */
  .toolbar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }

  .search-wrapper { position: relative; flex: 1; max-width: 440px; }

  .search-icon {
    position: absolute; left: 12px; top: 50%;
    transform: translateY(-50%); color: var(--color-light-grey); pointer-events: none;
  }

  .search-input {
    width: 100%; background-color: var(--color-surface);
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    padding: 9px 12px 9px 36px; font-family: var(--font-family);
    font-size: var(--text-sm); color: var(--color-light); outline: none;
    transition: border-color var(--transition-base); min-height: var(--touch-target-min);
  }

  .search-input:focus { border-color: var(--color-primary); }
  .search-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  .filter-group {
    display: flex; align-items: center; gap: 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    padding: 0 12px; color: var(--color-light-grey);
    min-height: var(--touch-target-min);
  }

  .filter-select {
    background: none; border: none; outline: none;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    padding: 9px 0; min-height: 0;
  }

  /* ── Estados de carga / vacío ── */
  .loading-state, .empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; padding: 60px 20px;
    color: var(--color-light-grey); font-size: var(--text-base);
  }

  .spinner {
    width: 30px; height: 30px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Tabla ── */
  .table-wrapper {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .users-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); text-align: left; }

  .users-table thead tr {
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--border-color);
  }

  .users-table th {
    padding: 12px 20px;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .users-table td { padding: 14px 20px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .users-table tbody tr:last-child td { border-bottom: none; }

  .table-row { transition: background-color var(--transition-fast); }
  .table-row:hover { background-color: rgba(255,255,255,0.02); }

  /* Avatar + nombre */
  .user-cell { display: flex; align-items: center; gap: 12px; }

  .avatar {
    width: 38px; height: 38px;
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-weight: var(--fw-extrabold); font-size: 13px;
    color: white; flex-shrink: 0;
  }

  .user-info { display: flex; flex-direction: column; }
  .user-fullname { font-weight: var(--fw-semibold); color: var(--color-light); }
  .user-username { font-size: 11px; color: var(--color-light-grey); }

  /* Badge de rol */
  .role-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    font-size: 12px; font-weight: var(--fw-semibold);
    border: 1px solid transparent;
    white-space: nowrap;
  }

  /* Estado */
  .status-cell { display: flex; align-items: center; gap: 8px; color: var(--color-light-grey); }

  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    flex-shrink: 0;
  }

  .status-dot.active { background-color: var(--color-success); box-shadow: 0 0 6px rgba(111,191,115,0.4); }

  .inactive { color: var(--color-light-grey); opacity: 0.6; }

  .meta-cell { color: var(--color-light-grey); font-size: var(--text-sm); }

  .performance { font-weight: var(--fw-bold); font-size: var(--text-sm); }

  /* Columna de acciones */
  .col-actions { text-align: center; width: 80px; }

  /* ── Menú de acciones (···) ── */
  .actions-menu-wrapper { position: relative; display: inline-flex; justify-content: center; }

  .btn-actions {
    width: 36px; height: 36px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: 0;
  }

  .btn-actions:hover { border-color: var(--color-primary); color: var(--color-light); }

  /* Dropdown del menú */
  .actions-dropdown {
    /* position:fixed para no cortarse con el borde del contenedor */
    /* Las coordenadas top/right se calculan dinámicamente en el onclick */
    position: fixed;
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 4px;
    min-width: 140px;
    box-shadow: var(--shadow-md);
    z-index: 200;
  }

  .dropdown-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px;
    background: none; border: none;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    text-align: left; min-height: 0;
  }

  .dropdown-item:hover { background-color: rgba(255,255,255,0.05); color: var(--color-light); }
  .dropdown-item.danger:hover { background-color: rgba(214,103,74,0.1); color: var(--color-error); }

  .dropdown-sep { height: 1px; background-color: var(--border-color); margin: 4px 0; }

  /* ══ MODALES ══ */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%; max-width: 420px;
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column; gap: 16px;
    max-height: 90vh; overflow-y: auto;
  }

  .modal-card::-webkit-scrollbar { width: 3px; }
  .modal-card::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  /* Modal de confirmación — mismo estilo que popup "Retomar la foto" */
  .modal-confirm {
    max-width: 440px;
    gap: 12px;
  }

  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .modal-title  { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 4px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .modal-close {
    width: 30px; height: 30px; background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey); cursor: pointer;
    border-radius: var(--radius-sm); transition: all var(--transition-fast); flex-shrink: 0;
  }

  .modal-close:hover { background-color: var(--color-surface); color: var(--color-light); }

  .modal-body { display: flex; flex-direction: column; gap: 14px; }

  /* Form fields */
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .form-field { display: flex; flex-direction: column; gap: 6px; }

  .field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase; letter-spacing: 0.06em;
  }

  .field-input {
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    padding: 9px 12px; outline: none;
    transition: border-color var(--transition-base);
    min-height: var(--touch-target-min); width: 100%;
  }

  .field-input:focus { border-color: var(--color-primary); }
  .field-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  /* Campo contraseña con ícono de ojo */
  .password-wrapper { position: relative; }
  .password-wrapper .field-input { padding-right: 40px; }

  .eye-btn {
    position: absolute; right: 10px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--color-light-grey); cursor: pointer;
    padding: 4px; display: flex; align-items: center;
    min-height: 0; transition: color var(--transition-fast);
  }

  .eye-btn:hover { color: var(--color-light); }

  /* Opciones de rol */
  .roles-list { display: flex; flex-direction: column; gap: 8px; }

  .role-option {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    cursor: pointer; transition: all var(--transition-fast);
    text-align: left; width: 100%; min-height: 0;
  }

  .role-option:hover   { border-color: rgba(90,140,98,0.4); }
  .role-option.selected { background-color: rgba(90,140,98,0.08); border-color: var(--color-primary); }

  .role-option-icon {
    width: 36px; height: 36px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface-alt);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey); flex-shrink: 0;
  }

  .role-option.selected .role-option-icon { color: var(--color-primary); }

  .role-option-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .role-option-label { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .role-option-desc  { font-size: 11px; color: var(--color-light-grey); }

  /* Radio visual */
  .radio-circle {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: border-color var(--transition-fast);
  }

  .radio-circle.selected { border-color: var(--color-primary); }

  .radio-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background-color: var(--color-primary);
  }

  /* Error de formulario */
  .form-error {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    background-color: rgba(214,103,74,0.08);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--color-error); line-height: 1.4;
  }

  /* Acciones del modal */
  .modal-actions {
    display: flex; gap: 12px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .btn-crear {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    padding: 9px 18px; min-height: var(--touch-target-min);
    cursor: pointer; transition: background-color var(--transition-base);
  }

  .btn-crear:hover    { background-color: var(--color-primary-hover); }
  .btn-crear:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Título del modal de confirmación */
  .confirm-title {
    font-size: var(--text-h3);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0;
  }

  /* Descripción del modal de confirmación */
  .confirm-desc {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    line-height: 1.6;
    margin: 0;
  }

  .confirm-desc strong { color: var(--color-light); }

  /* Botón eliminar — rojo */
  .btn-delete {
    flex: 1; height: 44px;
    background-color: var(--color-error); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    cursor: pointer; transition: opacity var(--transition-base);
  }

  .btn-delete:hover    { opacity: 0.85; }
  .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }
</style>