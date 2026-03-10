export interface Expense {
  id: number;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  pago?: boolean;
  comprovante?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface User {
  user: string;
  pass: string;
}

export interface Agregado {
  id: number;
  nome: string;
  idade: string;
  habilitacao: string;
  placa: string;
  pix: string;
  telefone: string;
  ciot: string;
  origem: string;
  destino: string;
  valorServico: number;
  valorAgregado: number;
  valorTransportadora: number;
  percentualTransportadora: number;
  percentualAgregado: number;
  dataCadastro: string;
}

export type View = 'dashboard' | 'cadastro' | 'lista' | 'usuarios' | 'agregado';
