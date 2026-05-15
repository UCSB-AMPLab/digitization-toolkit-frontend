# Routing & Página Inicial — Digitization Toolkit

## Cómo funciona el flujo de entrada

Cuando alguien abre la app, SvelteKit carga primero el archivo raíz:

```
frontend/src/routes/+page.svelte
```

Este archivo **no muestra contenido**, solo lee si hay sesión activa y redirige al lugar correcto:

```
¿Hay token guardado?
  ├── Sí → redirige al dashboard según rol (/admin, /operator, /reviewer)
  └── No → redirige a la página de entrada (hoy: /login)
```

---

## Archivos que controlan esto

### 1. `frontend/src/routes/+page.svelte`
Es el "portero". Solo contiene lógica de redirección, sin HTML visible.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { tokenStore } from '$lib/api';

  if (browser) {
    const token = tokenStore.get();
    if (token) {
      // Si hay sesión activa, ir al dashboard
      goto('/dashboard');
    } else {
      // Si no hay sesión, ir a la página de entrada
      goto('/login');        // ← CAMBIAR AQUÍ para apuntar a otra página
    }
  }
</script>
```

### 2. `frontend/src/routes/(auth)/login/+page.svelte`
La página de login actual. Si quieres agregar una pantalla de bienvenida con logo, 
puedes crear una ruta nueva y apuntar la redirección ahí.

---

## Cómo cambiar la página inicial

### Opción A — Agregar pantalla de bienvenida antes del login

**Paso 1:** Crea la nueva ruta:
```
frontend/src/routes/(auth)/welcome/+page.svelte
```

**Paso 2:** Pon tu contenido (logo, animación, botón de entrar):
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="splash">
  <img src="/logo.svg" alt="Digitization Toolkit" />
  <button class="btn btn-primary" onclick={() => goto('/login')}>
    Iniciar sesión
  </button>
</div>
```

**Paso 3:** En `+page.svelte` raíz, cambia la redirección:
```svelte
// Antes:
goto('/login');

// Después:
goto('/welcome');   // ← apunta a la nueva pantalla
```

---

### Opción B — Convertir el login en splash screen directamente

Si no quieres una ruta extra, simplemente edita 
`frontend/src/routes/(auth)/login/+page.svelte` y agrega el logo 
arriba del formulario. No hay que tocar la redirección.

---

### Opción C — Redirección directa al dashboard (sin pantalla de entrada)

Si en algún momento quieres saltarte el login (por ejemplo en desarrollo):
```svelte
// En +page.svelte raíz, comenta el else:
if (token) {
  goto('/dashboard');
} 
// else { goto('/login'); }    // ← comentado = siempre va al dashboard
```

⚠️ Solo para desarrollo. Nunca en producción.

---

## Mapa visual del flujo

```
Abre la app
     │
     ▼
+page.svelte (raíz)
     │
     ├─ token existe ──────────────────► /dashboard (por rol)
     │
     └─ sin token
          │
          └─ goto('/login')      ← cambiar esta línea para redirigir a otro lado
               │
               ▼
         (auth)/login/+page.svelte
               │
               └─ login exitoso ─────► /dashboard (por rol)
```

---

## Grupo de rutas `(auth)`

El paréntesis en el nombre `(auth)` es una convención de SvelteKit — 
**no aparece en la URL**. Es solo para agrupar archivos relacionados.

```
Archivo:  src/routes/(auth)/login/+page.svelte
URL real: http://localhost:5173/login          ← sin el "(auth)"
```

Si creas `(auth)/welcome/+page.svelte`, la URL será `/welcome`.  
Si creas `(auth)/splash/+page.svelte`, la URL será `/splash`.

---

## Regla general

> Para cambiar a dónde va el usuario cuando abre la app por primera vez,
> solo hay que editar **una línea** en `frontend/src/routes/+page.svelte`:
> ```js
> goto('/lo-que-quieras');
> ```
