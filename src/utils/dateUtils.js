
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
      const parts = dateInput.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        // Formatar como ISO: YYYY-MM-DD
        const isoFormatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const parsed = new Date(isoFormatted);
        if (!isNaN(parsed)) return parsed;
      }
    }
    
    // Tentar formato ISO sem timezone
    const simpleDate = new Date(dateInput.split('T')[0]);
    if (!isNaN(simpleDate)) return simpleDate;
  }
  
  // Caso 3: Valor inválido
  console.warn('Formato de data não suportado:', dateInput);
  return null;
};

export const isDateInRange = (date, start, end) => {
  if (!date || isNaN(date)) return false;
  
  // Converter para objetos Date
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  // Ajustar para cobrir o dia inteiro
  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(23, 59, 59, 999);
  
  // Converter para timestamps para comparação
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const checkTime = date.getTime();
  
  return checkTime >= startTime && checkTime <= endTime;
};