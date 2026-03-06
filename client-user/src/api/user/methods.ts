import { api } from '@/api/api';
import type { UserBasic, EditUserDataRequest, UserDataResponse } from './types';
import { pickErrorMessage } from '@/utils/request';

export async function getUserData(): Promise<UserDataResponse> {
  try {
    const response = await api.get(`/users/me`);
    return response.data;
  } catch (error: any) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось получить данные пользователя'),
    );
  }
}

export async function editUser(request: EditUserDataRequest): Promise<boolean> {
  try {
    const response = await api.put<boolean>(`/users`, request);
    return response.data;
  } catch (error: any) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось изменить данные пользователя'),
    );
  }
}

export async function getUserSeller(id: string): Promise<UserBasic> {
  try {
    const response = await api.get(`/users/seller/${id}`);
    return response.data;
  } catch (error: any) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось получить данные продавца'),
    );
  }
}

export async function updateBannerUrl(bannerUrl: string | null): Promise<void> {
  try {
    await api.put('/users', { bannerUrl });
  } catch (error: any) {
    throw new Error(pickErrorMessage(error, 'Не удалось обновить баннер'));
  }
}

export async function mergeAccounts(
  email: string,
  password: string,
): Promise<UserDataResponse> {
  try {
    const response = await api.post<UserDataResponse>(`/users/merge`, {
      email,
      password,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(pickErrorMessage(error, 'Не удалось объединить аккаунты'));
  }
}
