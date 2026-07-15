'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllProducts, createProduct, updateProduct, hardDeleteProduct, getPhotoStatuses, retryPhotos, PhotoStatus } from '@/api/products/methods';
import { Product, CurrencyList, QuantityType, ProductStatus } from '@/api/products/models';
import { Button } from '@/components/ui/Button/Button';
import { COLORS, SPACING } from '@/constants/ui';
import { useNotification } from '@/hooks/useNotification';
import { Notification } from '@/components/ui/Notification/Notification';
import { AdminForm, FormField } from '@/components/AdminForm/AdminForm';
import { usePageTitle } from '@/components/AuthWrapper';
import { uploadFile } from '@/api/files/methods';
import { apiUrl } from '@/api/api';
import Image from 'next/image';
import { getAllBrands } from '@/api/brands/methods';
import { getAllCategories } from '@/api/categories/methods';
import { AdminTable } from '@/components/AdminTable/AdminTable';
import { TableColumn, LoadingState } from '@/types/common';
import { SearchableSelect } from '@/components/ui/SearchableSelect/SearchableSelect';

// Компонент для отображения изображения или видео товара
function ProductImage({ src }: { src: string }) {
    if (!src) {
        return <span>Нет медиа</span>;
    }

    const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i;
    const isVideo = VIDEO_EXT_RE.test(src.split('?')[0]);

    if (isVideo) {
        return (
            <video
                src={`${apiUrl}/files/${src}`}
                width={60}
                height={60}
                style={{ borderRadius: '4px', objectFit: 'cover' }}
                muted
                preload='metadata'
            />
        );
    }

    return (
        <Image
            src={`${apiUrl}/files/${src}`}
            alt="Фото товара"
            width={60}
            height={60}
            style={{ borderRadius: '4px', objectFit: 'cover' }}
            unoptimized
        />
    );
}

// Компонент фильтров
const ProductFilters = ({
    searchQuery,
    onSearchChange,
    selectedCategory,
    onCategoryChange,
    selectedSubcategory,
    onSubcategoryChange,
    selectedBrand,
    onBrandChange,
    selectedStatus,
    onStatusChange,
    selectedCurrency,
    onCurrencyChange,
    minPrice,
    onMinPriceChange,
    maxPrice,
    onMaxPriceChange,
    onClearFilters,
    categories,
    subcategories,
    brands,
}: {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    selectedCategory: string;
    onCategoryChange: (value: string) => void;
    selectedSubcategory: string;
    onSubcategoryChange: (value: string) => void;
    selectedBrand: string;
    onBrandChange: (value: string) => void;
    selectedStatus: string;
    onStatusChange: (value: string) => void;
    selectedCurrency: string;
    onCurrencyChange: (value: string) => void;
    minPrice: string;
    onMinPriceChange: (value: string) => void;
    maxPrice: string;
    onMaxPriceChange: (value: string) => void;
    onClearFilters: () => void;
    categories: any[];
    subcategories: any[];
    brands: any[];
    hasActiveFilters: boolean;
}) => {
    const filterContainerStyle = {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: SPACING.MD,
        marginBottom: SPACING.XL,
        padding: SPACING.LG,
        backgroundColor: COLORS.GRAY[50],
        borderRadius: '8px',
        border: `1px solid ${COLORS.GRAY[200]}`,
        width: 'min-content',
    };

    const filterGroupStyle = {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: SPACING.SM,
        minWidth: '200px',
    };

    const labelStyle = {
        fontSize: '12px',
        fontWeight: '500',
        color: COLORS.GRAY[700],
        marginBottom: '4px',
    };

    const selectStyle = {
        padding: `${SPACING.SM} ${SPACING.MD}`,
        border: `1px solid ${COLORS.GRAY[300]}`,
        borderRadius: '4px',
        fontSize: '14px',
        backgroundColor: COLORS.WHITE,
        outline: 'none',
        transition: 'border-color 0.2s ease',
    };

    const inputStyle = {
        padding: `${SPACING.SM} ${SPACING.MD}`,
        border: `1px solid ${COLORS.GRAY[300]}`,
        borderRadius: '4px',
        fontSize: '14px',
        backgroundColor: COLORS.WHITE,
        outline: 'none',
        transition: 'border-color 0.2s ease',
        width: '100%',
    };

    return (
        <div style={filterContainerStyle}>
            {/* Поиск по названию */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: SPACING.MD, width: '100%' }}>
                <div style={{ ...filterGroupStyle, width: '100%' }}>
                    <label style={labelStyle}>Поиск по названию</label>
                    <input
                        type="text"
                        placeholder="Введите название товара..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                {/* Кнопка сброса фильтров */}
                <div style={{ ...filterGroupStyle, justifyContent: 'flex-end' }}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        style={{
                            marginTop: '20px',
                            padding: `${SPACING.SM} ${SPACING.MD}`,
                            fontSize: '12px'
                        }}
                    >
                        Сбросить фильтры
                    </Button>
                </div>
            </div>

            {/* Фильтр по категории */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: SPACING.MD, width: '100%' }}>

                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Категория</label>
                    <SearchableSelect
                        value={selectedCategory}
                        onChange={onCategoryChange}
                        options={[
                            { value: '', label: 'Все категории' },
                            ...categories.filter(category => !category.parentId).map(category => ({
                                value: category.id,
                                label: category.name
                            }))
                        ]}
                        placeholder="Выберите категорию"
                        style={selectStyle}
                    />
                </div>

                {/* Фильтр по подкатегории */}
                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Подкатегория</label>
                    <SearchableSelect
                        value={selectedSubcategory}
                        onChange={onSubcategoryChange}
                        options={[
                            { value: '', label: 'Все подкатегории' },
                            ...subcategories.map(subcategory => ({
                                value: subcategory.id,
                                label: subcategory.name
                            }))
                        ]}
                        placeholder="Выберите подкатегорию"
                        style={selectStyle}
                    />
                </div>

                {/* Фильтр по бренду */}
                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Бренд</label>
                    <SearchableSelect
                        value={selectedBrand}
                        onChange={onBrandChange}
                        options={[
                            { value: '', label: 'Все бренды' },
                            ...brands.map(brand => ({
                                value: brand.id,
                                label: brand.name
                            }))
                        ]}
                        placeholder="Выберите бренд"
                        style={selectStyle}
                    />
                </div>

                {/* Фильтр по статусу */}
                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Статус</label>
                    <SearchableSelect
                        value={selectedStatus}
                        onChange={onStatusChange}
                        options={[
                            { value: '', label: 'Все статусы' },
                            { value: ProductStatus.MODERATION, label: 'На модерации' },
                            { value: ProductStatus.APPROVED, label: 'Одобрен' },
                            { value: ProductStatus.REJECTED, label: 'Отклонен' }
                        ]}
                        placeholder="Выберите статус"
                        style={selectStyle}
                    />
                </div>
            </div>

            {/* Фильтр по цене */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: SPACING.MD, width: '100%' }}>
                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Цена от</label>
                    <input
                        type="number"
                        placeholder="0"
                        value={minPrice}
                        onChange={(e) => onMinPriceChange(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Цена до</label>
                    <input
                        type="number"
                        placeholder="∞"
                        value={maxPrice}
                        onChange={(e) => onMaxPriceChange(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                {/* Фильтр по валюте */}
                <div style={filterGroupStyle}>
                    <label style={labelStyle}>Валюта</label>
                    <SearchableSelect
                        value={selectedCurrency}
                        onChange={onCurrencyChange}
                        options={[
                            { value: '', label: 'Все валюты' },
                            { value: CurrencyList.RUB, label: 'RUB' },
                            { value: CurrencyList.USD, label: 'USD' },
                            { value: CurrencyList.EUR, label: 'EUR' }
                        ]}
                        placeholder="Выберите валюту"
                        style={selectStyle}
                    />
                </div>
            </div>
        </div >
    );
};

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({
        isLoading: true,
        error: null
    });

    // Справочники
    const [brands, setBrands] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    // Шаг 3: статусы автоскачивания фото по товарам-черновикам парсинга
    const [photoStatuses, setPhotoStatuses] = useState<Record<string, PhotoStatus>>({});

    // Фильтры
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSubcategory, setSelectedSubcategory] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');

    // Модальные окна
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { notification, showNotification } = useNotification();
    const { setPageTitle } = usePageTitle();

    useEffect(() => {
        setPageTitle('Управление товарами');
    }, [setPageTitle]);

    // Фильтрация категорий и подкатегорий
    const mainCategories = useMemo(() => {
        return categories.filter(category => !category.parentId);
    }, [categories]);

    const subcategories = useMemo(() => {
        if (!selectedCategory) return [];
        return categories.filter(category => category.parentId === selectedCategory);
    }, [categories, selectedCategory]);

    // Сброс подкатегории при изменении категории
    useEffect(() => {
        setSelectedSubcategory('');
    }, [selectedCategory]);

    // Загрузка данных
    const loadData = async () => {
        try {
            setLoadingState({ isLoading: true, error: null });
            const [productsResponse, brandsResponse, categoriesResponse, photoResponse] = await Promise.all([
                getAllProducts(),
                getAllBrands(),
                getAllCategories(),
                getPhotoStatuses().catch(() => [] as PhotoStatus[])
            ]);
            setProducts(productsResponse);
            setBrands(brandsResponse);
            setCategories(categoriesResponse);
            setPhotoStatuses(Object.fromEntries(photoResponse.map(s => [s.product_id, s])));
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

    // Фильтрация товаров
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            // Фильтр по поиску
            const searchPass = !searchQuery ||
                product.name.toLowerCase().includes(searchQuery.toLowerCase());

            // Фильтр по категории и подкатегории
            let categoryPass = true;
            if (selectedCategory) {
                // Если выбрана категория, проверяем что продукт принадлежит к этой категории или её подкатегориям
                const productCategory = categories.find(cat => cat.id === product.category?.id);
                categoryPass = productCategory && (productCategory.id === selectedCategory || productCategory.parentId === selectedCategory);
            }
            if (selectedSubcategory) {
                // Если выбрана подкатегория, проверяем точное совпадение
                categoryPass = product.category?.id === selectedSubcategory;
            }

            // Фильтр по бренду
            const brandPass = !selectedBrand ||
                product.brand?.id === selectedBrand;

            // Фильтр по статусу
            const statusPass = !selectedStatus ||
                product.status === selectedStatus;

            // Фильтр по валюте
            const currencyPass = !selectedCurrency ||
                product.currency === selectedCurrency;

            // Фильтр по цене
            const minPriceNum = minPrice ? parseFloat(minPrice) : 0;
            const maxPriceNum = maxPrice ? parseFloat(maxPrice) : Infinity;
            const pricePass = Number(product.priceCash) >= minPriceNum && Number(product.priceCash) <= maxPriceNum;

            return searchPass && categoryPass && brandPass && statusPass && currencyPass && pricePass;
        });
    }, [products, searchQuery, selectedCategory, selectedSubcategory, selectedBrand, selectedStatus, selectedCurrency, minPrice, maxPrice, categories]);

    // Проверка наличия активных фильтров
    const hasActiveFilters = useMemo(() => {
        return Boolean(searchQuery || selectedCategory || selectedSubcategory || selectedBrand || selectedStatus || selectedCurrency || minPrice || maxPrice);
    }, [searchQuery, selectedCategory, selectedSubcategory, selectedBrand, selectedStatus, selectedCurrency, minPrice, maxPrice]);

    // Сброс всех фильтров
    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedCategory('');
        setSelectedSubcategory('');
        setSelectedBrand('');
        setSelectedStatus('');
        setSelectedCurrency('');
        setMinPrice('');
        setMaxPrice('');
    };

    // Обработчики
    const handleCreate = () => {
        setEditingProduct(null);
        setSelectedFormCategory('');
        setFormData({});
        setIsModalOpen(true);
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product);

        // Определяем выбранную категорию для формы
        const currentCategory = categories.find(cat => cat.id === product.category?.id);
        const isSubcategory = currentCategory?.parentId;
        const categoryId = isSubcategory ? currentCategory?.parentId || '' : product.category?.id;

        // Устанавливаем начальные данные формы
        const initialData = {
            customId: product.customId || '',
            userId: product.user?.tgId || '',
            name: product.name,
            priceCash: Number(product.priceCash),
            priceNonCash: Number(product.priceNonCash),
            currency: product.currency,
            preview: product.preview,
            files: product.files || [],
            description: product.description,
            categoryId: categoryId,
            subcategoryId: isSubcategory ? product.category?.id : '',
            brandId: product.brand?.id || '',
            quantity: product.quantity,
            quantityType: product.quantityType,
            status: product.status,
            isActive: Boolean(product.isActive)
        };
        setFormData(initialData);

        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setSelectedFormCategory('');
        setFormData({});
    };

    const handleSaveProduct = async (productData: any) => {
        setIsSubmitting(true);

        try {
            let processedData = { ...productData };

            // Обработка пустых строк в ценах - устанавливаем 0
            if (processedData.priceCash === '' || processedData.priceCash === null || processedData.priceCash === undefined) {
                processedData.priceCash = 0;
            }
            if (processedData.priceNonCash === '' || processedData.priceNonCash === null || processedData.priceNonCash === undefined) {
                processedData.priceNonCash = 0;
            }

            if (processedData.subcategoryId) {
                processedData.categoryId = processedData.subcategoryId;
            }
            processedData = { ...processedData, subcategoryId: undefined };

            if (processedData.preview && processedData.preview instanceof File) {
                const formData = new FormData();
                formData.append('file', processedData.preview);
                const result = await uploadFile(formData);
                processedData.preview = result.filename;
            }

            if (processedData.files && Array.isArray(processedData.files) && processedData.files.length > 0) {
                const uploadedFiles = await Promise.all(
                    processedData.files.map(async (file: File) => {
                        if (file instanceof File) {
                            const formData = new FormData();
                            formData.append('file', file);
                            const result = await uploadFile(formData);
                            return result.filename;
                        }
                        return file;
                    })
                );
                processedData.files = uploadedFiles;
            } else {
                processedData.files = [];
            }

            if (editingProduct) {
                try {
                    await updateProduct(editingProduct.id, processedData);
                } catch (err: any) {
                    // Шаг 3: строгий вариант — одобрение без готовых фото только с явным подтверждением
                    if (String(err.message || '').includes('PHOTOS_NOT_READY')) {
                        const reason = String(err.message).replace('PHOTOS_NOT_READY:', '').trim();
                        if (confirm(`${reason}.\n\nОпубликовать товар БЕЗ фото?`)) {
                            await updateProduct(editingProduct.id, processedData, true);
                        } else {
                            setIsSubmitting(false);
                            return;
                        }
                    } else {
                        throw err;
                    }
                }
                showNotification({
                    message: 'Товар успешно обновлен',
                    type: 'success'
                });
            } else {
                await createProduct(processedData);
                showNotification({
                    message: 'Товар успешно создан',
                    type: 'success'
                });
            }

            await loadData();
            closeModal();
        } catch (err: any) {
            console.error('Ошибка при сохранении товара:', err);
            showNotification({
                message: err.message || 'Произошла ошибка',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Состояние для динамических полей формы
    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [selectedFormCategory, setSelectedFormCategory] = useState('');
    const [formData, setFormData] = useState<Record<string, any>>({});

    // Подготовка полей формы
    const getFormFields = (): FormField[] => [
        {
            name: 'customId',
            label: 'SKU (ID из Парсинга)',
            type: 'text',
            required: false,
            placeholder: 'Напр. TEM-001166'
        },
        {
            name: 'userId',
            label: 'Пользователь',
            type: 'text',
            required: true,
            placeholder: 'Введите ID пользователя'
        },
        {
            name: 'name',
            label: 'Название',
            type: 'text',
            required: true,
            placeholder: 'Введите название товара'
        },
        {
            name: 'priceCash',
            label: 'Цена (наличные)',
            type: 'number',
            placeholder: 'Введите цену'
        },
        {
            name: 'priceNonCash',
            label: 'Цена (безнал)',
            type: 'number',
            placeholder: 'Введите цену'
        },
        {
            name: 'currency',
            label: 'Валюта',
            type: 'select',
            required: true,
            options: Object.values(CurrencyList).map(value => ({
                value,
                label: value
            }))
        },
        {
            name: 'preview',
            label: 'Превью',
            type: 'file',
            accept: 'image/*',
            required: true,
            helpText: 'Загрузите превью товара (до 1000х1000, до 1мб, формат .webp)',
        },
        {
            name: 'files',
            label: 'Фотографии и видео',
            type: 'file',
            accept: 'image/*,video/*,.mp4,.webm,.ogg,.mov,.avi,.wmv,.flv,.mkv',
            multiple: true,
            required: false,
            helpText: 'Загрузите фотографии и видео товара (изображения: квадратные до 1000х1000, до 1мб, формат .webp; видео: до 5мб)'
        },
        {
            name: 'description',
            label: 'Описание',
            type: 'textarea',
            required: true,
            placeholder: 'Введите описание товара'
        },
        {
            name: 'categoryId',
            label: 'Категория',
            type: 'select',
            required: true,
            placeholder: 'Выберите категорию',
            options: mainCategories.map(category => ({
                value: category.id,
                label: category.name
            }))
        },
        {
            name: 'subcategoryId',
            label: 'Подкатегория',
            type: 'select',
            required: false,
            placeholder: 'Выберите подкатегорию',
            options: categories.filter(category => category.parentId === selectedFormCategory).map((subcategory: any) => ({
                value: subcategory.id,
                label: subcategory.name
            }))
        },
        {
            name: 'brandId',
            label: 'Бренд',
            type: 'select',
            required: true,
            placeholder: 'Выберите бренд',
            options: brands.map(brand => ({
                value: brand.id,
                label: brand.name
            }))
        },
        {
            name: 'quantity',
            label: 'Количество',
            type: 'number',
            required: true,
            placeholder: 'Введите количество'
        },
        {
            name: 'quantityType',
            label: 'Тип количества',
            type: 'select',
            required: true,
            options: Object.values(QuantityType).map(value => ({
                value,
                label: value === QuantityType.PIECE ? 'Штуки' : 'Комплекты'
            }))
        },
        {
            name: 'status',
            label: 'Статус',
            type: 'select',
            required: true,
            options: Object.values(ProductStatus).map(value => ({
                value,
                label: value === ProductStatus.MODERATION ? 'На модерации' :
                    value === ProductStatus.APPROVED ? 'Одобрен' : 'Отклонен'
            }))
        },
        {
            name: 'isActive',
            label: 'Активен',
            type: 'checkbox',
            required: false
        }
    ];

    // Инициализация полей формы при загрузке данных
    useEffect(() => {
        if (categories.length > 0 && brands.length > 0) {
            const fields = getFormFields();
            setFormFields(fields);

            // Если редактируем товар, устанавливаем правильную категорию
            if (editingProduct) {
                const currentCategory = categories.find(cat => cat.id === editingProduct.category?.id);
                const isSubcategory = currentCategory?.parentId;
                const categoryId = isSubcategory ? currentCategory?.parentId || '' : editingProduct.category?.id;
                setSelectedFormCategory(categoryId);
            }
        }
    }, [categories, brands, editingProduct]);

    // Обновление поля подкатегории при изменении выбранной категории
    useEffect(() => {
        setFormFields(prevFields =>
            prevFields.map(field => {
                if (field.name === 'subcategoryId') {
                    return {
                        ...field,
                        options: categories
                            .filter(category => category.parentId === selectedFormCategory)
                            .map(subcategory => ({
                                value: subcategory.id,
                                label: subcategory.name
                            }))
                    };
                }
                return field;
            })
        );
    }, [selectedFormCategory, categories]);

    // Установка selectedFormCategory при изменении editingProduct
    useEffect(() => {
        if (editingProduct && categories.length > 0) {
            const currentCategory = categories.find(cat => cat.id === editingProduct.category?.id);
            const isSubcategory = currentCategory?.parentId;
            const categoryId = isSubcategory ? currentCategory?.parentId || '' : editingProduct.category?.id;
            setSelectedFormCategory(categoryId);
        } else if (!editingProduct) {
            // Сбрасываем при создании нового товара
            setSelectedFormCategory('');
        }
    }, [editingProduct, categories]);

    // Обработчик изменения полей формы
    const handleFormFieldChange = (fieldName: string, value: any, currentFormData: any) => {
        // Обновляем локальное состояние формы
        setFormData(currentFormData);

        // Если изменилась категория, обновляем состояние и сбрасываем подкатегорию
        if (fieldName === 'categoryId') {
            setSelectedFormCategory(value);
            // Сбрасываем подкатегорию
            setFormData(prev => ({
                ...prev,
                subcategoryId: ''
            }));
        }
    };

    // Подготовка данных для формы
    const getFormInitialData = (): Record<string, any> => {
        if (!editingProduct) {
            return {
                customId: '',
                userId: '6737529504',
                name: '',
                priceCash: '',
                priceNonCash: '',
                currency: CurrencyList.RUB,
                preview: '',
                files: [],
                description: '',
                categoryId: selectedFormCategory || '',
                subcategoryId: '',
                brandId: '',
                quantity: 1,
                quantityType: QuantityType.PIECE,
                status: ProductStatus.MODERATION,
                isActive: true
            };
        }

        // Определяем, является ли текущая категория подкатегорией
        const currentCategory = categories.find(cat => cat.id === editingProduct.category?.id);
        const isSubcategory = currentCategory?.parentId;

        return {
            customId: editingProduct.customId || '',
            userId: editingProduct.user?.tgId || '',
            name: editingProduct.name,
            priceCash: Number(editingProduct.priceCash),
            priceNonCash: Number(editingProduct.priceNonCash),
            currency: editingProduct.currency,
            preview: editingProduct.preview,
            files: editingProduct.files,
            description: editingProduct.description,
            categoryId: isSubcategory ? currentCategory?.parentId || '' : editingProduct.category?.id,
            subcategoryId: isSubcategory ? editingProduct.category?.id : '',
            brandId: editingProduct.brand?.id || '',
            quantity: editingProduct.quantity,
            quantityType: editingProduct.quantityType,
            status: editingProduct.status,
            isActive: Boolean(editingProduct.isActive)
        };
    };

    // Колонки таблицы
    const columns: TableColumn<Product>[] = [
        {
            key: 'preview',
            title: 'Медиа',
            width: '80px',
            render: (value) => <ProductImage src={value} />
        },
        {
            key: 'customId',
            title: 'SKU',
            width: '130px',
            render: (value) => value || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>нет</span>
        },
        {
            key: 'viewCount',
            title: 'Просмотры',
            width: '100px',
            sortable: true,
            render: (value) => value || 0
        },
        {
            key: 'name',
            title: 'Название',
            width: '250px'
        },
        {
            key: 'user',
            title: 'Пользователь',
            width: '150px',
            render: (value) => value?.tgId || ''
        },
        {
            key: 'category',
            title: 'Категория',
            width: '150px',
            render: (value) => value?.name || ''
        },

        {
            key: 'brand',
            title: 'Бренд',
            width: '150px',
            render: (value) => value?.name || ''
        },
        {
            key: 'priceCash',
            title: 'Цена',
            width: '120px',
            render: (value, item) => Number(value) === 0 ? 'Цена по запросу' : `${value} ${item.currency}`
        },
        {
            key: 'status',
            title: 'Статус',
            width: '120px',
            render: (value) => {
                const statusText = value === ProductStatus.MODERATION ? 'На модерации' :
                    value === ProductStatus.APPROVED ? 'Одобрен' : 'Отклонен';
                return (
                    <span style={{
                        color: value === ProductStatus.APPROVED ? COLORS.SUCCESS.DARK :
                            value === ProductStatus.MODERATION ? '#f59e0b' : COLORS.ERROR.DARK
                    }}>
                        {statusText}
                    </span>
                );
            }
        },
        {
            key: 'actions',
            title: 'Действия',
            width: '230px',
            render: (value, item) => {
                const ph = photoStatuses[item.id];
                const phBadge = ph && (
                    ph.state === 'pending' || ph.state === 'running'
                        ? { text: `📷 ${ph.downloaded ?? 0}/${ph.total ?? '?'}…`, bg: '#fef3c7', fg: '#92400e', title: 'Фото скачиваются' }
                        : ph.state === 'error'
                            ? { text: '📷 ошибка', bg: '#fee2e2', fg: '#991b1b', title: ph.last_error || 'Ошибка скачивания фото' }
                            : null
                );
                return (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {phBadge && (
                            <span title={phBadge.title} style={{ background: phBadge.bg, color: phBadge.fg, borderRadius: 6, padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap' }}>
                                {phBadge.text}
                            </span>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(item)}
                        >
                            Редактировать
                        </Button>
                        {ph && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRetryPhotos(item)}
                            >
                                Фото ⟳
                            </Button>
                        )}
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleHardDelete(item)}
                        >
                            Удалить
                        </Button>
                    </div>
                );
            }
        }
    ];

    // Шаг 3: «Скачать фото заново» — перекачка с URL исходной позиции
    async function handleRetryPhotos(item: Product) {
        if (!confirm(`Перекачать фото для «${item.name}» с сайта-источника?\nТекущие фото товара будут заменены.`)) return;
        try {
            const { total } = await retryPhotos(item.id);
            showNotification({ message: `Поставлено в очередь: ${total} фото (скачаются в течение пары минут)`, type: 'success' });
            await loadData();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || (e as Error).message;
            alert(msg);
        }
    }

    // Хотфикс ТЗ №2-fix2: физическое удаление черновика (гарды на бэке:
    // опубликованный или со ссылками — откажет с причиной)
    async function handleHardDelete(item: Product) {
        if (!confirm(`Удалить «${item.name}» НАВСЕГДА?\nПозиция источника снова станет доступной для «В товары», файлы будут вычищены.`)) return;
        try {
            await hardDeleteProduct(item.id);
            showNotification({ message: 'Товар удалён', type: 'success' });
            await loadData();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                || (e as Error).message;
            alert(msg);
        }
    }

    return (
        <>
            {/* Фильтры */}
            <ProductFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                selectedSubcategory={selectedSubcategory}
                onSubcategoryChange={setSelectedSubcategory}
                selectedBrand={selectedBrand}
                onBrandChange={setSelectedBrand}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                selectedCurrency={selectedCurrency}
                onCurrencyChange={setSelectedCurrency}
                minPrice={minPrice}
                onMinPriceChange={setMinPrice}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
                onClearFilters={handleClearFilters}
                categories={categories}
                subcategories={subcategories}
                brands={brands}
                hasActiveFilters={hasActiveFilters}
            />

            <AdminTable<Product>
                title="Управление товарами"
                data={filteredProducts}
                columns={columns}
                loadingState={loadingState}
                entityName="товаров"
                emptyMessage={hasActiveFilters ? "Товары не найдены" : "Нет товаров"}
                onRefresh={loadData}
                onCreateNew={handleCreate}
                createButtonText="Создать товар"
                itemsPerPage={10}
            />

            {/* Модальное окно с формой */}
            <AdminForm
                title={editingProduct ? 'Редактировать товар' : 'Создать товар'}
                isOpen={isModalOpen}
                onClose={closeModal}
                onSubmit={handleSaveProduct}
                fields={formFields}
                initialData={Object.keys(formData).length > 0 ? formData : getFormInitialData()}
                isSubmitting={isSubmitting}
                submitButtonText={editingProduct ? 'Сохранить' : 'Создать'}
                onFieldChange={handleFormFieldChange}
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