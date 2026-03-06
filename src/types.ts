export interface NavItemType {
  name: string;
  items?: string[];
  href?: string;
}

export type AuthMode = 'signin' | 'signup';

export interface NavbarProps {
  navItems: NavItemType[];
  onOpenAuth: (mode: AuthMode) => void;
  onStartBooking: () => void;
  onOpenProfile: () => void;
}

export interface HeroSliderProps {
  onStartBooking: () => void;
}

export interface ServiceRequestData {
  category: string;
  description: string;
  location: string;
  price: string;
  images: string[];
}

export interface User {
  id: number;
  name: string;
  email: string;
}
