'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute/ProtectedRoute';
import { Input } from '@/components/common/Input/Input';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { UserIcon } from 'lucide-react';
import { initData, useSignal } from '@tma.js/sdk-react';
import { toast } from 'sonner';

import { useUserData, useEditUser } from '@/features/users/hooks';
import {
  useAvailableCities,
  useCityCountryOptions,
} from '@/features/cities/hooks';
import { toImageSrc } from '@/utils/toImageSrc';
import { uploadFile } from '@/api/files/methods';
import { ComboSelect } from '@/components/common/Select/ComboSelect';
import { EmailConfirmModal } from '@/components/Auth/EmailConfirmModal';
import { PasswordMergeModal } from '@/components/Auth/PasswordMergeModal';
import { mergeAccounts } from '@/api/user/methods';
import { useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/queryKeys';
import { PushToggle } from '@/components/PushToggle';

const isUUID = (v?: string) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  countryId: string;
  cityId: string;
};

export default function PersonalInfoForm() {
  const initDataUser = useSignal(initData.user);

  // 1) мои данные
  const { data: me, status: meStatus } = useUserData();

  // 2) города (+ из них строим страны)
  const {
    data: cities,
    status: citiesStatus,
    error: citiesError,
  } = useAvailableCities();
  const { byId, countryOptions, cityOptionsByCountry } =
    useCityCountryOptions(cities);

  // 3) апдейт
  const editUser = useEditUser();

  const isLoading = meStatus === 'pending';
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [showPasswordMerge, setShowPasswordMerge] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingMergeEmail, setPendingMergeEmail] = useState<string | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    setValue,
    watch,
    reset,
  } = useForm<FormValues>({
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      phone: '',
      countryId: '',
      cityId: '',
    },
  });

  // init из сервера
  useEffect(() => {
    if (!me) return;
    reset({
      firstName: me.firstName ?? '',
      lastName: me.lastName ?? '',
      email: me.email ?? '',
      username: me.username ?? '',
      phone: me.phone ?? '',
      countryId: me.city?.country.id ?? '',
      cityId: me.city?.id ?? '',
    });
  }, [me, reset]);

  // аватар: server photoUrl -> telegram photo_url -> placeholder
  useEffect(() => {
    const serverOrTg = me?.photoUrl ?? initDataUser?.photo_url ?? null;
    setAvatarUrl(
      serverOrTg ? toImageSrc(serverOrTg) : '/images/avatar-placeholder.png',
    );
  }, [me?.photoUrl, initDataUser?.photo_url]);

  const values = watch();

  // смена страны — очищаем город, если он не из этой страны
  const onCountryChange = (countryId: string) => {
    setValue('countryId', countryId, { shouldDirty: true, shouldTouch: true });
    const currentCity = values.cityId ? byId.get(values.cityId) : null;
    if (!currentCity || currentCity.country.id !== countryId) {
      setValue('cityId', '', { shouldDirty: true, shouldTouch: true });
    }
  };

  // смена города — подставляем страну
  const onCityChange = (cityId: string) => {
    setValue('cityId', cityId, { shouldDirty: true, shouldTouch: true });
    const city = byId.get(cityId);
    if (city) {
      setValue('countryId', city.country.id, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setLocalFile(f);
    setAvatarUrl(URL.createObjectURL(f));
  };

  const handleEmailConfirmSuccess = async () => {
    setShowEmailConfirm(false);
    setPendingEmail(null);
    await queryClient.invalidateQueries({ queryKey: QK.users.me() });
    toast.success('Email подтвержден');
  };

  const handlePasswordMergeSuccess = async (
    email: string,
    password: string,
  ) => {
    try {
      await mergeAccounts(email, password);
      setShowPasswordMerge(false);
      setPendingMergeEmail(null);
      await queryClient.invalidateQueries({ queryKey: QK.users.me() });
      toast.success('Аккаунты успешно объединены');
    } catch (e: any) {
      toast.error('Ошибка при объединении аккаунтов');
    }
  };

  const onSubmit = async (data: FormValues) => {
    try {
      setIsUploading(true);

      let photoUrl: string | undefined;
      if (localFile) {
        const fd = new FormData();
        fd.append('file', localFile);
        const { filename } = await uploadFile(fd);
        photoUrl = filename;
      }

      const newEmail = data.email?.trim() || null;
      const currentEmail = me?.email?.trim() || null;
      const emailChanged = newEmail !== currentEmail;
      const isEmailFirstTime = !currentEmail && newEmail;
      const isEmailUnverified =
        currentEmail &&
        !me?.emailVerified &&
        newEmail &&
        newEmail !== currentEmail;

      if (emailChanged && me?.emailVerified && currentEmail) {
        toast.error('Нельзя изменить подтвержденный email');
        setIsUploading(false);
        return;
      }

      try {
        await editUser.mutateAsync({
          firstName: data.firstName,
          lastName: data.lastName || null,
          email: newEmail,
          phone: data.phone || null,
          cityId: isUUID(data.cityId) ? data.cityId : null,
          subscribedToNewsletter: Boolean(me?.subscribedToNewsletter) ?? false,
          ...(photoUrl !== undefined ? { photoUrl } : {}),
        });

        if (photoUrl) setAvatarUrl(toImageSrc(photoUrl));
        setLocalFile(null);

        if (emailChanged && (isEmailFirstTime || isEmailUnverified)) {
          if (newEmail) {
            setPendingEmail(newEmail);
            setShowEmailConfirm(true);
            toast.success('Проверьте почту, код подтверждения отправлен');
          }
        } else {
          toast.success('Данные сохранены');
        }
      } catch (e: any) {
        const errorMessage = e?.message || '';
        if (errorMessage.includes('Email привязан к другому аккаунту')) {
          if (newEmail) {
            setPendingMergeEmail(newEmail);
            setShowPasswordMerge(true);
          }
        } else if (
          errorMessage.includes('привязан к другому Telegram аккаунту')
        ) {
          toast.error('Email привязан к другому Telegram аккаунту');
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      toast.error('Email привязан к другому Telegram аккаунту');
    } finally {
      setIsUploading(false);
    }
  };

  const disabledSubmit =
    isSubmitting ||
    editUser.isPending ||
    isUploading ||
    // если форма не менялась, но выбрали файл — всё равно разрешим сабмит
    (!isDirty && !localFile);

  return (
    <ProtectedRoute>
      <Page back={true}>
        <Layout className='p-4 space-y-4 text-black'>
          <h2 className='text-center text-lg font-medium'>Личная информация</h2>

          <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
            {/* avatar + firstName в ряд */}
            <div className='flex items-center gap-4'>
              <div
                className='w-16 h-16 border rounded-lg flex items-center justify-center overflow-hidden cursor-pointer'
                onClick={handleAvatarClick}
                title='Загрузить аватар'
              >
                {isLoading ? (
                  <div className='w-full h-full bg-gray-100' />
                ) : avatarUrl ? (
                  <ImageWithSkeleton
                    src={avatarUrl}
                    containerClassName='w-16 h-16'
                    className='!rounded-none object-cover'
                    alt='avatar'
                    isLoading={isLoading}
                  />
                ) : (
                  <UserIcon className='w-10 h-10 text-gray-500' />
                )}
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  onChange={handleFileChange}
                  className='hidden'
                />
              </div>

              <Input
                label='Имя'
                {...register('firstName', { required: 'Введите имя' })}
                value={values.firstName}
                error={errors.firstName?.message}
                containerClassName='flex-1'
                disabled={isLoading}
              />
            </div>

            <Input
              label='Фамилия'
              {...register('lastName')}
              value={values.lastName}
              error={errors.lastName?.message}
              disabled={isLoading}
            />

            <Input
              label='Email'
              type='email'
              {...register('email', {
                pattern: {
                  value: /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/,
                  message: 'Неверный формат email',
                },
              })}
              value={values.email}
              error={errors.email?.message}
              disabled={isLoading || (me?.emailVerified && !!me?.email)}
              readOnly={me?.emailVerified && !!me?.email}
            />

            <Input
              label='Никнейм (Telegram)'
              {...register('username')}
              value={values.username}
              readOnly
            />

            <Input
              label='Телефон'
              {...register('phone', {
                pattern: {
                  value: /^\+?\d[\d\s-]{7,}$/,
                  message: 'Неверный формат телефона',
                },
              })}
              value={values.phone}
              error={errors.phone?.message}
              disabled={isLoading}
            />

            {/* Страна — строим из городов (чтобы список городов точно матчился) */}
            <ComboSelect
              placeholder='Страна'
              value={values.countryId}
              options={countryOptions}
              onChange={onCountryChange}
              containerClassName='h-[40px]'
              disabled={citiesStatus === 'pending'}
            />

            <ComboSelect
              placeholder='Город'
              value={values.cityId}
              options={cityOptionsByCountry(values.countryId)}
              onChange={onCityChange}
              containerClassName='h-[40px]'
              disabled={citiesStatus === 'pending'}
            />

            <button
              type='submit'
              disabled={disabledSubmit}
              className='w-full bg-primary-green text-white text-sm rounded-md py-2 disabled:opacity-50 hover:opacity-70 active:opacity-70 transition'
            >
              {isUploading || editUser.isPending ? 'Сохранение…' : 'Сохранить'}
            </button>
          </form>

          <PushToggle />

          {pendingEmail && (
            <EmailConfirmModal
              open={showEmailConfirm}
              email={pendingEmail}
              onClose={() => {
                setShowEmailConfirm(false);
                setPendingEmail(null);
              }}
              onSuccess={handleEmailConfirmSuccess}
            />
          )}

          {pendingMergeEmail && (
            <PasswordMergeModal
              open={showPasswordMerge}
              email={pendingMergeEmail}
              onClose={() => {
                setShowPasswordMerge(false);
                setPendingMergeEmail(null);
              }}
              onSuccess={handlePasswordMergeSuccess}
            />
          )}
        </Layout>
      </Page>
    </ProtectedRoute>
  );
}
