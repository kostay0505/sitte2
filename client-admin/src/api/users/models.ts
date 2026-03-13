export type UserRole = 'user' | 'shop' | 'admin';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
    user: 'Пользователь',
    shop: 'Магазин',
    admin: 'Админ',
};

export interface User {
    tgId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    email: string | null;
    phone: string | null;
    cityId: string | null;
    subscribedToNewsletter: boolean;
    isActive: boolean;
    isBanned: boolean;
    role: UserRole;
    city?: {
        id: string;
        name: string;
        country: {
            id: string;
            name: string;
        } | null;
    } | null;
}
