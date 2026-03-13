export const QK = {
  products: {
    available: (q: unknown) => ['products', 'available', q] as const,
    byId: (id: string) => ['products', 'byId', id] as const,
    bySlug: (slug: string) => ['products', 'bySlug', slug] as const,
    basicInfo: () => ['products', 'basicInfo'] as const,
    my: () => ['products', 'my'] as const,
  },
  brands: {
    available: () => ['brands', 'available'] as const,
    byId: (id: string) => ['brands', 'by-id', id] as const,
  },
  categories: {
    active: () => ['categories', 'active'] as const,
  },
  users: {
    me: () => ['users', 'me'] as const,
    seller: (id: string) => ['users', 'seller', id] as const,
  },
  cities: {
    available: () => ['cities', 'available'] as const,
  },
  countries: {
    available: () => ['countries', 'available'] as const,
  },
  resumes: {
    available: (q?: unknown) => ['resumes', 'available', q ?? {}] as const,
    my: () => ['resumes', 'my'] as const,
    byId: (id: string) => ['resumes', 'byId', id] as const,
  },
  vacancies: {
    available: (q?: unknown) => ['vacancies', 'available', q ?? {}] as const,
    my: () => ['vacancies', 'my'] as const,
    byId: (id: string) => ['vacancies', 'byId', id] as const,
  },
  jobs: {
    available: (q?: unknown) => ['jobs', 'available', q ?? {}] as const,
    byId: (id: string) => ['jobs', 'byId', id] as const,
  },
};
