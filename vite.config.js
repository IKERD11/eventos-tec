import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                calendario: resolve(__dirname, 'calendario.html'),
                eventos: resolve(__dirname, 'eventos.html'),
                participantes: resolve(__dirname, 'participantes.html'),
                registro: resolve(__dirname, 'registro.html'),
                usuarios: resolve(__dirname, 'usuarios.html')
            }
        }
    }
});
