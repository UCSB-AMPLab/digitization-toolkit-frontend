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

<style>
  .welcome-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1rem;
  }

  .welcome-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 450px;
    width: 100%;
    overflow: hidden;
  }

  .header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.8rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    opacity: 0.9;
    font-size: 0.9rem;
  }

  .form-container {
    padding: 2rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    color: #6b7280;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #667eea;
  }

  .tab.active {
    color: #667eea;
    border-bottom-color: #667eea;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: #374151;
    font-weight: 500;
    font-size: 0.9rem;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: #667eea;
  }

  input:disabled {
    background-color: #f9fafb;
    cursor: not-allowed;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .submit-btn {
    width: 100%;
    padding: 0.875rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, opacity 0.2s;
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-mode {
    margin-top: 1.5rem;
    text-align: center;
    color: #6b7280;
    font-size: 0.9rem;
  }

  .toggle-mode button {
    background: none;
    border: none;
    color: #667eea;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .toggle-mode button:hover {
    color: #764ba2;
  }

  .toggle-mode p {
    margin: 0;
  }
</style>
