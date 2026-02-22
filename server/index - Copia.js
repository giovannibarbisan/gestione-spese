const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const db = require('./db');
const path = require('path'); // <--- Importa path
// CARICAMENTO SICURO DELLE VARIABILI D'AMBIENTE
// Forza la lettura del file .env che si trova nella stessa cartella di questo file (index.js)
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Debug: Verifichiamo subito se ha letto qualcosa
console.log("--- DEBUG AVVIO ---");
console.log("Variabili caricate da:", path.join(__dirname, '.env'));
console.log("DB_USER:", process.env.DB_USER || "NON TROVATO");
console.log("DB_CONNECT_STRING:", process.env.DB_CONNECT_STRING || "NON TROVATO");
console.log("-------------------");

const app = express();
app.use(cors());
app.use(express.json());

// Avvio DB
//db.initialize();

// 1. API: Ottieni il Bilancio del mese
app.get('/api/bilancio', async (req, res) => {
    const { mese } = req.query; // Formato YYYY-MM
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Usiamo la vista, ma se il mese non esiste ritorniamo 0
        const result = await connection.execute(
            `SELECT * FROM V_BILANCIO_MENSILE WHERE MESE_ANNO = :mese`,
            [mese]
        );
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({ MESE_ANNO: mese, TOTALE_ENTRATE: 0, TOTALE_USCITE: 0, SALDO: 0 });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        if (connection) await connection.close();
    }
});

// 2. API: Ottieni movimenti filtrati (per Pannelli specifici)
app.get('/api/movimenti', async (req, res) => {
    const { mese, tipo, categoria } = req.query; 
    // tipo: 'E' (Entrate) o 'CAT' (Categoria specifica)
    
    let connection;
    try {
        connection = await oracledb.getConnection();
        let query = `
            SELECT m.ID_MOVIMENTO, m.IMPORTO, m.NOTA, m.DATA_MOVIMENTO, c.DESCRIZIONE 
            FROM MOVIMENTI m 
            JOIN CATEGORIE c ON m.ID_CATEGORIA = c.ID_CATEGORIA
            WHERE TO_CHAR(m.DATA_MOVIMENTO, 'YYYY-MM') = :mese
        `;
        
        const params = { mese: mese };

        if (tipo === 'ENTRATE') {
            query += ` AND c.TIPO_MOVIMENTO = 'E'`;
        } else if (tipo === 'CATEGORIA' && categoria) {
            query += ` AND c.DESCRIZIONE = :cat`;
            params.cat = categoria;
        }

        query += ` ORDER BY m.DATA_MOVIMENTO DESC`;

        const result = await connection.execute(query, params);
        
        // Calcolo totale parziale lato server per comodità
        const totale = result.rows.reduce((acc, row) => acc + row.IMPORTO, 0);

        res.json({ movimenti: result.rows, totale });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        if (connection) await connection.close();
    }
});

// 3. API: Inserisci nuovo movimento
app.post('/api/movimenti', async (req, res) => {
    console.log("Dati ricevuti:", req.body); // Debug log

    const { categoria, data, importo, nota } = req.body;
    let connection;
    
    try {
        connection = await oracledb.getConnection();
        
        // 1. Trova ID categoria
        const catResult = await connection.execute(
            `SELECT ID_CATEGORIA FROM CATEGORIE WHERE DESCRIZIONE = :p_desc`,
            { p_desc: categoria } // Rinomina variabile: desc -> p_desc
        );

        if (catResult.rows.length === 0) {
            return res.status(400).json({ error: 'Categoria non trovata' });
        }

        // Gestione minuscole/maiuscole per sicurezza
        const row = catResult.rows[0];
        const idCategoria = row.ID_CATEGORIA || row.id_categoria;

        // 2. Inserimento con nomi variabili SICURI (p_...)
        // Abbiamo cambiato :data in :p_data e :imp in :p_importo per evitare ORA-01745
        await connection.execute(
            `INSERT INTO MOVIMENTI (ID_CATEGORIA, DATA_MOVIMENTO, IMPORTO, NOTA) 
             VALUES (:p_id_cat, TO_DATE(:p_data, 'YYYY-MM-DD'), :p_importo, :p_nota)`,
            {
                p_id_cat: idCategoria,
                p_data: data,           // Associa req.body.data a :p_data
                p_importo: parseFloat(importo), // Associa e converte a numero
                p_nota: nota
            },
            { autoCommit: true } // Importante: Salva le modifiche!
        );

        console.log("Inserimento OK");
        res.json({ success: true });

    } catch (err) {
        console.error("ERRORE SQL:", err); // Vedi l'errore nel terminale
        res.status(500).send(err.message);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
});

// 4. API: Cancella movimento
app.delete('/api/movimenti/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `DELETE FROM MOVIMENTI WHERE ID_MOVIMENTO = :id`,
            [id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        if (connection) await connection.close();
    }
});

// 5. API: Lista Categorie (per la select box di inserimento)
app.get('/api/categorie', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(`SELECT DESCRIZIONE FROM CATEGORIE ORDER BY DESCRIZIONE`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err);
    } finally {
        if (connection) await connection.close();
    }
});

// 6. API: Genera Report SINTETICO
app.post('/api/report', async (req, res) => {
    const { mese } = req.body; 
    let connection;

    try {
        connection = await oracledb.getConnection();
        const sql = `
            SELECT 
                c.DESCRIZIONE,
                CASE WHEN c.TIPO_MOVIMENTO = 'E' THEN 'Entrata' ELSE 'Uscita' END,
                SUM(m.IMPORTO)
            FROM MOVIMENTI m
            JOIN CATEGORIE c ON m.ID_CATEGORIA = c.ID_CATEGORIA
            WHERE TO_CHAR(m.DATA_MOVIMENTO, 'YYYY-MM') = :mese
            GROUP BY c.DESCRIZIONE, c.TIPO_MOVIMENTO
            ORDER BY c.TIPO_MOVIMENTO, c.DESCRIZIONE
        `;
        // Chiediamo a Oracle di darci un Array invece di un Oggetto
        const result = await connection.execute(sql, [mese], { outFormat: oracledb.OUT_FORMAT_ARRAY });
        
        if (result.rows.length === 0) return res.status(404).json({ error: "Nessun dato." });

        const payload = {
            folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
            filename: `Report Sintetico ${mese}`,
            headers: ["Categoria", "Tipo Movimento", "Totale"], // <--- Headers espliciti
            data: result.rows // Ora è un array di array [[Cat, Tipo, 100], ...]
        };

        const googleResponse = await fetch(process.env.GOOGLE_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const googleResult = await googleResponse.json();

        if (googleResult.status === 'success') res.json({ success: true, url: googleResult.url });
        else throw new Error(googleResult.message);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) try { await connection.close(); } catch (e) {}
    }
});

// 7. API: Genera Report DETTAGLIO
app.post('/api/report/detail', async (req, res) => {
    const { mese } = req.body; 
    let connection;

    try {
        connection = await oracledb.getConnection();
        
        // Query fornita (con formattazione data per Excel)
        const sql = `
            SELECT 
                TO_CHAR(M.DATA_MOVIMENTO, 'DD/MM/YYYY'), -- Formattiamo la data per il foglio
                M.IMPORTO, 
                M.NOTA,
                C.DESCRIZIONE,
                CASE
                    WHEN C.TIPO_MOVIMENTO = 'E' THEN 'Entrata'
                    ELSE 'Uscita'
                END
            FROM MOVIMENTI M, CATEGORIE C
            WHERE TO_CHAR(M.DATA_MOVIMENTO, 'YYYY-MM') = :anno_mese
            AND M.ID_CATEGORIA = C.ID_CATEGORIA
            ORDER BY M.DATA_MOVIMENTO
        `;
        
        const result = await connection.execute(sql, [mese], { outFormat: oracledb.OUT_FORMAT_ARRAY });
        
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
    } finally {
        if (connection) try { await connection.close(); } catch (e) {}
    }
});

// Funzione di avvio asincrona
async function startServer() {
    try {
        console.log("Inizializzazione connessione Oracle...");
        // 1. Aspetta che il DB sia pronto
        await db.initialize(); 
        console.log("Connessione DB stabilita con successo.");

        // 2. Definizione delle Rotte API (Incolla qui o assicurati che siano definite sopra)
        // ... (Le tue app.get, app.post rimangono dove sono) ...

        // 3. Avvia il server solo ORA
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error("ERRORE FATALE AVVIO SERVER:", err);
        process.exit(1); // Chiude l'app se il DB non parte, così PM2 prova a riavviarla
    }
}

// Lancia la funzione di avvio
startServer();

//const PORT = process.env.PORT || 5000;
//app.listen(PORT, () => {
//    console.log(`Server running on port ${PORT}`);
//});