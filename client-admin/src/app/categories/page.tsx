'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllCategories, createCategory, updateCategory } from '@/api/categories/methods';
import { Category } from '@/api/categories/models';
import { Button } from '@/components/ui/Button/Button';
import { COLORS } from '@/constants/ui';
import { useNotification } from '@/hooks/useNotification';
import { Notification } from '@/components/ui/Notification/Notification';
import { AdminForm, FormField } from '@/components/AdminForm/AdminForm';
import { usePageTitle } from '@/components/AuthWrapper';
import { AdminTable } from '@/components/AdminTable/AdminTable';
import { TableColumn, LoadingState } from '@/types/common';

const getCategoryFormFields = (categories: Category[], editingCategory: Category | null): FormField[] => [
    {
        name: 'name',
        label: 'Название',
        type: 'text',
        required: true,
        placeholder: 'Введите название категории'
    },
    {
        name: 'slug',
        label: 'URL-слаг (slug)',
        type: 'text',
        required: false,
        placeholder: 'например: zvukovoe-oborudovanie'
    },
    {
        name: 'parentId',
        label: 'Родительская категория',
        type: 'select',
        required: false,
        placeholder: 'Выберите родительскую категорию',
        options: categories
            .filter(cat => !cat.parentId && (!editingCategory || cat.id !== editingCategory.id))
            .map(cat => ({
                value: cat.id,
                label: cat.name
            }))
    },
    {
        name: 'displayOrder',
        label: 'Порядок отображения',
        type: 'number',
        required: true,
        placeholder: 'Введите порядок отображения'
    },
    {
        name: 'isActive',
        label: 'Активна',
        type: 'checkbox',
        required: false
    }
];

// Компонент фильтра по родительской категории
const CategoryFilter = ({
    categories,
    selectedParentId,
    onFilterChange
}: {
    categories: Category[];
    selectedParentId: string;
    onFilterChange: (parentId: string) => void;
}) => {
    const parentCategories = categories.filter(cat => !cat.parentId);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
        }}>
            <label style={{
                fontWeight: '500',
                color: '#495057',
                minWidth: 'fit-content'
            }}>
                Фильтр по родительской категории:
            </label>
            <select
                value={selectedParentId}
                onChange={(e) => onFilterChange(e.target.value)}
                style={{
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    minWidth: '200px',
                    backgroundColor: 'white'
                }}
            >
                <option value="">Все категории</option>
                {parentCategories.map(category => (
                    <option key={category.id} value={category.id}>
                        {category.name}
                    </option>
                ))}
            </select>
            {selectedParentId && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFilterChange('')}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                    Сбросить
                </Button>
            )}
        </div>
    );
};

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({
        isLoading: true,
        error: null
    });

    // Состояние фильтрации
    const [selectedParentId, setSelectedParentId] = useState<string>('');

    // Модальные окна
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { notification, showNotification } = useNotification();
    const { setPageTitle } = usePageTitle();

    useEffect(() => {
        setPageTitle('Управление категориями');
    }, [setPageTitle]);

    // Фильтрация данных
    const filteredCategories = useMemo(() => {
        if (!selectedParentId) {
            return categories;
        }
        return categories.filter(category => category.parentId === selectedParentId);
    }, [categories, selectedParentId]);

    // Загрузка данных
    const loadCategories = async () => {
        try {
            setLoadingState({ isLoading: true, error: null });
            const response = await getAllCategories();
            setCategories(response);
        } catch (err: any) {
            const errorMessage = err.message || 'Не удалось загрузить категории';
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
        loadCategories();
    }, []);

    // Обработчики
    const handleCreate = () => {
        setEditingCategory(null);
        setIsModalOpen(true);
    };

    const handleEdit = (category: Category) => {
        setEditingCategory(category);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCategory(null);
    };

    const handleSaveCategory = async (categoryData: any) => {
        setIsSubmitting(true);

        try {
            if (editingCategory) {
                await updateCategory(editingCategory.id, categoryData);
                showNotification({
                    message: 'Категория успешно обновлена',
                    type: 'success'
                });
            } else {
                await createCategory(categoryData);
                showNotification({
                    message: 'Категория успешно создана',
                    type: 'success'
                });
            }

            await loadCategories();
            closeModal();
        } catch (err: any) {
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Обработчик изменения фильтра
    const handleFilterChange = (parentId: string) => {
        setSelectedParentId(parentId);
    };

    // Подготовка данных для формы
    const getFormInitialData = () => {
        if (!editingCategory) {
            return {
                name: '',
                parentId: '',
                displayOrder: 0,
                isActive: true,
            slug: ''
            };
        }

        return {
            name: editingCategory.name,
            parentId: editingCategory.parentId || '',
            displayOrder: editingCategory.displayOrder,
            isActive: Boolean(editingCategory.isActive),
            slug: editingCategory.slug || ''
        };
    };

    // Получение имени родительской категории
    const getParentCategoryName = (parentId: string | undefined) => {
        if (!parentId) return '-';
        const parent = categories.find(c => c.id === parentId);
        return parent ? parent.name : 'Не найдена';
    };

    // Колонки таблицы
    const columns: TableColumn<Category>[] = [
        {
            key: 'name',
            title: 'Название',
            width: '300px'
        },
        {
            key: 'parentId',
            title: 'Родительская категория',
            width: '250px',
            render: (value) => getParentCategoryName(value)
        },
        {
            key: 'displayOrder',
            title: 'Порядок',
            width: '100px'
        },
        {
            key: 'isActive',
            title: 'Статус',
            width: '120px',
            render: (value) => (
                <span style={{
                    color: value ? COLORS.SUCCESS.DARK : COLORS.ERROR.DARK
                }}>
                    {value ? 'Активна' : 'Неактивна'}
                </span>
            )
        },
        {
            key: 'actions',
            title: 'Действия',
            width: '150px',
            render: (value, item) => (
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(item)}
                >
                    Редактировать
                </Button>
            )
        }
    ];

    return (
        <>
            {/* Фильтр по родительской категории */}
            <CategoryFilter
                categories={categories}
                selectedParentId={selectedParentId}
                onFilterChange={handleFilterChange}
            />

            <AdminTable<Category>
                title="Управление категориями"
                data={filteredCategories}
                columns={columns}
                loadingState={loadingState}
                entityName="категорий"
                emptyMessage={selectedParentId ? "Нет дочерних категорий для выбранной родительской категории" : "Нет категорий"}
                onRefresh={loadCategories}
                onCreateNew={handleCreate}
                createButtonText="Создать категорию"
                itemsPerPage={10}
            />

            {/* Модальное окно с формой */}
            <AdminForm
                title={editingCategory ? 'Редактировать категорию' : 'Создать категорию'}
                isOpen={isModalOpen}
                onClose={closeModal}
                onSubmit={handleSaveCategory}
                fields={getCategoryFormFields(categories, editingCategory)}
                initialData={getFormInitialData()}
                isSubmitting={isSubmitting}
                submitButtonText={editingCategory ? 'Сохранить' : 'Создать'}
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
