export const PAYMENT_METHODS=['Efectivo','Débito','Crédito'];

export function normalizedPaymentMethod(value){
  return PAYMENT_METHODS.includes(value)?value:'Sin definir';
}

export function needsPaymentMethod(item){
  return normalizedPaymentMethod(item?.method)==='Sin definir';
}

export function needsPaymentCard(item){
  const method=normalizedPaymentMethod(item?.method);
  return ['Débito','Crédito'].includes(method)&&!String(item?.card||'').trim();
}

export function needsPaymentInstallments(item){
  return normalizedPaymentMethod(item?.method)==='Crédito'&&item?.installmentsSpecified===false;
}
