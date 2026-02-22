import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, PlusCircle, Wallet, TrendingUp, TrendingDown, FileSpreadsheet, FileText, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

//const API_URL = 'http://192.168.178.33:5000/api';
// --- CONFIGURAZIONE DINAMICA ---
// Se siamo su localhost usa localhost, se siamo su IP (es. dal Mac) usa l'IP
//const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
const API_URL = "https://gestione-spese-api.onrender.com/api";

// Lista dei pannelli richiesti
const PANELS = [
  { id: 'dashboard', label: 'Bilancio' },
  { id: 'entrate', label: 'Entrate', type: 'ENTRATE' },
  { id: 'negozi', label: 'Negozi Vari', type: 'CATEGORIA', cat: 'Negozi Vari' },
  { id: 'ccr', label: 'Ricariche CCR', type: 'CATEGORIA', cat: 'Ricariche CCR' },
  { id: 'divertimento', label: 'Divertimento', type: 'CATEGORIA', cat: 'Divertimento' },
  { id: 'macchina', label: 'Macchina', type: 'CATEGORIA', cat: 'Macchina' },
  { id: 'fisse', label: 'Fisse', type: 'CATEGORIA', cat: 'Fisse' },
  { id: 'extra', label: 'Extra', type: 'CATEGORIA', cat: 'Extra' },
  { id: 'utenze', label: 'Utenze', type: 'CATEGORIA', cat: 'Utenze' },
  { id: 'medici', label: 'Visite/Esami medici', type: 'CATEGORIA', cat: 'Visite/Esami medici' },
];

// --- UTILITY FUNCTIONS ---

// 1. Formattatore Valuta (es. "1.250,50 €")
const formatCurrency = (value) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(value);
};

// 2. Formattatore Data (es. "15 feb 2026")
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // --- NUOVI STATI PER IL LOGIN ---
  const [isAuth, setIsAuth] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [refreshKey, setRefreshKey] = useState(0); // Per forzare il ricaricamento dati
  const triggerRefresh = () => setRefreshKey(old => old + 1);
  
  // All'avvio, controlla se il telefono ha già memorizzato la password
  useEffect(() => {
      const savedPass = localStorage.getItem('appPassword');
      if (savedPass) {
          axios.defaults.headers.common['x-app-password'] = savedPass;
          setIsAuth(true);
      }
      setLoadingAuth(false);
  }, []);
  
  // Gestione del click sul pulsante "Entra"
  const handleLogin = async (e) => {
      e.preventDefault();
      try {
          await axios.post(`${API_URL}/login`, { password: passwordInput });
          // Se corretta, la salva nel telefono
          localStorage.setItem('appPassword', passwordInput);
          axios.defaults.headers.common['x-app-password'] = passwordInput;
          setIsAuth(true);
          toast.success("Accesso effettuato!");
      } catch (error) {
          toast.error("Password errata!");
      }
  };
  
  // Gestione del Logout (opzionale)
  const handleLogout = () => {
      localStorage.removeItem('appPassword');
      delete axios.defaults.headers.common['x-app-password'];
      setIsAuth(false);
  };

    // --- (Qui sotto tieni tutto il tuo codice esistente: loadData, handleExport, ecc.) ---

  // Se sta ancora caricando, non mostrare nulla
  if (loadingAuth) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Caricamento...</div>;
  
  // Se non è autorizzato, mostra SOLO la schermata di login
  if (!isAuth) {
      return (
          <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4">
              <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-sm text-center">
                  <h2 className="text-2xl font-bold mb-6 text-gray-800">Gestione Casa</h2>
                  <form onSubmit={handleLogin} className="flex flex-col gap-4">
                      <input 
                          type="password" 
                          placeholder="Inserisci la password" 
                          className="border p-3 rounded bg-gray-50 text-center text-lg focus:outline-none focus:border-blue-500"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                      />
                      <button type="submit" className="bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 transition-colors shadow-md">
                          Entra
                      </button>
                  </form>
              </div>
          </div>
      );
  }
  
  // Se è autorizzato, mostra la tua app normale!
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <Toaster position="top-center" reverseOrder={false} /> {/* <--- AGGIUNGI QUI */}
      {/* Header */}
      <header className="bg-blue-900 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet /> Gestione Spese
          </h1>
          
          <div className="flex items-center gap-3">
            {/* Selettore Mese */}
            <input 
              type="month" 
              value={currentMonth} 
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-blue-800 text-white border border-blue-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            {/* Pulsanti Report */}
            <ReportButton month={currentMonth} />      {/* Sintetico (Verde) */}
            <DetailReportButton month={currentMonth} /> {/* Dettaglio (Indaco) */}
          </div>

        </div>

      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto mt-8 p-4">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
          {PANELS.map(panel => (
            <button
              key={panel.id}
              onClick={() => setActiveTab(panel.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === panel.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        {/* Dynamic Content */}
        {activeTab === 'dashboard' ? (
          <DashboardPanel month={currentMonth} refreshKey={refreshKey} />
        ) : (
          <ListPanel 
            config={PANELS.find(p => p.id === activeTab)} 
            month={currentMonth} 
            refreshKey={refreshKey}
            onChange={triggerRefresh}
          />
        )}

        {/* Global Add Button */}
        <AddTransactionForm onAdd={triggerRefresh} />
        
      </main>
    </div>
  );
}

// --- Componente: Pannello Bilancio (Dashboard) ---
function DashboardPanel({ month, refreshKey }) {
  const [data, setData] = useState({ TOTALE_ENTRATE: 0, TOTALE_USCITE: 0, SALDO: 0 });

  useEffect(() => {
    axios.get(`${API_URL}/bilancio?mese=${month}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  }, [month, refreshKey]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatCard 
        label="Bilancio Attuale" 
        value={data.SALDO} 
        color={data.SALDO >= 0 ? "text-green-600" : "text-red-600"} 
        icon={<Wallet size={24}/>}
      />
      <StatCard 
        label="Entrate Totali" 
        value={data.TOTALE_ENTRATE} 
        color="text-blue-600" 
        icon={<TrendingUp size={24}/>}
      />
      <StatCard 
        label="Uscite Totali" 
        value={data.TOTALE_USCITE} 
        color="text-red-500" 
        icon={<TrendingDown size={24}/>}
      />
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm uppercase tracking-wide">{label}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>
          {formatCurrency(value)} {/* <--- MODIFICATO */}
        </p>
      </div>
      <div className={`p-3 rounded-full bg-gray-50 ${color}`}>{icon}</div>
    </div>
  );
}

// --- Componente: Liste Specifiche (Entrate o Categorie) ---
// --- Componente: Liste Specifiche ---
function ListPanel({ config, month, refreshKey, onChange }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const params = { mese: month, tipo: config.type, categoria: config.cat };
    axios.get(`${API_URL}/movimenti`, { params })
      .then(res => {
        setItems(res.data.movimenti);
        setTotal(res.data.totale);
      })
      .catch(err => console.error(err));
  }, [config, month, refreshKey]);

  // 1. Funzione che esegue la cancellazione vera e propria (chiamata dal tasto "Sì")
  const confirmDelete = (id) => {
    const loadingToast = toast.loading("Cancellazione in corso...");
    
    axios.delete(`${API_URL}/movimenti/${id}`)
      .then(() => {
        toast.success("Voce eliminata!", { id: loadingToast });
        onChange(); // Aggiorna la lista
      })
      .catch(err => {
        toast.error("Errore cancellazione", { id: loadingToast });
      });
  };

  // 2. Funzione che mostra il Toast di conferma personalizzato
  const handleDelete = (id) => {
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[200px]">
        <div className="font-medium text-gray-800 text-center">
          Eliminare questa riga?
        </div>
        <div className="flex gap-3 justify-center">
          {/* Pulsante ANNULLA */}
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors border border-gray-200"
          >
            No
          </button>
          
          {/* Pulsante CONFERMA (Rosso) */}
          <button
            onClick={() => {
              toast.dismiss(t.id); // Chiude il toast di domanda
              confirmDelete(id);   // Esegue l'azione
            }}
            className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors shadow-sm"
          >
            Sì, elimina
          </button>
        </div>
      </div>
    ), {
      duration: Infinity, // Non sparisce da solo, aspetta il click
      position: 'top-center',
      style: {
        border: '1px solid #e5e7eb',
        padding: '16px',
        background: '#fff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        borderRadius: '12px'
      },
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">{config.label}</h2>
        <div className="text-lg font-semibold">
            Totale: <span className={config.type === 'ENTRATE' ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(total)}
            </span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3">Data</th>
              <th className="px-6 py-3">Nota</th>
              <th className="px-6 py-3 text-right">Importo</th>
              <th className="px-6 py-3 text-center">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-400">Nessun movimento trovato</td></tr>
            ) : (
              items.map(item => (
                <tr key={item.ID_MOVIMENTO} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(item.DATA_MOVIMENTO)}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-800">{item.NOTA || '-'}</td>
                  <td className={`px-6 py-4 text-right font-bold ${config.type === 'ENTRATE' ? 'text-green-600' : 'text-gray-800'}`}>
                    {formatCurrency(item.IMPORTO)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => handleDelete(item.ID_MOVIMENTO)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-all active:scale-95"
                      title="Elimina riga"
                    >
                      <X size={20} strokeWidth={2.5} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Componente: Modulo Inserimento ---
function AddTransactionForm({ onAdd }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    categoria: '',
    importo: '',
    nota: '',
    data: new Date().toISOString().slice(0, 10)
  });

  useEffect(() => {
    axios.get(`${API_URL}/categorie`).then(res => setCategories(res.data));
  }, []);

  const handleSubmit = (e) => {
      e.preventDefault();
      if (!form.categoria || !form.importo) {
          toast.error("Compila tutti i campi obbligatori!"); // <--- TOAST ERRORE
          return;
      }
  
      // Creiamo un 'toast di caricamento' che si aggiorna quando finisce
      const loadingToast = toast.loading('Salvataggio in corso...');
  
      axios.post(`${API_URL}/movimenti`, form)
        .then(() => {
          toast.success("Movimento salvato con successo!", { id: loadingToast }); // <--- TOAST SUCCESSO
          
          // Reset del form intelligente (mantiene la data odierna)
          setForm({ ...form, importo: '', nota: '' }); 
          onAdd();
        })
        .catch(err => {
          toast.error("Errore salvataggio: " + err.message, { id: loadingToast }); // <--- TOAST ERRORE
        });
    };

  return (
    <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-6">
      <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
        <PlusCircle size={20}/> Aggiungi Nuovo Movimento
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Data</label>
            <input 
                type="date" 
                className="w-full border rounded p-2"
                value={form.data}
                onChange={e => setForm({...form, data: e.target.value})}
            />
        </div>
        <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Categoria</label>
            <select 
                className="w-full border rounded p-2 bg-white"
                value={form.categoria}
                onChange={e => setForm({...form, categoria: e.target.value})}
            >
                <option value="">Seleziona...</option>
                {categories.map(c => (
                    <option key={c.DESCRIZIONE} value={c.DESCRIZIONE}>{c.DESCRIZIONE}</option>
                ))}
            </select>
        </div>
        <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Importo (€)</label>
            <input 
                type="number" step="0.01" 
                className="w-full border rounded p-2"
                placeholder="0.00"
                value={form.importo}
                onChange={e => setForm({...form, importo: e.target.value})}
            />
        </div>
        <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Nota</label>
            <input 
                type="text" 
                className="w-full border rounded p-2"
                placeholder="Dettaglio spesa..."
                value={form.nota}
                onChange={e => setForm({...form, nota: e.target.value})}
            />
        </div>
        <button 
            type="submit" 
            className="bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors h-10"
        >
            Salva
        </button>
      </form>
    </div>
  );
}

// --- Componente: Pulsante Report Google Drive ---
function ReportButton({ month }) {
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    if (!month) return;
    
    setLoading(true);
    const toastId = toast.loading("Generazione Report Drive in corso...");

    try {
      const response = await axios.post(`${API_URL}/report`, { mese: month });
      
      if (response.data.success) {
        toast.success("Report creato su Drive!", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.error || "Errore generazione report";
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerateReport}
      disabled={loading}
      className={`
        flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors
        ${loading 
          ? 'bg-blue-800 text-blue-300 cursor-not-allowed' 
          : 'bg-green-600 hover:bg-green-700 text-white shadow-md'}
      `}
      title="Esporta mese su Google Drive"
    >
      <FileSpreadsheet size={18} />
      {loading ? 'Attendi...' : 'Report sint.'}
    </button>
  );
}

// --- Componente: Pulsante Report Dettaglio ---
function DetailReportButton({ month }) {
  const [loading, setLoading] = useState(false);

  const handleGenerateDetail = async () => {
    if (!month) return;
    
    setLoading(true);
    const toastId = toast.loading("Generazione Report Dettagliato...");

    try {
      // Notare l'URL diverso: /api/report/detail
      const response = await axios.post(`${API_URL}/report/detail`, { mese: month });
      
      if (response.data.success) {
        toast.success("Report Dettagliato creato!", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.error || "Errore generazione report";
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerateDetail}
      disabled={loading}
      className={`
        flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors
        ${loading 
          ? 'bg-blue-800 text-blue-300 cursor-not-allowed' 
          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'} 
      `} 
      // Ho usato Indigo invece di Green per distinguerlo visivamente
      title="Elenco completo movimenti su Google Drive"
    >
      <FileText size={18} />
      {loading ? 'Attendi...' : 'Report dett.'}
    </button>
  );
}

export default App;