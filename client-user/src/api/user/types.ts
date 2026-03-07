import { City } from '../cities/types';

export type UserDataResponse = {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: City;
  country: string;
  subscribedToNewsletter: boolean;
  photoUrl: string | null;
  bannerUrl: string | null;
  emailVerified: boolean;
  role?: 'user' | 'shop' | 'admin';
  url?: string;
};

export type UserBasic = {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: City | null;
  photoUrl: string | null;
  bannerUrl?: string | null;
  role?: 'user' | 'shop' | 'admin';
  url?: string;
};

export type EditUserDataRequest = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  cityId: string | null;
  subscribedToNewsletter: boolean;
  photoUrl?: string | null;
};
