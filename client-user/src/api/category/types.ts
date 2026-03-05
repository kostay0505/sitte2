export type CategoryBasic = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type ActiveCategoriesResponse = Category[];
