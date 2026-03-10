import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  List, 
  Users, 
  FileSpreadsheet, 
  Download, 
  Trash2, 
  LogOut, 
  Search,
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  Filter,
  AlertCircle,
  FileText,
  Loader2,
  Camera,
  Truck,
  MapPin,
  Phone,
  CreditCard,
  Hash,
  CheckCircle2,
  XCircle,
  Paperclip,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";
import { Expense, User, View, Agregado } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export default function App() {
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });

  // App State
  const [view, setView] = useState<View>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [agregados, setAgregados] = useState<Agregado[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [filterDates, setFilterDates] = useState({
    inicio: '',
    fim: ''
  });

  // Form State
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria: '',
    valor: 0
  });
  const [newUser, setNewUser] = useState({ user: '', pass: '' });
  const [newAgregado, setNewAgregado] = useState<Partial<Agregado>>({
    nome: '',
    idade: '',
    habilitacao: '',
    placa: '',
    pix: '',
    telefone: '',
    ciot: '',
    origem: '',
    destino: '',
    valorServico: 0,
    valorAgregado: 0,
    valorTransportadora: 0,
    percentualTransportadora: 70,
    percentualAgregado: 30
  });

  const socketRef = useRef<WebSocket | null>(null);
  const isRemoteUpdate = useRef(false);

  // Initialize Data & WebSocket
  useEffect(() => {
    // WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      isRemoteUpdate.current = true;
      switch (message.type) {
        case 'INIT':
          setExpenses(message.expenses || []);
          setAgregados(message.agregados || []);
          setUsers(message.users || []);
          setDbConnected(true);
          break;
        case 'EXPENSES_UPDATED':
          setExpenses(message.payload);
          break;
        case 'AGREGADOS_UPDATED':
          setAgregados(message.payload);
          break;
        case 'USERS_UPDATED':
          setUsers(message.payload);
          break;
      }
      // Reset flag after state updates have been processed
      setTimeout(() => {
        isRemoteUpdate.current = false;
      }, 100);
    };

    socket.onopen = () => setDbConnected(true);
    socket.onclose = () => setDbConnected(false);

    // Set default filter dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    setFilterDates({ inicio: firstDay, fim: lastDay });

    // Auto-login if token exists
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsLoggedIn(true);
          setCurrentUser(data.user);
        } else {
          localStorage.removeItem('token');
        }
      })
      .catch(() => localStorage.removeItem('token'));
    }

    return () => socket.close();
  }, []);

  // Sync state to server
  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && dbConnected && !isRemoteUpdate.current && isLoggedIn) {
      const token = localStorage.getItem('token');
      socketRef.current.send(JSON.stringify({ type: 'UPDATE_EXPENSES', payload: expenses, token }));
    }
  }, [expenses, dbConnected, isLoggedIn]);

  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && dbConnected && !isRemoteUpdate.current && isLoggedIn) {
      const token = localStorage.getItem('token');
      socketRef.current.send(JSON.stringify({ type: 'UPDATE_AGREGADOS', payload: agregados, token }));
    }
  }, [agregados, dbConnected, isLoggedIn]);

  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && dbConnected && !isRemoteUpdate.current && isLoggedIn) {
      const token = localStorage.getItem('token');
      socketRef.current.send(JSON.stringify({ type: 'UPDATE_USERS', payload: users, token }));
    }
  }, [users, dbConnected, isLoggedIn]);

  // Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro na resposta do servidor:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          alert(errorData.message || 'Erro no servidor');
        } catch (e) {
          alert('Erro no servidor (Resposta não-JSON)');
        }
        return;
      }

      const data = await response.json();
      if (data.success) {
        setIsLoggedIn(true);
        setCurrentUser(data.user);
        localStorage.setItem('token', data.token);
      } else {
        alert(data.message || 'Usuário ou senha inválidos');
      }
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      alert('Erro ao conectar com o servidor');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setIsRegistering(false);
    setCurrentUser(null);
    setLoginForm({ user: '', pass: '' });
    localStorage.removeItem('token');
  };

  const handleNewRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.user || !loginForm.pass) {
      alert('Preencha todos os campos');
      return;
    }
    if (users.find(u => u.user === loginForm.user)) {
      alert('Usuário já existe');
      return;
    }
    setUsers(prev => [...prev, { user: loginForm.user, pass: loginForm.pass }]);
    setIsRegistering(false);
    alert('Usuário cadastrado com sucesso! Agora você pode entrar.');
  };

  const handleAiExtraction = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAiLoading(true);
    const results: Expense[] = [];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              {
                text: "Analise este comprovante de pagamento e extraia os dados. Retorne apenas um objeto JSON com os campos: data (no formato YYYY-MM-DD), descricao, categoria e valor (como número)."
              },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
                }
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                data: { type: Type.STRING },
                descricao: { type: Type.STRING },
                categoria: { type: Type.STRING },
                valor: { type: Type.NUMBER }
              },
              required: ["data", "descricao", "categoria", "valor"]
            }
          }
        });

        const result = JSON.parse(response.text);
        results.push({
          id: Date.now() + Math.random(),
          data: result.data,
          descricao: result.descricao,
          categoria: result.categoria,
          valor: result.valor
        });
      }

      if (results.length > 1) {
        setExpenses(prev => [...prev, ...results]);
        alert(`${results.length} despesas processadas e adicionadas com sucesso!`);
      } else if (results.length === 1) {
        const result = results[0];
        setNewExpense({
          data: result.data,
          descricao: result.descricao,
          categoria: result.categoria,
          valor: result.valor
        });
        alert('Dados extraídos com sucesso pela IA!');
      }
    } catch (error) {
      console.error('Erro na extração IA:', error);
      alert('Houve um erro ao processar um ou mais arquivos. Verifique os formatos e tente novamente.');
    } finally {
      setIsAiLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const parseBarcode = (code: string) => {
    const cleanCode = code.replace(/[^0-9]/g, '');
    if (cleanCode.length < 44) return;

    let valor = 0;
    let dataVencimento = '';

    if (cleanCode.length === 47) {
      // Boleto Bancário
      const valorCents = cleanCode.substring(37);
      valor = parseInt(valorCents) / 100;
      
      const fatorVencimento = parseInt(cleanCode.substring(33, 37));
      if (fatorVencimento > 0) {
        const baseDate = new Date('1997-10-07');
        baseDate.setDate(baseDate.getDate() + fatorVencimento);
        dataVencimento = baseDate.toISOString().split('T')[0];
      }
    } else if (cleanCode.length === 48) {
      // Convênio / Arrecadação
      const valorCents = cleanCode.substring(4, 15);
      valor = parseInt(valorCents) / 100;
    }

    if (valor > 0) {
      setNewExpense(prev => ({
        ...prev,
        valor,
        data: dataVencimento || prev.data,
        descricao: prev.descricao || 'Pagamento Fornecedor'
      }));
    }
  };

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcode(val);
    if (val.replace(/[^0-9]/g, '').length >= 44) {
      parseBarcode(val);
    }
  };

  const saveAgregado = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgregado.nome || !newAgregado.placa || !newAgregado.origem || !newAgregado.destino) {
      alert('Por favor, preencha os campos obrigatórios (Nome, Placa, Origem e Destino).');
      return;
    }

    const agregado: Agregado = {
      id: Date.now(),
      nome: newAgregado.nome || '',
      idade: newAgregado.idade || '',
      habilitacao: newAgregado.habilitacao || '',
      placa: newAgregado.placa || '',
      pix: newAgregado.pix || '',
      telefone: newAgregado.telefone || '',
      ciot: newAgregado.ciot || '',
      origem: newAgregado.origem || '',
      destino: newAgregado.destino || '',
      valorServico: newAgregado.valorServico || 0,
      valorAgregado: newAgregado.valorAgregado || 0,
      valorTransportadora: newAgregado.valorTransportadora || 0,
      percentualTransportadora: newAgregado.percentualTransportadora || 0,
      percentualAgregado: newAgregado.percentualAgregado || 0,
      dataCadastro: new Date().toISOString()
    };

    setAgregados(prev => [agregado, ...prev]);
    
    // Automatically create an expense for the driver
    const expense: Expense = {
      id: Date.now() + 1, // Ensure unique ID
      data: new Date().toISOString().split('T')[0],
      descricao: `Pagamento Agregado: ${agregado.nome} (${agregado.origem} -> ${agregado.destino})`,
      categoria: 'Frete',
      valor: agregado.valorAgregado,
      pago: false
    };
    setExpenses(prev => [expense, ...prev]);

    setNewAgregado({
      nome: '',
      idade: '',
      habilitacao: '',
      placa: '',
      pix: '',
      telefone: '',
      ciot: '',
      origem: '',
      destino: '',
      valorServico: 0,
      valorAgregado: 0,
      valorTransportadora: 0,
      percentualTransportadora: 70,
      percentualAgregado: 30
    });
    alert('Agregado cadastrado com sucesso!');
  };

  const saveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.data || !newExpense.descricao || !newExpense.categoria || !newExpense.valor) {
      alert('Preencha todos os campos');
      return;
    }
    const expense: Expense = {
      id: Date.now(),
      data: newExpense.data as string,
      descricao: newExpense.descricao as string,
      categoria: newExpense.categoria as string,
      valor: Number(newExpense.valor),
      pago: false
    };
    setExpenses(prev => [...prev, expense]);
    setNewExpense({
      data: new Date().toISOString().split('T')[0],
      descricao: '',
      categoria: '',
      valor: 0
    });
    setBarcode('');
    alert('Despesa cadastrada com sucesso!');
  };

  const deleteExpense = (id: number) => {
    if (confirm('Deseja excluir esta despesa?')) {
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
  };

  const togglePaid = (id: number) => {
    const now = new Date().toLocaleString('pt-BR');
    setExpenses(prev => prev.map(e => e.id === id ? { 
      ...e, 
      pago: !e.pago,
      lastModifiedBy: currentUser || 'Desconhecido',
      lastModifiedAt: now
    } : e));
  };

  const handleAttachComprovante = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      setExpenses(prev => prev.map(exp => exp.id === id ? { ...exp, comprovante: base64 } : exp));
    };
    reader.readAsDataURL(file);
  };

  const clearAllExpenses = () => {
    if (confirm('Apagar todas as despesas? Esta ação não pode ser desfeita.')) {
      setExpenses([]);
    }
  };

  const registerUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.user || !newUser.pass) return;
    setUsers(prev => [...prev, newUser]);
    setNewUser({ user: '', pass: '' });
  };

  // Excel Logic
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(expenses);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Despesas");
    XLSX.writeFile(wb, "despesas_gfsystems.xlsx");
  };

  const downloadTemplate = () => {
    const template = [{ data: '2026-01-01', descricao: 'Exemplo', categoria: 'Marketing', valor: 100 }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_importacao.xlsx");
  };

  const downloadAgregadoTemplate = () => {
    const template = [{
      nome: 'João Silva',
      idade: '35',
      habilitacao: '12345678900',
      placa: 'ABC1D23',
      pix: 'joao@email.com',
      telefone: '11999998888',
      ciot: '12345678',
      origem: 'São Paulo',
      destino: 'Rio de Janeiro',
      valorServico: 1000
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Agregado");
    XLSX.writeFile(wb, "modelo_agregado.xlsx");
  };

  const importAgregadoExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const imported = data.map(item => {
        const valorServico = Number(item.valorServico) || 0;
        const valorAgregado = Number((valorServico * 0.3).toFixed(2));
        const valorTransportadora = Number((valorServico * 0.7).toFixed(2));
        
        const agregado: Agregado = {
          id: Date.now() + Math.random(),
          nome: String(item.nome || ''),
          idade: String(item.idade || ''),
          habilitacao: String(item.habilitacao || ''),
          placa: String(item.placa || ''),
          pix: String(item.pix || ''),
          telefone: String(item.telefone || ''),
          ciot: String(item.ciot || ''),
          origem: String(item.origem || ''),
          destino: String(item.destino || ''),
          valorServico,
          valorAgregado,
          valorTransportadora,
          percentualTransportadora: 70,
          percentualAgregado: 30,
          dataCadastro: new Date().toISOString()
        };

        // Automatically create expense for each imported driver
        const expense: Expense = {
          id: Date.now() + Math.random() + 1,
          data: new Date().toISOString().split('T')[0],
          descricao: `Pagamento Agregado: ${agregado.nome} (${agregado.origem} -> ${agregado.destino})`,
          categoria: 'Frete',
          valor: agregado.valorAgregado,
          pago: false
        };
        
        setExpenses(prev => [expense, ...prev]);
        return agregado;
      });

      setAgregados(prev => [...imported, ...prev]);
      alert(`${imported.length} motoristas importados com sucesso!`);
    };
    reader.readAsBinaryString(file);
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const imported = data.map(item => ({
        id: Date.now() + Math.random(),
        data: item.data || new Date().toISOString().split('T')[0],
        descricao: item.descricao || 'Importado',
        categoria: item.categoria || 'Geral',
        valor: Number(item.valor) || 0
      }));

      setExpenses(prev => [...prev, ...imported]);
    };
    reader.readAsBinaryString(file);
  };

  // Dashboard Calculations
  const dashboardData = useMemo(() => {
    const filtered = expenses.filter(e => 
      (!filterDates.inicio || e.data >= filterDates.inicio) && 
      (!filterDates.fim || e.data <= filterDates.fim)
    );

    const total = expenses.reduce((acc, curr) => acc + curr.valor, 0);
    const periodTotal = filtered.reduce((acc, curr) => acc + curr.valor, 0);
    const count = expenses.length;
    const avg = count > 0 ? total / count : 0;
    const max = count > 0 ? Math.max(...expenses.map(e => e.valor)) : 0;

    const categoriesMap: Record<string, number> = {};
    expenses.forEach(e => {
      categoriesMap[e.categoria] = (categoriesMap[e.categoria] || 0) + e.valor;
    });

    const chartData = Object.entries(categoriesMap).map(([name, value]) => ({ name, value }));

    return { total, periodTotal, count, avg, max, chartData, categoriesMap };
  }, [expenses, filterDates]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-8 pt-12 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20">
              <DollarSign className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">GFSystems</h1>
            <p className="text-slate-500 mb-8">
              {isRegistering ? 'Crie sua conta para começar' : 'BI Financeiro - Entre para continuar'}
            </p>
            
            <form onSubmit={isRegistering ? handleNewRegistration : handleLogin} className="space-y-4">
              <div className="text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Usuário</label>
                <input 
                  type="text" 
                  value={loginForm.user}
                  onChange={e => setLoginForm(prev => ({ ...prev, user: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="admin"
                  required
                />
              </div>
              <div className="text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Senha</label>
                <input 
                  type="password" 
                  value={loginForm.pass}
                  onChange={e => setLoginForm(prev => ({ ...prev, pass: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] mt-4"
              >
                {isRegistering ? 'Cadastrar' : 'Entrar no Sistema'}
              </button>
            </form>

            <div className="mt-6">
              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {isRegistering ? 'Já tem uma conta? Entre aqui' : 'Não tem uma conta? Cadastre-se'}
              </button>
            </div>
          </div>
          <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
            <p className="text-xs text-slate-400">© 2026 GFSystems - Todos os direitos reservados</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">GFSystems</span>
        </div>

        <div className="px-6 mb-2">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
            dbConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", dbConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            {dbConnected ? "Supabase Conectado" : "Desconectado"}
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <button 
            onClick={() => setView('dashboard')}
            className={cn("sidebar-item w-full", view === 'dashboard' && "active")}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setView('agregado')}
            className={cn("sidebar-item w-full", view === 'agregado' && "active")}
          >
            <Truck size={20} />
            Agregado Motorista
          </button>
          <button 
            onClick={() => setView('cadastro')}
            className={cn("sidebar-item w-full", view === 'cadastro' && "active")}
          >
            <PlusCircle size={20} />
            Cadastrar
          </button>
          <button 
            onClick={() => setView('lista')}
            className={cn("sidebar-item w-full", view === 'lista' && "active")}
          >
            <List size={20} />
            Despesas
          </button>
          <button 
            onClick={() => setView('usuarios')}
            className={cn("sidebar-item w-full", view === 'usuarios' && "active")}
          >
            <Users size={20} />
            Usuários
          </button>

          <div className="pt-8 pb-2">
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ferramentas</p>
          </div>
          
          <button onClick={exportExcel} className="sidebar-item w-full">
            <FileSpreadsheet size={20} />
            Exportar Excel
          </button>
          <button onClick={downloadTemplate} className="sidebar-item w-full">
            <Download size={20} />
            Baixar Modelo
          </button>
          <button onClick={clearAllExpenses} className="sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <Trash2 size={20} />
            Limpar Tudo
          </button>
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
              {currentUser?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{currentUser}</p>
              <p className="text-[10px] text-slate-500 uppercase">Administrador</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Visão Geral</h2>
                  <p className="text-slate-500">Acompanhe o desempenho financeiro em tempo real.</p>
                </div>
                
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex flex-col px-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Início</span>
                    <input 
                      type="date" 
                      value={filterDates.inicio}
                      onChange={e => setFilterDates(prev => ({ ...prev, inicio: e.target.value }))}
                      className="text-sm font-medium outline-none bg-transparent"
                    />
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="flex flex-col px-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Fim</span>
                    <input 
                      type="date" 
                      value={filterDates.fim}
                      onChange={e => setFilterDates(prev => ({ ...prev, fim: e.target.value }))}
                      className="text-sm font-medium outline-none bg-transparent"
                    />
                  </div>
                  <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                    <Filter size={20} />
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="glass-panel p-6">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                    <DollarSign size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Geral</p>
                  <h3 className="text-2xl font-bold mt-1 text-slate-900">R$ {formatCurrency(dashboardData.total)}</h3>
                </div>

                <div className="glass-panel p-6">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
                    <TrendingUp size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Período</p>
                  <h3 className="text-2xl font-bold mt-1 text-slate-900">R$ {formatCurrency(dashboardData.periodTotal)}</h3>
                </div>

                <div className="glass-panel p-6">
                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-4">
                    <List size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantidade</p>
                  <h3 className="text-2xl font-bold mt-1 text-slate-900">{dashboardData.count}</h3>
                </div>

                <div className="glass-panel p-6">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 mb-4">
                    <PieChartIcon size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Média</p>
                  <h3 className="text-2xl font-bold mt-1 text-slate-900">R$ {formatCurrency(dashboardData.avg)}</h3>
                </div>

                <div className="glass-panel p-6">
                  <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 mb-4">
                    <AlertCircle size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maior Gasto</p>
                  <h3 className="text-2xl font-bold mt-1 text-slate-900">R$ {formatCurrency(dashboardData.max)}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="lg:col-span-2 glass-panel p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="font-bold text-lg">Gastos por Categoria</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <div className="w-3 h-3 bg-blue-600 rounded-full" />
                      Valor Total (R$)
                    </div>
                  </div>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboardData.chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ 
                            backgroundColor: '#fff', 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
                          }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                          {dashboardData.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Table */}
                <div className="glass-panel p-8 overflow-hidden">
                  <h4 className="font-bold text-lg mb-6">Resumo Detalhado</h4>
                  <div className="space-y-4">
                    {Object.entries(dashboardData.categoriesMap).map(([cat, val], idx) => (
                      <div key={cat} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-2 h-8 rounded-full" 
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }} 
                          />
                          <div>
                            <p className="font-bold text-sm text-slate-900">{cat}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Categoria</p>
                          </div>
                        </div>
                        <p className="font-bold text-slate-900">R$ {formatCurrency(val as number)}</p>
                      </div>
                    ))}
                    {Object.keys(dashboardData.categoriesMap).length === 0 && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="text-slate-300" />
                        </div>
                        <p className="text-slate-400 text-sm">Nenhum dado disponível</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'agregado' && (
            <motion.div
              key="agregado"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="glass-panel p-10">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">Agregado Motorista</h2>
                    <p className="text-slate-500">Cadastre motoristas e informações de frete agregado.</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={downloadAgregadoTemplate}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all border border-slate-200"
                    >
                      <Download size={14} />
                      Modelo Excel
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs cursor-pointer hover:bg-emerald-100 transition-all border border-emerald-100">
                      <FileSpreadsheet size={14} />
                      Importar Excel
                      <input type="file" className="hidden" onChange={importAgregadoExcel} accept=".xlsx, .xls" />
                    </label>
                  </div>
                </div>

                <form onSubmit={saveAgregado} className="space-y-8">
                  {/* Driver Info Section */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <Users className="text-blue-600 w-5 h-5" />
                      <h3 className="font-bold text-slate-800">Informações do Motorista</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nome Completo</label>
                        <input 
                          type="text" 
                          value={newAgregado.nome}
                          onChange={e => setNewAgregado(prev => ({ ...prev, nome: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Nome do motorista"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Idade</label>
                        <input 
                          type="number" 
                          value={newAgregado.idade}
                          onChange={e => setNewAgregado(prev => ({ ...prev, idade: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Ex: 35"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nº Habilitação (CNH)</label>
                        <input 
                          type="text" 
                          value={newAgregado.habilitacao}
                          onChange={e => setNewAgregado(prev => ({ ...prev, habilitacao: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="00000000000"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Placa do Veículo</label>
                        <input 
                          type="text" 
                          value={newAgregado.placa}
                          onChange={e => setNewAgregado(prev => ({ ...prev, placa: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="ABC-1234"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Chave PIX</label>
                        <input 
                          type="text" 
                          value={newAgregado.pix}
                          onChange={e => setNewAgregado(prev => ({ ...prev, pix: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="CPF, E-mail ou Celular"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Telefone</label>
                        <input 
                          type="text" 
                          value={newAgregado.telefone}
                          onChange={e => setNewAgregado(prev => ({ ...prev, telefone: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Número do CIOT</label>
                        <input 
                          type="text" 
                          value={newAgregado.ciot}
                          onChange={e => setNewAgregado(prev => ({ ...prev, ciot: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="000000000000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Freight Info Section */}
                  <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <Truck className="text-blue-600 w-5 h-5" />
                      <h3 className="font-bold text-slate-800">Informações do Frete</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Origem</label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input 
                            type="text" 
                            value={newAgregado.origem}
                            onChange={e => setNewAgregado(prev => ({ ...prev, origem: e.target.value }))}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Cidade de origem"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Destino</label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input 
                            type="text" 
                            value={newAgregado.destino}
                            onChange={e => setNewAgregado(prev => ({ ...prev, destino: e.target.value }))}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Cidade de destino"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Valor de Serviço (R$)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input 
                            type="number" 
                            step="0.01"
                            value={newAgregado.valorServico || ''}
                            onChange={e => {
                              const val = Number(e.target.value);
                              const pTransp = newAgregado.percentualTransportadora || 0;
                              const pAgreg = newAgregado.percentualAgregado || 0;
                              setNewAgregado(prev => ({ 
                                ...prev, 
                                valorServico: val, 
                                valorTransportadora: Number((val * (pTransp / 100)).toFixed(2)),
                                valorAgregado: Number((val * (pAgreg / 100)).toFixed(2))
                              }));
                            }}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Valor Transportadora Isa's (R$)</label>
                        <div className="relative">
                          <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input 
                            type="number" 
                            step="0.01"
                            value={newAgregado.valorTransportadora || ''}
                            onChange={e => {
                              const val = Number(e.target.value);
                              const servico = newAgregado.valorServico || 0;
                              let agregado = Number((servico - val).toFixed(2));
                              let pAgreg = servico > 0 ? (agregado / servico) * 100 : 0;
                              
                              if (pAgreg > 30) {
                                pAgreg = 30;
                                agregado = Number((servico * 0.3).toFixed(2));
                                const newVal = Number((servico - agregado).toFixed(2));
                                setNewAgregado(prev => ({ 
                                  ...prev, 
                                  valorTransportadora: newVal,
                                  valorAgregado: agregado,
                                  percentualAgregado: 30,
                                  percentualTransportadora: 70
                                }));
                              } else {
                                setNewAgregado(prev => ({ 
                                  ...prev, 
                                  valorTransportadora: val,
                                  valorAgregado: agregado,
                                  percentualAgregado: Number(pAgreg.toFixed(2)),
                                  percentualTransportadora: Number((100 - pAgreg).toFixed(2))
                                }));
                              }
                            }}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Valor Agregado (R$)</label>
                        <div className="relative">
                          <PlusCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input 
                            type="number" 
                            step="0.01"
                            value={newAgregado.valorAgregado || ''}
                            onChange={e => {
                              let val = Number(e.target.value);
                              const servico = newAgregado.valorServico || 0;
                              let pAgreg = servico > 0 ? (val / servico) * 100 : 0;

                              if (pAgreg > 30) {
                                pAgreg = 30;
                                val = Number((servico * 0.3).toFixed(2));
                              }

                              const transportadora = Number((servico - val).toFixed(2));
                              setNewAgregado(prev => ({ 
                                ...prev, 
                                valorAgregado: val,
                                valorTransportadora: transportadora,
                                percentualAgregado: Number(pAgreg.toFixed(2)),
                                percentualTransportadora: Number((100 - pAgreg).toFixed(2))
                              }));
                            }}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="0,00"
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Percentual Agregado:</span>
                          <input 
                            type="number"
                            max="30"
                            value={newAgregado.percentualAgregado || ''}
                            onChange={e => {
                              let p = Number(e.target.value);
                              if (p > 30) p = 30;
                              const servico = newAgregado.valorServico || 0;
                              const pTransp = 100 - p;
                              setNewAgregado(prev => ({
                                ...prev,
                                percentualAgregado: p,
                                percentualTransportadora: pTransp,
                                valorAgregado: Number((servico * (p / 100)).toFixed(2)),
                                valorTransportadora: Number((servico * (pTransp / 100)).toFixed(2))
                              }));
                            }}
                            className="w-16 text-[10px] font-bold text-blue-600 bg-transparent border-b border-blue-200 focus:border-blue-500 outline-none text-center"
                          />
                          <span className="text-[10px] font-bold text-slate-400">% (Máx 30%)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button 
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <PlusCircle size={20} />
                      Cadastrar Agregado
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {view === 'cadastro' && (
            <motion.div
              key="cadastro"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl mx-auto"
            >
              <div className="glass-panel p-10">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">Nova Despesa</h2>
                    <p className="text-slate-500">Registre os detalhes da sua movimentação financeira.</p>
                  </div>
                  
                  <label className={cn(
                    "flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm cursor-pointer hover:bg-blue-100 transition-all shadow-sm border border-blue-100",
                    isAiLoading && "opacity-50 cursor-not-allowed"
                  )}>
                    {isAiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    {isAiLoading ? 'Processando Lote...' : 'Anexar Comprovantes (Lote)'}
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={handleAiExtraction} 
                      accept="image/*,application/pdf"
                      disabled={isAiLoading}
                      multiple
                    />
                  </label>
                </div>

                <form onSubmit={saveExpense} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Código de Barras / Linha Digitável (Fornecedores)</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={barcode}
                        onChange={handleBarcodeChange}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-12"
                        placeholder="Insira o código para preenchimento automático"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                        <Search size={18} />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1 italic">Cole a linha digitável do boleto para extrair valor e data automaticamente.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Data</label>
                      <input 
                        type="date" 
                        value={newExpense.data}
                        onChange={e => setNewExpense(prev => ({ ...prev, data: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Valor (R$)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newExpense.valor || ''}
                        onChange={e => setNewExpense(prev => ({ ...prev, valor: Number(e.target.value) }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Descrição</label>
                    <input 
                      type="text" 
                      value={newExpense.descricao}
                      onChange={e => setNewExpense(prev => ({ ...prev, descricao: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Ex: Aluguel Escritório"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Categoria</label>
                    <input 
                      type="text" 
                      value={newExpense.categoria}
                      onChange={e => setNewExpense(prev => ({ ...prev, categoria: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Ex: Infraestrutura"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
                  >
                    <PlusCircle size={20} />
                    Salvar Despesa
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {view === 'lista' && (
            <motion.div
              key="lista"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Listagem de Despesas</h2>
                  <p className="text-slate-500">Gerencie e visualize todo o seu histórico financeiro.</p>
                </div>
                
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                    <FileSpreadsheet size={18} className="text-emerald-600" />
                    Importar Excel
                    <input type="file" className="hidden" onChange={importExcel} accept=".xlsx, .xls" />
                  </label>
                </div>
              </div>

              <div className="glass-panel overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-bottom border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Categoria</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Valor</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.length > 0 ? (
                      expenses.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-sm font-medium text-slate-600">
                            {new Date(e.data).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{e.descricao}</td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded-full tracking-wider">
                              {e.categoria}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                            R$ {formatCurrency(e.valor)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <button 
                                onClick={() => togglePaid(e.id)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 mx-auto",
                                  e.pago 
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                                    : "bg-rose-50 text-rose-600 border border-rose-100"
                                )}
                              >
                                {e.pago ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                {e.pago ? 'Pago' : 'Pendente'}
                              </button>
                              {e.lastModifiedBy && (
                                <span className="text-[8px] text-slate-400 font-medium whitespace-nowrap">
                                  Por: {e.lastModifiedBy} em {e.lastModifiedAt}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {e.comprovante ? (
                                <button 
                                  onClick={() => {
                                    const win = window.open();
                                    win?.document.write(`<iframe src="${e.comprovante}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  }}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Ver Comprovante"
                                >
                                  <Eye size={18} />
                                </button>
                              ) : (
                                <label className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer">
                                  <Paperclip size={18} />
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(evt) => handleAttachComprovante(e.id, evt)}
                                    accept="image/*,application/pdf"
                                  />
                                </label>
                              )}
                              <button 
                                onClick={() => deleteExpense(e.id)}
                                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <div className="max-w-xs mx-auto">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Search className="text-slate-300" />
                            </div>
                            <h5 className="font-bold text-slate-900 mb-1">Nenhuma despesa encontrada</h5>
                            <p className="text-slate-400 text-sm">Comece cadastrando uma nova despesa ou importando um arquivo Excel.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {view === 'usuarios' && (
            <motion.div
              key="usuarios"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-panel p-8">
                  <h3 className="text-xl font-bold mb-6">Novo Usuário</h3>
                  <form onSubmit={registerUser} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nome de Usuário</label>
                      <input 
                        type="text" 
                        value={newUser.user}
                        onChange={e => setNewUser(prev => ({ ...prev, user: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Ex: joao.silva"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Senha</label>
                      <input 
                        type="password" 
                        value={newUser.pass}
                        onChange={e => setNewUser(prev => ({ ...prev, pass: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="••••••"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] mt-2"
                    >
                      Cadastrar Usuário
                    </button>
                  </form>
                </div>

                <div className="glass-panel p-8">
                  <h3 className="text-xl font-bold mb-6">Usuários do Sistema</h3>
                  <div className="space-y-3">
                    {users.map((u, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-blue-600">
                            {u.user.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{u.user}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Membro Ativo</p>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase rounded-full">
                          Online
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
