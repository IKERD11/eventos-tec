import { checkSession, logout, isAdmin } from './auth.js';
import { supabase } from './supabase.js';
import Chart from 'chart.js/auto';

document.addEventListener('DOMContentLoaded', async () => {
    // Proteger ruta
    let session;
    try {
        session = await checkSession();
        if (!session) {
            window.location.href = '/index.html';
            return;
        }

        // Show user name if available
        const nameNode = document.getElementById('userName');
        if (session.user.user_metadata && session.user.user_metadata.nombre_completo) {
            nameNode.textContent = session.user.user_metadata.nombre_completo;
        } else {
            nameNode.textContent = session.user.email;
        }
    } catch (e) {
        console.warn("Supabase auth check failed. Mostrando dashboard en modo prueba.");
    }

    if (await isAdmin()) {
        const navAdmin = document.getElementById('navAdmin');
        if (navAdmin) navAdmin.style.display = 'block';
    }

    // Set up logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await logout();
        } catch (e) {
            window.location.href = '/index.html';
        }
    });

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    // check local storage
    if (localStorage.getItem('theme') === 'light') {
        body.classList.add('light-theme');
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('light-theme');
        const isLight = body.classList.contains('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');

        // Update Chart JS colors
        if (eventChart) {
            eventChart.data.datasets[0].borderColor = isLight ? '#8c52ff' : '#ffffff';
            eventChart.data.datasets[0].backgroundColor = isLight ? 'rgba(140, 82, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)';
            Chart.defaults.color = isLight ? '#2c3e50' : '#fff';
            eventChart.update();
        }
    });

    Chart.defaults.color = body.classList.contains('light-theme') ? '#2c3e50' : '#fff';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    let eventChart;
    let dashboardStats = { total: 0, activos: 0, participantes: 0 };

    // Set up Export CSV 
    document.getElementById('btnExportDashboard').addEventListener('click', () => {
        let csvContent = "Métrica,Valor\n";
        csvContent += `Total de Eventos,${dashboardStats.total}\n`;
        csvContent += `Eventos Activos,${dashboardStats.activos}\n`;
        csvContent += `Total de Participantes,${dashboardStats.participantes}\n`;

        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStr = new Date().toISOString().split('T')[0];

        link.setAttribute("href", url);
        link.setAttribute("download", `estadisticas_sgea_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    async function loadDashboardData() {
        try {
            // Count Eventos Totales
            const { count: totalEventos, error: errTotal } = await supabase.from('eventos').select('*', { count: 'exact', head: true });
            if (errTotal) throw errTotal;
            dashboardStats.total = totalEventos || 0;
            document.getElementById('statTotalEventos').textContent = totalEventos || 0;

            // Count Eventos Activos
            const { count: eventosActivos, error: errAct } = await supabase.from('eventos').select('*', { count: 'exact', head: true }).eq('estado', 'Activo');
            if (errAct) throw errAct;
            dashboardStats.activos = eventosActivos || 0;
            document.getElementById('statEventosActivos').textContent = eventosActivos || 0;

            // Count Participantes Totales
            const { count: participantes, error: errPart } = await supabase.from('participantes').select('*', { count: 'exact', head: true });
            if (errPart) throw errPart;
            dashboardStats.participantes = participantes || 0;
            document.getElementById('statParticipantes').textContent = participantes || 0;

            // Load event data for chart (events per month for current year)
            const { data: eventos, error: errEv } = await supabase.from('eventos').select('fecha');
            if (errEv) throw errEv;

            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const dataCounts = new Array(12).fill(0);

            if (eventos) {
                eventos.forEach(ev => {
                    const date = new Date(ev.fecha);
                    if (!isNaN(date)) {
                        dataCounts[date.getMonth()]++;
                    }
                });
            }

            renderChart(months, dataCounts);

        } catch (e) {
            console.error("No se pudo cargar Supabase real, cargando datos simulados: ", e.message);
            // Mock data for preview when no DB configured
            document.getElementById('statTotalEventos').textContent = "12";
            document.getElementById('statEventosActivos').textContent = "4";
            document.getElementById('statParticipantes').textContent = "158";

            renderChart(
                ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                [2, 4, 3, 5, 2, 8]
            );
        }
    }

    function renderChart(labels, data) {
        const ctx = document.getElementById('eventosChart');
        const isLight = document.body.classList.contains('light-theme');

        eventChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Eventos por Mes',
                    data: data,
                    backgroundColor: isLight ? 'rgba(140, 82, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)',
                    borderColor: isLight ? '#8c52ff' : '#ffffff',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, precision: 0 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    loadDashboardData();
});
