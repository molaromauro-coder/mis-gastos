const hasEmoji = (value) => /\p{Extended_Pictographic}/u.test(value);
export function categoryBaseName(value) {
  return String(value || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu, '').trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-AR');
}
const emojis = {
  'GASTOS FIJOS':'😩', 'VIANDAS':'🧆', 'JUNTADAS':'🙌🏽', 'SUPERMERCADO':'🛒',
  'KIOSCO':'🍭', 'BEBIDAS':'🍾', 'VINOS':'🍷', 'HOGAR':'🏠', 'FARMACIA':'🏥',
  'SALUD':'🩺', 'CARAMELOS / CHOCOLATES':'🍫', 'CARAMELOS':'🍬', 'CHOCOLATES':'🍫',
  'LUZ':'💡', 'GAS':'🔥', 'EXPENSAS':'🏡', 'SEGURO AUTO':'🚙', 'SEGURO MOTO':'🏍️',
  'SEGURO BICICLETA':'🚲', 'SEGURO BICI':'🚲', 'SEGURO HOGAR':'🏠',
  'IMPUESTOS VARIOS':'🤨', 'IMPUESTOS':'🧾', 'COMIDA FRODO':'🐶',
  'TRANSPORTE':'🚌', 'COMBUSTIBLE':'⛽', 'NAFTA':'⛽', 'COMIDA':'🍽️', 'RESTAURANTES':'🍽️',
  'ROPA':'👕', 'EDUCACION':'📚', 'INTERNET':'🌐', 'TELEFONO':'📱', 'AGUA':'💧',
  'MASCOTAS':'🐾', 'ENTRETENIMIENTO':'🎉', 'VACACIONES':'🏖️', 'DEPORTES':'⚽', 'GIMNASIO':'🏋️',
  'LIMPIEZA':'🧹', 'LIMPIEZA DE HOGAR':'🧹', 'GASEOSAS':'🥤', 'ELECTRODOMESTICOS':'🔌',
  'MUEBLES':'🛋️', 'REPARACIONES':'🔧', 'ADORNOS':'🖼️', 'MEDICAMENTOS':'💊',
  'PERFUMES':'🌸', 'CREMAS':'🧴', 'PSICOLOGO':'🧠', 'PSIQUIATRA':'🧠',
  'OBRA SOCIAL':'🩺', 'TRATAMIENTO PELO':'💇', 'ENTRADAS PERSONALES':'🎟️'
};
// User-entered emoji always win. Ambiguous names (e.g. two SEGURO labels)
// remain distinct, and storage values are never rewritten for decoration.
export function categoryDisplayLabel(value, configured = []) {
  const raw = String(value || '');
  if (!raw || hasEmoji(raw)) return raw;
  const base = categoryBaseName(raw);
  const preferred = [...new Set(configured.filter((name) => hasEmoji(name) && categoryBaseName(name) === base))];
  if (preferred.length === 1) return preferred[0];
  const emoji = emojis[base];
  return emoji ? `${raw} ${emoji}` : raw;
}
