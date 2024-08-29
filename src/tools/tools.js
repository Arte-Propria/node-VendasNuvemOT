let baseId = 1000000; // Começa a partir de um milhão
let lastTimestamp = Date.now();
let sequence = 0;

export function generateNumericId() {
  const now = Date.now();
  if (now === lastTimestamp) {
    sequence += 1;
  } else {
    sequence = 0;
    lastTimestamp = now;
  }
  // Usando apenas os últimos 7 dígitos do timestamp para garantir que o valor seja menor
  const shortTimestamp = parseInt(now.toString().slice(-7));
  return baseId + shortTimestamp + sequence;
}