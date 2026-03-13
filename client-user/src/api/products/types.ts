import { BrandBasic } from '../brands/types';
import { CategoryBasic } from '../category/types';
import { UserBasic } from '../user/types';

// ===== Enums / Unions =====
export type CurrencyList = 'RUB' | 'USD' | 'EUR';
export type QuantityType = 'piece' | 'set';
export type StatusType = 'moderation' | 'approved' | 'rejected';
export type OrderBy = 'date' | 'price';
export type SortDirection = 'asc' | 'desc';

// ===== Entities =====
export type ProductBasic = {
  id: string;
  name: string;
  slug?: string | null;
  brandSlug?: string | null;
  priceCash: string;
  currency: CurrencyList;
  preview: string;
  description: string;
  isNew: boolean;
  categoryId?: string | null;
  category?: CategoryBasic | null;
  isFavorite: boolean;
  status: StatusType;
  url?: string;
  viewCount?: number;
};

export type Product = {
  id: string;
  name: string;
  slug?: string | null;
  brandSlug?: string | null;
  priceCash: string;
  priceNonCash: string;
  currency: string;
  preview: string;
  files: string[];
  description: string;
  quantity: number;
  quantityType: QuantityType;
  isActive: boolean;
  isDeleted: boolean;
  isNew: boolean;
  isFavorite: boolean;
  category: CategoryBasic;
  brand: BrandBasic;
  user: UserBasic;
  status: StatusType;
  url?: string;
  viewCount?: number;
};

// ===== Requests / Responses =====
export type ProductsBasicInfoResponse = {
  new: ProductBasic[];
  mainSeller: ProductBasic[];
  popular: ProductBasic[];
};

export type ProductsAvailableQuery = {
  brandId?: string | null;
  sellerId?: string | null;
  categoryId?: string | null;
  priceCashFrom?: number | null;
  priceCashTo?: number | null;
  isFavorite?: boolean | null;
  search?: string | null;
  limit?: number;
  offset?: number;
};

export type CreateProductRequest = {
  name: string;
  priceCash: number;
  priceNonCash: number;
  currency: CurrencyList;
  preview: string;
  files: string[];
  description: string;
  categoryId: string;
  brandId: string;
  quantity: number;
  quantityType: QuantityType;
};

export type UpdateProductRequest = CreateProductRequest;

export type DeleteProductRequest = {
  id: string;
};

export type ToggleFavoriteRequest = {
  id: string;
  isFavorite: boolean;
};

export type ViewedProductRequest = {
  id: string;
};

export type ActivateProductRequest = { id: string };
