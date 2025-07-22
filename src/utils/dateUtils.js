
// utils/dateUtils.js - Verificação dos valores de data para comparação de SKU
export const parseDate = (dateInput) => {
  // Caso 1: Já é um objeto Date válido
  if (dateInput instanceof Date && !isNaN(dateInput)) {
    return dateInput;
  }
  
  // Caso 2: É uma string
  if (typeof dateInput === 'string') {
    // Tentar formato ISO (NuvemShop)
    const isoDate = new Date(dateInput);
    if (!isNaN(isoDate)) return isoDate;
    
    // Tentar formato brasileiro (Tiny)
    if (dateInput.includes('/')) {
      const [day, month, year] = dateInput.split('/');
      const formatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const parsed = new Date(formatted);
      if (!isNaN(parsed)) return parsed;
    }
  }
  
  // Caso 3: É um número (timestamp)
  if (typeof dateInput === 'number') {
    const date = new Date(dateInput);
    if (!isNaN(date)) return date;
  }
  
  // Caso 4: Valor inválido
  console.warn('Formato de data não suportado:', dateInput);
  return new Date(); // Fallback para data atual
};

export const isDateInRange = (date, start, end) => {
  if (!date || isNaN(date)) return false;
  
  // Converter para timestamps para comparação precisa
  const startDate = new Date(start).setHours(0, 0, 0, 0);
  const endDate = new Date(end).setHours(23, 59, 59, 999);
  const checkDate = date.getTime();
  
  return checkDate >= startDate && checkDate <= endDate;
};