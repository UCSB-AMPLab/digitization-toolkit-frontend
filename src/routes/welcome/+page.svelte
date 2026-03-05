<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let mode: 'login' | 'register' = 'login';
  let username = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let errorMessage = '';
  let loading = false;

  // Redirect if already authenticated
  onMount(() => {
    const unsubscribe = isAuthenticated.subscribe(authenticated => {
      if (authenticated) {
        goto('/dashboard');
      }
    });
    return unsubscribe;
  });

  async function handleLogin() {
    if (!username || !password) {
      errorMessage = 'Please fill in all fields';
      return;
    }

    errorMessage = '';
    loading = true;

    try {
      await auth.login(username, password);
      goto('/dashboard');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Login failed';
      loading = false;
    }
  }

  async function handleRegister() {
    if (!username || !email || !password || !confirmPassword) {
      errorMessage = 'Please fill in all fields';
      return;
    }

    if (password !== confirmPassword) {
      errorMessage = 'Passwords do not match';
      return;
    }

    if (password.length < 6) {
      errorMessage = 'Password must be at least 6 characters';
      return;
    }

    errorMessage = '';
    loading = true;

    try {
      await auth.register(username, email, password);
      goto('/dashboard');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Registration failed';
      loading = false;
    }
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (mode === 'login') {
      handleLogin();
    } else {
      handleRegister();
    }
  }

  function toggleMode() {
    mode = mode === 'login' ? 'register' : 'login';
    errorMessage = '';
    password = '';
    confirmPassword = '';
  }
</script>

<div class="welcome-container">
  <div class="welcome-card">
    <div class="header">
      <h1>Digitization Toolkit</h1>
      <p class="subtitle">Offline-capable document digitization for Raspberry Pi</p>
    </div>

    <div class="form-container">
      <div class="tabs">
        <button
          class="tab"
          class:active={mode === 'login'}
          on:click={() => (mode = 'login')}
          type="button"
        >
          Login
        </button>
        <button
          class="tab"
          class:active={mode === 'register'}
          on:click={() => (mode = 'register')}
          type="button"
        >
          Register
        </button>
      </div>

      <form on:submit={handleSubmit}>
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="Enter username"
            disabled={loading}
            required
          />
        </div>

        {#if mode === 'register'}
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              bind:value={email}
              placeholder="Enter email"
              disabled={loading}
              required
            />
          </div>
        {/if}

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="Enter password"
            disabled={loading}
            required
          />
        </div>

        {#if mode === 'register'}
          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              bind:value={confirmPassword}
              placeholder="Confirm password"
              disabled={loading}
              required
            />
          </div>
        {/if}

        {#if errorMessage}
          <div class="error-message">
            {errorMessage}
          </div>
        {/if}

        <button type="submit" class="submit-btn" disabled={loading}>
          {#if loading}
            Processing...
          {:else if mode === 'login'}
            Login
          {:else}
            Register
          {/if}
        </button>
      </form>

      <div class="toggle-mode">
        {#if mode === 'login'}
          <p>Don't have an account? <button type="button" on:click={toggleMode}>Register here</button></p>
        {:else}
          <p>Already have an account? <button type="button" on:click={toggleMode}>Login here</button></p>
        {/if}
      </div>
    </div>
  </div>
</div>
