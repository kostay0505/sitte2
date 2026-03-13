import { api } from '@/api/api';
import { User, UserRole } from './models';

export async function getAllUsers(): Promise<User[]> {
    try {
        const response = await api.get<User[]>('/users');
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось загрузить пользователей');
    }
}

export async function getUserById(tgId: string): Promise<User> {
    try {
        const response = await api.get<User>(`/users/${tgId}`);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось загрузить пользователя');
    }
}

export async function updateUser(tgId: string, data: Partial<Omit<User, 'tgId' | 'username'>>): Promise<User> {
    try {
        const response = await api.put<User>(`/users/${tgId}`, data);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось обновить пользователя');
    }
}

export async function activateUser(tgId: string): Promise<void> {
    try {
        await api.post(`/users/${tgId}/activate`);
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось активировать пользователя');
    }
}

export async function deactivateUser(tgId: string): Promise<void> {
    try {
        await api.post(`/users/${tgId}/deactivate`);
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось деактивировать пользователя');
    }
}

export async function banUser(tgId: string): Promise<void> {
    try {
        await api.post(`/users/${tgId}/ban`);
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось заблокировать пользователя');
    }
}

export async function unbanUser(tgId: string): Promise<void> {
    try {
        await api.post(`/users/${tgId}/unban`);
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось разблокировать пользователя');
    }
}

export async function changeUserRole(tgId: string, role: UserRole): Promise<void> {
    try {
        await api.patch(`/users/${tgId}/role`, { role });
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось изменить роль пользователя');
    }
}
