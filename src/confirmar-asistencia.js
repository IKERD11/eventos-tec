// src/confirmar-asistencia.js
// Página pública de confirmación de asistencia (sin login)
import { supabase } from './supabase.js';

const cardBody = document.getElementById('cardBody');

// ---- Leer parámetros de la URL ----
const params   = new URLSearchParams(window.location.search);
const token    = params.get('token');
const accion   = params.get('accion'); // 'si' | 'no' (viene del botón del email)

// ============================================================
// HELPERS
// ============================================================

function formatFecha(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function showError(msg) {
  cardBody.innerHTML = `
    <div class="result">
      <div class="result-icon">⚠️</div>
      <h2 class="result-title error">Enlace inválido</h2>
      <p class="result-text">${msg}</p>
    </div>`;
}

function showAlreadyAnswered(confirmado, titulo) {
  const emoji = confirmado ? '✅' : '❌';
  const texto = confirmado ? 'confirmaste tu asistencia' : 'indicaste que no podrías asistir';
  cardBody.innerHTML = `
    <div class="result">
      <div class="result-icon">${emoji}</div>
      <h2 class="result-title already">Ya respondiste</h2>
      <p class="result-text">
        Anteriormente <strong>${texto}</strong> al evento<br>
        <strong style="color:#e2e8f0;">${titulo}</strong>.
      </p>
    </div>`;
}

function showSuccess(confirmado, nombre, titulo) {
  const emoji  = confirmado ? '🎉' : '👋';
  const title  = confirmado ? '¡Asistencia confirmada!' : 'Respuesta registrada';
  const cls    = confirmado ? 'success' : 'declined';
  const text   = confirmado
    ? `Gracias <strong>${nombre}</strong>, tu asistencia a <strong style="color:#e2e8f0;">${titulo}</strong> ha sido confirmada.`
    : `Gracias <strong>${nombre}</strong>, hemos registrado que no podrás asistir a <strong style="color:#e2e8f0;">${titulo}</strong>.`;

  cardBody.innerHTML = `
    <div class="result">
      <div class="result-icon">${emoji}</div>
      <h2 class="result-title ${cls}">${title}</h2>
      <p class="result-text">${text}</p>
    </div>`;
}

// ============================================================
// Construcción de la vista con los datos de la invitación
// ============================================================
function renderInvitacion(data) {
  cardBody.innerHTML = `
    <p class="greeting">Hola <strong>${data.nombre}</strong>,<br>
      tienes una invitación al siguiente evento académico.
    </p>

    <div class="event-card">
      <h2 class="event-title">${data.evento_titulo}</h2>
      <div class="event-detail">
        <span class="detail-label">📅 Fecha</span>
        <span class="detail-value">${formatFecha(data.evento_fecha)}</span>
      </div>
      ${data.evento_hora ? `
      <div class="event-detail">
        <span class="detail-label">🕐 Hora</span>
        <span class="detail-value">${data.evento_hora}</span>
      </div>` : ''}
      ${data.evento_lugar ? `
      <div class="event-detail">
        <span class="detail-label">📍 Lugar</span>
        <span class="detail-value">${data.evento_lugar}</span>
      </div>` : ''}
      <div class="event-detail">
        <span class="detail-label">🎯 Modalidad</span>
        <span class="detail-value">${data.evento_modalidad}</span>
      </div>
    </div>

    <p class="question">¿Confirmas tu asistencia?</p>
    <div class="btn-group">
      <button class="btn btn-confirm" id="btnSi">✅ Sí, asistiré</button>
      <button class="btn btn-decline" id="btnNo">❌ No podré asistir</button>
    </div>`;

  document.getElementById('btnSi').addEventListener('click', () => responder(true));
  document.getElementById('btnNo').addEventListener('click', () => responder(false));
}

// ============================================================
// Registrar respuesta en Supabase via RPC
// ============================================================
async function responder(confirmado) {
  const btnSi = document.getElementById('btnSi');
  const btnNo = document.getElementById('btnNo');
  if (btnSi) btnSi.disabled = true;
  if (btnNo) btnNo.disabled = true;

  const { data, error } = await supabase.rpc('confirmar_invitacion', {
    p_token:      token,
    p_confirmado: confirmado,
  });

  if (error || data?.error) {
    const msg = data?.error || error.message;
    if (msg.includes('Ya habías')) {
      showAlreadyAnswered(data?.confirmado, data?.titulo || '');
    } else {
      showError(msg);
    }
    return;
  }

  showSuccess(confirmado, data.nombre, data.titulo);
}

// ============================================================
// Inicialización
// ============================================================
async function init() {
  if (!token) {
    showError('No se encontró un token de invitación en el enlace. Verifica que hayas abierto el correo correctamente.');
    return;
  }

  // Obtener datos de la invitación via RPC pública
  const { data, error } = await supabase.rpc('get_invitacion_by_token', { p_token: token });

  if (error || data?.error) {
    showError(data?.error || error.message);
    return;
  }

  // Si ya respondió
  if (data.confirmado !== null) {
    showAlreadyAnswered(data.confirmado, data.evento_titulo);
    return;
  }

  // Si viene accion desde los botones del email, confirmar directo
  if (accion === 'si' || accion === 'no') {
    // Primero muestra la info del evento brevemente, luego confirma automáticamente
    renderInvitacion(data);
    // Auto-responder en 500ms para que el usuario vea qué está confirmando
    setTimeout(() => responder(accion === 'si'), 600);
    return;
  }

  // Sin acción predefinida: mostrar la página interactiva
  renderInvitacion(data);
}

init();
