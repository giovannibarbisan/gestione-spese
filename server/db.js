const oracledb = require('oracledb');
require('dotenv').config();

// Abilita l'auto-commit per semplicità in questo contesto, 
// in produzione si gestirebbe la transazione manualmente.
oracledb.autoCommit = true; 

// Configurazione per output JSON e nomi colonne in minuscolo (più facili per il frontend)
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function initialize() {
  await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 2,
    poolAlias: 'default' // <--- AGGIUNGI QUESTA RIGA PER SICUREZZA
  });
  console.log('Oracle Connection Pool started.');
}

async function close() {
  await oracledb.getPool().close(10);
  console.log('Oracle Connection Pool closed.');
}

module.exports = { initialize, close };