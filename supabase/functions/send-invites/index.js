// ============================================================
// Edge Function: send-invites  (JavaScript puro, sin TypeScript)
// Proyecto: eventos-tec (SGEA)
//
// INSTRUCCIONES DE DESPLIEGUE (para el amigo con acceso a Supabase):
//
// 1. Guardar este archivo como index.js en la misma carpeta.
//    (o renombrar index.ts → index.js y borrar el .ts)
//
// 2. Configurar los secrets en Supabase:
//    supabase secrets set RESEND_API_KEY=re_ST43oS4K_BEPyfk533oyRbG7jDTkTB8s9
//    supabase secrets set SITE_URL=http://localhost:5173
//    (cambiar SITE_URL por la URL de producción al desplegar)
//
// 3. Desplegar la función:
//    supabase functions deploy send-invites --project-ref jxbsubqpugkrzydwxkpr --entrypoint index.js
//
// NOTA: El remitente usa "onboarding@resend.dev" por defecto (dominio de prueba de Resend).
//       Para producción, verificar un dominio en resend.com y cambiar el campo "from".
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL");
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey   = Deno.env.get("RESEND_API_KEY");
    const siteUrl        = Deno.env.get("SITE_URL") || "http://localhost:5173";

    // ---- Verificar sesión y rol ----
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("No autorizado");

    const { data: profile } = await supabaseUser
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "admin_general"].includes(profile.rol)) {
      throw new Error("Sin permisos. Se requiere rol admin o admin_general.");
    }

    // ---- Cliente con service role (bypass RLS) ----
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { evento_id, personal_ids } = await req.json();

    if (!evento_id || !personal_ids?.length) {
      throw new Error("Se requieren evento_id y personal_ids");
    }

    // ---- Datos del evento ----
    const { data: evento, error: eventoError } = await supabase
      .from("eventos")
      .select("titulo, fecha, hora, lugar, modalidad, descripcion")
      .eq("id", evento_id)
      .single();

    if (eventoError) throw eventoError;

    // ---- Datos del personal seleccionado ----
    const { data: personas, error: personasError } = await supabase
      .from("personal")
      .select("id, nombre_completo, correo")
      .in("id", personal_ids);

    if (personasError) throw personasError;

    const results = { enviados: 0, omitidos: 0, errores: 0, detalles: [] };

    for (const persona of (personas ?? [])) {
      try {
        // Upsert invitación — conserva el token si ya existe
        const { data: inv, error: invError } = await supabase
          .from("invitaciones")
          .upsert(
            { evento_id, personal_id: persona.id },
            { onConflict: "evento_id,personal_id" }
          )
          .select("id, token, confirmado")
          .single();

        if (invError) throw invError;

        // Si ya respondió, omitir
        if (inv.confirmado !== null) {
          results.omitidos++;
          results.detalles.push({ correo: persona.correo, status: "ya_respondio" });
          continue;
        }

        const confirmLink = `${siteUrl}/confirmar-asistencia.html?token=${inv.token}`;
        const fechaStr = new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-MX", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        // ---- Enviar email via Resend ----
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "SGEA <onboarding@resend.dev>",
            to:   [persona.correo],
            subject: `Invitación: ${evento.titulo}`,
            html: buildEmailHtml(persona.nombre_completo, evento, fechaStr, confirmLink),
          }),
        });

        if (!emailRes.ok) {
          const txt = await emailRes.text();
          throw new Error(`Resend: ${txt}`);
        }

        // Marcar como enviado
        await supabase
          .from("invitaciones")
          .update({ enviado_at: new Date().toISOString() })
          .eq("id", inv.id);

        results.enviados++;
        results.detalles.push({ correo: persona.correo, status: "enviado" });

      } catch (e) {
        results.errores++;
        results.detalles.push({ correo: persona.correo, status: "error", mensaje: e.message });
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


// ============================================================
// Template de email HTML
// ============================================================
function buildEmailHtml(nombre, evento, fechaStr, confirmLink) {
  const siLink = `${confirmLink}&accion=si`;
  const noLink = `${confirmLink}&accion=no`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Invitación — ${evento.titulo}</title>
</head>
<body style="margin:0;padding:20px;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.4);">

    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:32px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;">📅 Invitación a Evento</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Sistema de Gestión de Eventos Académicos · TecNM Cuautla</p>
    </div>

    <div style="padding:32px;">
      <p style="color:#94a3b8;font-size:16px;margin:0 0 8px;">Hola <strong style="color:#e2e8f0;">${nombre}</strong>,</p>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 28px;">
        Tienes una invitación al siguiente evento académico. Por favor confirma si asistirás.
      </p>

      <div style="background:#0f172a;border-radius:12px;padding:24px;margin-bottom:28px;border:1px solid rgba(255,255,255,0.07);">
        <h2 style="color:#10b981;margin:0 0 20px;font-size:20px;">${evento.titulo}</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;width:90px;">📅 Fecha</td>
            <td style="padding:7px 0;color:#e2e8f0;font-size:14px;">${fechaStr}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;">🕐 Hora</td>
            <td style="padding:7px 0;color:#e2e8f0;font-size:14px;">${evento.hora || '—'}</td>
          </tr>
          ${evento.lugar ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;">📍 Lugar</td>
            <td style="padding:7px 0;color:#e2e8f0;font-size:14px;">${evento.lugar}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;">🎯 Modalidad</td>
            <td style="padding:7px 0;color:#e2e8f0;font-size:14px;">${evento.modalidad}</td>
          </tr>
        </table>
      </div>

      <p style="color:#94a3b8;font-size:14px;text-align:center;margin:0 0 20px;">¿Confirmas tu asistencia?</p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${siLink}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin:6px;">✅ Sí, asistiré</a>
        <a href="${noLink}" style="display:inline-block;background:#475569;color:#fff;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin:6px;">❌ No podré asistir</a>
      </div>

      <p style="color:#475569;font-size:12px;text-align:center;margin:0;">
        Este enlace es de uso personal. Si tienes dudas, contacta a tu coordinador de academia.
      </p>
    </div>

    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;">TecNM · Campus Cuautla · SGEA</p>
    </div>
  </div>
</body>
</html>`;
}
