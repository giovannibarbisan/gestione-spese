const express = require('express');
const { Pool } = require('pg'); // <-- Importiamo pg (PostgreSQL) invece di oracledb
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log("--- DEBUG AVVIO POSTGRESQL ---");
console.log("Variabili caricate da:", path.join(__dirname, '.env'));
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "TROVATO" : "NON TROVATO");
console.log("-------------------");

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONFIGURAZIONE CONNESSIONE POSTGRESQL (Supabase)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Obbligatorio per i DB in cloud
});

// 1. API: Ottieni il Bilancio del mese
app.get('/api/bilancio', async (req, res) => {
    const { mese } = req.query; // Formato YYYY-MM
    try {
        // Al posto della vista Oracle, usiamo una query diretta e potente.
        // Gli AS "NOME_MAIUSCOLO" servono per non rompere il frontend React.
        const sql = `
            SELECT 
                TO_CHAR(m.data_movimento, 'YYYY-MM') AS "MESE_ANNO",
                COALESCE(SUM(CASE WHEN c.tipo_movimento = 'E' THEN m.importo ELSE 0 END), 0) AS "TOTALE_ENTRATE",
                COALESCE(SUM(CASE WHEN c.tipo_movimento = 'U' THEN m.importo ELSE 0 END), 0) AS "TOTALE_USCITE",
                COALESCE(SUM(CASE WHEN c.tipo_movimento = 'E' THEN m.importo ELSE -m.importo END), 0) AS "SALDO"
            FROM movimenti m
            JOIN categorie c ON m.id_categoria = c.id_categoria
            WHERE TO_CHAR(m.data_movimento, 'YYYY-MM') = $1
            GROUP BY TO_CHAR(m.data_movimento, 'YYYY-MM')
        `;
        
        const result = await pool.query(sql, [mese]);
        
        if (result.rows.length > 0) {
            // Postgres restituisce SUM come stringhe (per precisione), le forziamo a numero
            const r = result.rows[0];
            res.json({
                MESE_ANNO: r.MESE_ANNO,
                TOTALE_ENTRATE: parseFloat(r.TOTALE_ENTRATE),
                TOTALE_USCITE: parseFloat(r.TOTALE_USCITE),
                SALDO: parseFloat(r.SALDO)
            });
        } else {
            res.json({ MESE_ANNO: mese, TOTALE_ENTRATE: 0, TOTALE_USCITE: 0, SALDO: 0 });
        }
    } catch (err) {
        console.error("ERRORE BILANCIO:", err);
        res.status(500).send(err.message);
    }
});

// 2. API: Ottieni movimenti filtrati (per Pannelli specifici)
app.get('/api/movimenti', async (req, res) => {
    const { mese, tipo, categoria } = req.query; 
    
    try {
        let query = `
            SELECT m.id_movimento AS "ID_MOVIMENTO", m.importo AS "IMPORTO", 
                   m.nota AS "NOTA", m.data_movimento AS "DATA_MOVIMENTO", 
                   c.descrizione AS "DESCRIZIONE" 
            FROM movimenti m 
            JOIN categorie c ON m.id_categoria = c.id_categoria
            WHERE TO_CHAR(m.data_movimento, 'YYYY-MM') = $1
        `;
        
        const params = [mese];
        let paramIndex = 2; // Indice dinamico per le variabili $1, $2, $3

        if (tipo === 'ENTRATE') {
            query += ` AND c.tipo_movimento = 'E'`;
        } else if (tipo === 'CATEGORIA' && categoria) {
            query += ` AND c.descrizione = $${paramIndex}`;
            params.push(categoria);
            paramIndex++;
        }

        query += ` ORDER BY m.data_movimento DESC, m.id_movimento DESC`;

        const result = await pool.query(query, params);
        
        // Postgres restituisce NUMERIC come stringa, forziamo il parseFloat
        const movimenti = result.rows.map(r => ({ ...r, IMPORTO: parseFloat(r.IMPORTO) }));
        const totale = movimenti.reduce((acc, row) => acc + row.IMPORTO, 0);

        res.json({ movimenti: movimenti, totale });
    } catch (err) {
        console.error("ERRORE GET MOVIMENTI:", err);
        res.status(500).send(err.message);
    }
});

// 3. API: Inserisci nuovo movimento
app.post('/api/movimenti', async (req, res) => {
    const { categoria, data, importo, nota } = req.body;
    
    try {
        // 1. Trova ID categoria
        const catResult = await pool.query(
            `SELECT id_categoria FROM categorie WHERE descrizione = $1`,
            [categoria]
        );

        if (catResult.rows.length === 0) {
            return res.status(400).json({ error: 'Categoria non trovata' });
        }

        const idCategoria = catResult.rows[0].id_categoria;

        // 2. Inserimento (in Postgres le date ISO funzionano direttamente, non serve TO_DATE)
        await pool.query(
            `INSERT INTO movimenti (id_categoria, data_movimento, importo, nota) 
             VALUES ($1, $2, $3, $4)`,
            [idCategoria, data, parseFloat(importo), nota]
        );

        console.log("Inserimento OK");
        res.json({ success: true });

    } catch (err) {
        console.error("ERRORE SQL INSERT:", err);
        res.status(500).send(err.message);
    }
});

// 4. API: Cancella movimento
app.delete('/api/movimenti/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM movimenti WHERE id_movimento = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERRORE DELETE:", err);
        res.status(500).send(err.message);
    }
});

// 5. API: Lista Categorie (per la select box di inserimento)
app.get('/api/categorie', async (req, res) => {
    try {
        const result = await pool.query(`SELECT descrizione AS "DESCRIZIONE" FROM categorie ORDER BY descrizione`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 6. API: Genera Report SINTETICO
app.post('/api/report', async (req, res) => {
    const { mese } = req.body; 

    try {
        const sql = `
            SELECT 
                c.descrizione,
                CASE WHEN c.tipo_movimento = 'E' THEN 'Entrata' ELSE 'Uscita' END,
                SUM(m.importo)
            FROM movimenti m
            JOIN categorie c ON m.id_categoria = c.id_categoria
            WHERE TO_CHAR(m.data_movimento, 'YYYY-MM') = $1
            GROUP BY c.descrizione, c.tipo_movimento
            ORDER BY c.tipo_movimento, c.descrizione
        `;
        // In Postgres rowMode: 'array' è l'equivalente di oracledb.OUT_FORMAT_ARRAY
        const result = await pool.query({ text: sql, values: [mese], rowMode: 'array' });
        
        if (result.rows.length === 0) return res.status(404).json({ error: "Nessun dato." });

        const payload = {
            folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
            filename: `Report Sintetico ${mese}`,
            headers: ["Categoria", "Tipo Movimento", "Totale"],
            data: result.rows
        };

        const googleResponse = await fetch(process.env.GOOGLE_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const googleResult = await googleResponse.json();

        if (googleResult.status === 'success') res.json({ success: true, url: googleResult.url });
        else throw new Error(googleResult.message);

    } catch (err) {
        console.error("ERRORE REPORT SINT:", err);
        res.status(500).json({ error: err.message });
    }
});

// 7. API: Genera Report DETTAGLIO
app.post('/api/report/detail', async (req, res) => {
    const { mese } = req.body; 

    try {
        const sql = `
            SELECT 
                TO_CHAR(m.data_movimento, 'DD/MM/YYYY'),
                m.importo, 
                COALESCE(m.nota, ''), -- Postgres gestisce meglio i null così
                c.descrizione,
                CASE WHEN c.tipo_movimento = 'E' THEN 'Entrata' ELSE 'Uscita' END
            FROM movimenti m
            JOIN categorie c ON m.id_categoria = c.id_categoria
            WHERE TO_CHAR(m.data_movimento, 'YYYY-MM') = $1
            ORDER BY m.data_movimento
        `;
        
        const result = await pool.query({ text: sql, values: [mese], rowMode: 'array' });
        
        if (result.rows.length === 0) return res.status(404).json({ error: "Nessun movimento trovato." });

        const payload = {
            folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
            filename: `Report Dettaglio ${mese}`,
            headers: ["Data Movimento", "Importo", "Nota", "Descrizione", "Tipo Movimento"],
            data: result.rows
        };

        const googleResponse = await fetch(process.env.GOOGLE_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const googleResult = await googleResponse.json();

        if (googleResult.status === 'success') res.json({ success: true, url: googleResult.url });
        else throw new Error(googleResult.message);

    } catch (err) {
        console.error("ERRORE REPORT DETT:", err);
        res.status(500).json({ error: err.message });
    }
});

// Funzione di avvio asincrona (adattata per Postgres)
async function startServer() {
    try {
        console.log("Inizializzazione connessione Supabase PostgreSQL...");
        
        // Verifica la connessione prima di lanciare Express
        const client = await pool.connect();
        console.log("Connessione DB stabilita con successo.");
        client.release(); // Libera il client

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server Spese in esecuzione sulla porta ${PORT}`);
        });

    } catch (err) {
        console.error("ERRORE FATALE AVVIO SERVER:", err);
        process.exit(1); 
    }
}

startServer();