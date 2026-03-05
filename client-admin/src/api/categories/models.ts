export interface Category {
    id: string;
    name: string;
    slug?: string;
    parentId?: string;
    displayOrder: number;
    isActive: boolean;
}
