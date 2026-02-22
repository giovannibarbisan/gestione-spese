module.exports = {
  apps : [
    // --- PROCESSO 1: BACKEND SPESE (Node.js) ---
    {
      name: "spese-server",
      cwd: "./server",          // Entra nella cartella server
      script: "index.js",       // Lancia l'entry point
      watch: false,             // Disabilitato per la produzione
      env: {
        NODE_ENV: "production",
        PORT: 5000              // Porta corretta per il Backend Spese
      }
    },
    // --- PROCESSO 2: FRONTEND SPESE (React Build) ---
    {
      name: "spese-client",
      script: "serve",          // Usa il web server di PM2
      env: {
        PM2_SERVE_PATH: './client/dist', // Punta alla build di React
        PM2_SERVE_PORT: 5173,            // Porta corretta per il Frontend Spese
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      }
    }
  ]
}