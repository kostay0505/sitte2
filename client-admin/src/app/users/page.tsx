'use client';

import { useState, useEffect } from 'react';
import { getAllUsers, updateUser, activateUser, deactivateUser, banUser, unbanUser, changeUserRole } from '@/api/users/methods';
import { getAllCities } from '@/api/cities/methods';
import { User, UserRole, USER_ROLE_LABELS } from '@/api/users/models';
import { City } from '@/api/cities/models';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/FormField/FormField';
import { COLORS, SPACING } from '@/constants/ui';
import { useNotification } from '@/hooks/useNotification';
import { Notification } from '@/components/ui/Notification/Notification';
import { AdminForm, FormField } from '@/components/AdminForm/AdminForm';
import { usePageTitle } from '@/components/AuthWrapper';
import { AdminTable } from '@/components/AdminTable/AdminTable';
import { TableColumn, LoadingState } from '@/types/common';
import { uploadFile } from '@/api/files/methods';
import { apiUrl } from '@/api/api';
import Image from 'next/image';

function UserPhoto({ photoUrl }: { photoUrl: string | null }) {
    if (!photoUrl) {
        return <span>Нет фото</span>;
    }

    const isTelegramUrl = photoUrl.startsWith('https://t.me/i/userpic');
    const imageSrc = isTelegramUrl ? photoUrl : `${apiUrl}/files/${photoUrl}`;

    return (
			<img
				src={imageSrc}
				alt="Фото пользователя"
				width={60}
				height={60}
				style={{ borderRadius: '50%', objectFit: 'cover' }}
			/>
		);
}

const getUserFormFields = (cities: City[]): FormField[] => [
    {
        name: 'firstName',
        label: 'Имя',
        type: 'text',
        required: false,
        placeholder: 'Введите имя пользователя'
    },
    {
        name: 'lastName',
        label: 'Фамилия',
        type: 'text',
        required: false,
        placeholder: 'Введите фамилию пользователя'
    },
    {
        name: 'photoUrl',
        label: 'Фото',
        type: 'file',
        accept: 'image/*',
        required: false,
        helpText: 'Загрузите фото пользователя (до 1000х1000, до 1мб, формат .webp)'
    },
    {
        name: 'email',
        label: 'Email',
        type: 'text',
        required: false,
        placeholder: 'Введите email пользователя'
    },
    {
        name: 'phone',
        label: 'Телефон',
        type: 'text',
        required: false,
        placeholder: 'Введите телефон пользователя'
    },
    {
        name: 'subscribedToNewsletter',
        label: 'Подписка на рассылку',
        type: 'checkbox',
        required: false
    },
    {
        name: 'cityId',
        label: 'Город',
        type: 'select',
        required: false,
        placeholder: 'Выберите город',
        options: cities.map(city => ({
            value: city.id,
            label: city.name + (city.country ? ` (${city.country.name})` : '')
        }))
    }
];

export default function UsersPage() {
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({
        isLoading: true,
        error: null
    });

    // Поиск
    const [search, setSearch] = useState('');

    // Модальные окна
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { notification, showNotification } = useNotification();
    const { setPageTitle } = usePageTitle();

    useEffect(() => {
        setPageTitle('Управление пользователями');
    }, [setPageTitle]);

    // Загрузка данных
    const loadData = async () => {
        try {
            setLoadingState({ isLoading: true, error: null });
            const [usersResponse, citiesResponse] = await Promise.all([
                getAllUsers(),
                getAllCities()
            ]);
            setAllUsers(usersResponse);
            setCities(citiesResponse);
        } catch (err: any) {
            const errorMessage = err.message || 'Не удалось загрузить данные';
            setLoadingState({ isLoading: false, error: errorMessage });
            showNotification({
                message: errorMessage,
                type: 'error'
            });
        } finally {
            setLoadingState({ isLoading: false, error: null });
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Фильтрация пользователей по поиску
    useEffect(() => {
        if (!search.trim()) {
            setUsers(allUsers);
            return;
        }

        const searchLower = search.toLowerCase();
        const filteredUsers = allUsers.filter(user =>
            user.tgId?.toString().includes(searchLower) ||
            user.username?.toLowerCase().includes(searchLower)
        );
        setUsers(filteredUsers);
    }, [allUsers, search]);

    // Обработчики
    const handleEdit = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const handleSaveUser = async (userData: any) => {
        if (!editingUser) return;

        setIsSubmitting(true);
        try {
            let processedData = { ...userData };

            if (userData.photoUrl && userData.photoUrl instanceof File) {
                const formData = new FormData();
                formData.append('file', userData.photoUrl);
                const result = await uploadFile(formData);
                processedData.photoUrl = result.filename;
            } else if (userData.photoUrl === '') {
                processedData.photoUrl = null;
            }

            await updateUser(editingUser.tgId, processedData);
            showNotification({
                message: 'Пользователь успешно обновлен',
                type: 'success'
            });
            await loadData();
            closeModal();
        } catch (err: any) {
            console.error('Ошибка при сохранении пользователя:', err);
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleActive = async (user: User) => {
        try {
            if (user.isActive) {
                await deactivateUser(user.tgId);
                showNotification({
                    message: 'Пользователь деактивирован',
                    type: 'success'
                });
            } else {
                await activateUser(user.tgId);
                showNotification({
                    message: 'Пользователь активирован',
                    type: 'success'
                });
            }
            await loadData();
        } catch (err: any) {
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        }
    };

    const handleChangeRole = async (user: User, role: UserRole) => {
        try {
            await changeUserRole(user.tgId, role);
            showNotification({
                message: `Роль изменена на «${USER_ROLE_LABELS[role]}»`,
                type: 'success'
            });
            await loadData();
        } catch (err: any) {
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        }
    };

    const handleToggleBan = async (user: User) => {
        try {
            if (user.isBanned) {
                await unbanUser(user.tgId);
                showNotification({
                    message: 'Пользователь разблокирован',
                    type: 'success'
                });
            } else {
                await banUser(user.tgId);
                showNotification({
                    message: 'Пользователь заблокирован',
                    type: 'success'
                });
            }
            await loadData();
        } catch (err: any) {
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        }
    };

    // Подготовка данных для формы
    const getFormInitialData = () => {
        if (!editingUser) return {};

        return {
            firstName: editingUser.firstName,
            lastName: editingUser.lastName,
            photoUrl: editingUser.photoUrl,
            email: editingUser.email,
            phone: editingUser.phone,
            subscribedToNewsletter: Boolean(editingUser.subscribedToNewsletter),
            cityId: editingUser.city?.id || editingUser.cityId || ''
        };
    };

    // Колонки таблицы
    const columns: TableColumn<User>[] = [
        {
            key: 'photoUrl',
            title: 'Фото',
            width: '80px',
            render: (value) => <UserPhoto photoUrl={value} />
        },
        {
            key: 'tgId',
            title: 'ID Telegram',
            width: '150px'
        },
        {
            key: 'username',
            title: 'Username',
            width: '150px',
            render: (value) => value || '-'
        },
        {
            key: 'firstName',
            title: 'Имя',
            width: '150px',
            render: (value) => value || '-'
        },
        {
            key: 'email',
            title: 'Email',
            width: '200px',
            render: (value) => value || '-'
        },
        {
            key: 'phone',
            title: 'Телефон',
            width: '150px',
            render: (value) => value || '-'
        },
        {
            key: 'city',
            title: 'Город',
            width: '200px',
            render: (value) => value ? value.name + (value.country ? ` (${value.country.name})` : '') : '-'
        },
        {
            key: 'role',
            title: 'Роль',
            width: '160px',
            render: (value, item) => (
                <select
                    value={item.role ?? 'user'}
                    onChange={(e) => handleChangeRole(item, e.target.value as UserRole)}
                    style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        cursor: 'pointer',
                        background: 'white',
                    }}
                >
                    {(Object.entries(USER_ROLE_LABELS) as [UserRole, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                    ))}
                </select>
            )
        },
        {
            key: 'isActive',
            title: 'Статус',
            width: '120px',
            render: (value) => (
                <span style={{
                    color: value ? COLORS.SUCCESS.DARK : COLORS.ERROR.DARK
                }}>
                    {value ? 'Активен' : 'Неактивен'}
                </span>
            )
        },
        {
            key: 'isBanned',
            title: 'Бан',
            width: '100px',
            render: (value) => (
                <span style={{
                    color: value ? COLORS.ERROR.DARK : COLORS.SUCCESS.DARK
                }}>
                    {value ? 'Заблокирован' : 'Активен'}
                </span>
            )
        },
        {
            key: 'actions',
            title: 'Действия',
            width: '200px',
            render: (value, item) => (
                <div style={{
                    display: 'flex',
                    gap: SPACING.SM,
                    justifyContent: 'flex-end'
                }}>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(item)}
                    >
                        Редактировать
                    </Button>
                    <Button
                        variant={item.isBanned ? "primary" : "danger"}
                        size="sm"
                        onClick={() => handleToggleBan(item)}
                    >
                        {item.isBanned ? 'Разблокировать' : 'Заблокировать'}
                    </Button>
                    {/* <Button
                        variant={item.isActive ? "danger" : "primary"}
                        size="sm"
                        onClick={() => handleToggleActive(item)}
                    >
                        {item.isActive ? 'Деактивировать' : 'Активировать'}
                    </Button> */}
                </div>
            )
        }
    ];

    return (
        <>
            {/* Поиск */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: SPACING.XL
            }}>
                <Input
                    name="search"
                    placeholder="Поиск по ID Telegram или username..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '300px' }}
                />
            </div>

            <AdminTable<User>
                title="Управление пользователями"
                data={users}
                columns={columns}
                loadingState={loadingState}
                entityName="пользователей"
                emptyMessage={search ? 'Пользователи не найдены' : 'Нет пользователей'}
                onRefresh={loadData}
                itemsPerPage={10}
            />

            {/* Модальное окно с формой */}
            <AdminForm
                title="Редактировать пользователя"
                isOpen={isModalOpen}
                onClose={closeModal}
                onSubmit={handleSaveUser}
                fields={getUserFormFields(cities)}
                initialData={getFormInitialData()}
                isSubmitting={isSubmitting}
                submitButtonText="Сохранить"
            />

            {/* Уведомления */}
            {notification && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onClose={notification.onClose}
                />
            )}
        </>
    );
}
