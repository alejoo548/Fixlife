export const SERVICE_NAME_ES: Record<string, string> = {
  'AC Installation & Repair': 'Instalacion y reparacion de A/C',
  'Appliance Repair': 'Reparacion de electrodomesticos',
  'Auto Mechanic': 'Mecanica automotriz',
  Carpentry: 'Carpinteria',
  'Childcare / Babysitting': 'Cuidado de ninos / Ninera',
  'Computer Technician': 'Tecnico de computadoras',
  'Drywall Installation': 'Instalacion de tablaroca',
  'Elderly Care': 'Cuidado de adultos mayores',
  'Electrical Services': 'Servicios electricos',
  Gardening: 'Jardineria',
  'Home Cleaning': 'Limpieza del hogar',
  'House Painting': 'Pintura residencial',
  'Locksmith Services': 'Servicios de cerrajeria',
  Masonry: 'Mamposteria',
  Plumbing: 'Plomeria',
  'Refrigeration Repair': 'Reparacion de refrigeracion',
  'Security Camera Installation': 'Instalacion de camaras de seguridad',
  Welding: 'Soldadura',
};

export const localizeServiceName = (serviceName: string | null | undefined, language: string) => {
  const base = String(serviceName || '').trim();
  if (!base) return '';
  if (!language.startsWith('es')) return base;
  return SERVICE_NAME_ES[base] || base;
};
