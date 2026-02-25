import { login, register, checkSession, resetPassword, updatePassword, onRecovery } from './auth';

onRecovery(async () => {
  // Ocultar formulario de login normal y mostrar el de reinicio
  document.getElementById('loginForm').style.display = 'none';
  const resetForm = document.getElementById('resetPasswordForm');
  if (resetForm) {
    resetForm.style.display = 'flex';
  }
});
document.addEventListener('DOMContentLoaded', async () => {
  // Evitar redireccionar si venimos de un enlace de recuperación de contraseña
  // Supabase agrega un hash a la URL cuando se restablece la contraseña, usualmente con type=recovery
  const hashStr = window.location.hash;
  const isRecoveryFlow = hashStr.includes('type=recovery');

  try {
    const session = await checkSession();
    // Solo redirigir si hay sesión y NO estamos en flujo de recuperación
    if (session && !isRecoveryFlow) {
      window.location.href = '/dashboard.html';
      return;
    }
  } catch (err) {
    console.warn("No Supabase connection configured yet. Please update .env");
  }

  const loginForm = document.getElementById('loginForm');
  const toggleMode = document.getElementById('toggleMode');
  const formTitle = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const toggleText = document.getElementById('toggleText');
  const authError = document.getElementById('authError');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const forgotPasswordLink = document.querySelector('.forgot-password');

  let isLoginMode = true;

  // Crear el campo de nombre dinámicamente para modo registro
  const nameGroup = document.createElement('div');
  nameGroup.className = 'login-input-wrapper';
  nameGroup.id = 'nameGroup';
  nameGroup.style.display = 'none';
  nameGroup.style.position = 'relative';
  nameGroup.style.width = '100%';
  nameGroup.innerHTML = `
        <svg class="icon icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <input type="text" class="input-login" id="nombre" placeholder="Nombre Completo" />
    `;

  // Message for domain restriction
  const domainWarning = document.createElement('div');
  domainWarning.className = 'domain-warning';
  domainWarning.style.display = 'none';
  domainWarning.innerHTML = 'Solo se admiten correos @cuautla.tecnm.mx';

  // Insertarlo antes del email
  const emailGroup = emailInput.closest('.login-input-wrapper');
  emailGroup.parentElement.insertBefore(nameGroup, emailGroup);

  // Insert domain warning after the submit button
  const submitButtonRef = document.getElementById('submitBtn');
  submitButtonRef.parentElement.insertBefore(domainWarning, submitButtonRef.nextSibling);

  const nombreInput = document.getElementById('nombre');

  toggleMode.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authError.style.display = 'none';

    if (isLoginMode) {
      formTitle.textContent = 'Bienvenido';
      submitBtn.innerHTML = `Iniciar Sesión <svg viewBox="0 0 24 24" fill="none" class="btn-icon-right" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
      toggleText.textContent = '¿No tienes cuenta?';
      toggleMode.textContent = 'Regístrate';
      nameGroup.style.display = 'none';
      domainWarning.style.display = 'none';
      nombreInput.required = false;
    } else {
      formTitle.textContent = 'Registro';
      submitBtn.innerHTML = `Crear Cuenta <svg viewBox="0 0 24 24" fill="none" class="btn-icon-right" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
      toggleText.textContent = '¿Ya tienes cuenta?';
      toggleMode.textContent = 'Inicia Sesión';
      nameGroup.style.display = 'block';
      domainWarning.style.display = 'block';
      nombreInput.required = true;
    }
  });

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();

      if (!email) {
        showError("Para recuperar tu contraseña, primero ingresa tu correo electrónico.");
        return;
      }

      if (!email.endsWith('@cuautla.tecnm.mx')) {
        showError("Solo se admiten correos @cuautla.tecnm.mx");
        return;
      }

      submitBtn.disabled = true;
      authError.style.display = 'none';

      try {
        const { error } = await resetPassword(email);
        if (error) throw error;

        authError.style.display = 'block';
        authError.className = 'success-msg';
        authError.textContent = 'Se ha enviado un enlace de recuperación a tu correo.';
      } catch (error) {
        showError(error.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const nombre = nombreInput.value.trim();

    if (!email.endsWith('@cuautla.tecnm.mx')) {
      showError("Solo se admiten correos @cuautla.tecnm.mx");
      resetBtn();
      return;
    }

    if (password.length < 6) {
      showError("La contraseña debe tener al menos 6 caracteres");
      resetBtn();
      return;
    }

    try {
      if (isLoginMode) {
        const { error } = await login(email, password);
        if (error) throw error;
        // Al loguearse correctamente:
        window.location.href = '/dashboard.html';
      } else {
        const { data, error } = await register(email, password, nombre);
        if (error) throw error;

        // Supabase a veces envía error si se trata de registrar alguien ya registrado. O devuelve identities vacío
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          showError('Error: El correo o usuario ya está registrado.');
          resetBtn();
          return;
        }

        authError.style.display = 'block';
        authError.className = 'success-msg';
        authError.textContent = 'Registro exitoso. Iniciando sesión automáticamente...';

        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 1500);
      }
    } catch (error) {
      // Manejar errores de Supabase
      let errorMsg = error.message;
      if (errorMsg === "Invalid login credentials") {
        errorMsg = "Credenciales incorrectas.";
      } else if (errorMsg === "Email not confirmed") {
        errorMsg = "Debes desactivar 'Confirm email' en tu panel de Supabase (Authentication -> Providers -> Email).";
      }
      showError(errorMsg);
      resetBtn();
    }
  });

  function showError(msg) {
    authError.style.display = 'block';
    authError.className = 'error-msg';
    authError.textContent = msg;
  }

  function resetBtn() {
    submitBtn.disabled = false;
    submitBtn.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
  }

  // Set up multiple password toggles
  function setupPasswordToggle(toggleId, inputId) {
    const toggleBtn = document.getElementById(toggleId);
    const inputField = document.getElementById(inputId);
    if (!toggleBtn || !inputField) return;

    const icon = toggleBtn.querySelector('.icon');
    toggleBtn.addEventListener('click', () => {
      const type = inputField.getAttribute('type') === 'password' ? 'text' : 'password';
      inputField.setAttribute('type', type);

      if (type === 'text') {
        icon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
      } else {
        icon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
      }
    });
  }

  setupPasswordToggle('togglePassword', 'password');
  setupPasswordToggle('toggleNewPassword', 'newPassword');
  setupPasswordToggle('toggleConfirmNewPassword', 'confirmNewPassword');

  // Reset Password UI Logic
  const resetPasswordForm = document.getElementById('resetPasswordForm');
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassStr = document.getElementById('newPassword').value;
      const confirmPassStr = document.getElementById('confirmNewPassword').value;
      const resetError = document.getElementById('resetAuthError');
      const submitResetBtn = document.getElementById('submitResetBtn');

      resetError.style.display = 'none';

      if (newPassStr.length < 6) {
        resetError.style.display = 'block';
        resetError.className = 'error-msg';
        resetError.textContent = "La contraseña debe tener al menos 6 caracteres.";
        return;
      }

      if (newPassStr !== confirmPassStr) {
        resetError.style.display = 'block';
        resetError.className = 'error-msg';
        resetError.textContent = "Las contraseñas no coinciden.";
        return;
      }

      submitResetBtn.disabled = true;
      submitResetBtn.textContent = 'Actualizando...';

      try {
        const { error } = await updatePassword(newPassStr);
        if (error) throw error;

        resetError.style.display = 'block';
        resetError.className = 'success-msg';
        resetError.textContent = "Contraseña actualizada con éxito. Iniciando sesión...";

        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 1500);

      } catch (error) {
        resetError.style.display = 'block';
        resetError.className = 'error-msg';
        resetError.textContent = error.message;
        submitResetBtn.disabled = false;
        submitResetBtn.textContent = 'Actualizar Contraseña';
      }
    });
  }

});
