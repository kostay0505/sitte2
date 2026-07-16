import { useState, useEffect, ReactNode } from 'react';
import { SPACING } from '@/constants/ui';
import { apiUrl } from '@/api/api';
import Image from 'next/image';
import { SortableFileManager } from './SortableFileManager';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button/Button';
import { SearchableSelect } from '../ui/SearchableSelect/SearchableSelect';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'datetime-local' | 'file' | 'time' | 'checkbox' | 'select' | 'info';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  /** для type: 'info' — текст read-only блока (ТЗ №2-fix4 B2: блок review) */
  infoText?: string;
  accept?: string;
  rows?: number;
  multiple?: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

// Универсальный компонент для управления файлами с поддержкой превью
function FileManager({
  files,
  onFilesChange,
  accept,
  multiple = false,
  fieldName,
  label = 'файл'
}: {
  files: (string | File)[] | string | File | null;
  onFilesChange: (files: (string | File)[] | string | File | null) => void;
  accept?: string;
  multiple?: boolean;
  fieldName: string;
  label?: string;
}) {
  const normalizedFiles: (string | File)[] = (() => {
    if (!files) return [];
    if (Array.isArray(files)) return files;
    return [files];
  })();

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = e.target.files;
    if (newFiles && newFiles.length > 0) {
      const filesArray = Array.from(newFiles);

      if (multiple) {
        const updatedFiles = [...normalizedFiles, ...filesArray];
        onFilesChange(updatedFiles);
      } else {
        onFilesChange(filesArray[0]);
      }
    }
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = normalizedFiles.filter((_, i) => i !== index);

    if (multiple) {
      onFilesChange(newFiles);
    } else {
      onFilesChange(newFiles.length > 0 ? newFiles[0] : null);
    }
  };

  const getFileUrl = (file: string | File) => {
    if (file instanceof File) {
      return URL.createObjectURL(file);
    }
    return `${apiUrl}/files/${file}`;
  };

  const getFileName = (file: string | File, index: number) => {
    let fileName: string;
    const maxNameLength = 50;

    if (file instanceof File) {
      fileName = file.name;
    } else {
      fileName = file.split('/').pop() || file || `Файл ${index + 1}`;
    }

    if (fileName.length > maxNameLength) {
      const lastDotIndex = fileName.lastIndexOf('.');

      if (lastDotIndex !== -1 && lastDotIndex > 0) {
        const extension = fileName.substring(lastDotIndex);
        const nameWithoutExtension = fileName.substring(0, lastDotIndex);
        const nameLength = maxNameLength - 3 - extension.length;

        if (nameLength > 0) {
          return nameWithoutExtension.substring(0, nameLength) + '...' + extension;
        } else {
          return fileName.substring(0, maxNameLength - 3) + '...';
        }
      } else {
        return fileName.substring(0, maxNameLength - 3) + '...';
      }
    }

    return fileName;
  };

  const isImageFile = (file: string | File) => {
    const fileName = file instanceof File ? file.name : file;
    const mimeType = file instanceof File ? file.type : '';
    return mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
  };

  const isVideoFile = (file: string | File) => {
    const fileName = file instanceof File ? file.name : file;
    const mimeType = file instanceof File ? file.type : '';
    return mimeType.startsWith('video/') || /\.(mp4|webm|ogg|avi|mov|wmv|flv|3gp)$/i.test(fileName);
  };

  const renderFilePreview = (file: string | File, index: number) => {
    const fileUrl = getFileUrl(file);
    const fileName = getFileName(file, index);

    if (isImageFile(file)) {
      return (
        <div
          key={index}
          style={{
            position: 'relative',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <Image
            src={fileUrl}
            alt={fileName}
            width={120}
            height={80}
            style={{
              objectFit: 'cover',
              width: '100%',
              height: '80px'
            }}
            unoptimized
          />
          <button
            type="button"
            onClick={() => handleRemoveFile(index)}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'rgba(239, 68, 68, 0.9)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '1'
            }}
            title="Удалить файл"
          >
            ×
          </button>
          <div style={{
            padding: '4px 8px',
            fontSize: '10px',
            color: '#6b7280',
            textAlign: 'center',
            background: '#f9fafb',
            borderTop: '1px solid #e5e7eb'
          }}>
            {fileName}
          </div>
        </div>
      );
    }

    if (isVideoFile(file)) {
      return (
        <div
          key={index}
          style={{
            position: 'relative',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <video
            src={fileUrl}
            style={{
              width: '100%',
              height: '80px',
              objectFit: 'cover'
            }}
            controls={false}
            muted
          />
          <button
            type="button"
            onClick={() => handleRemoveFile(index)}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'rgba(239, 68, 68, 0.9)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '1'
            }}
            title="Удалить файл"
          >
            ×
          </button>
          <div style={{
            padding: '4px 8px',
            fontSize: '10px',
            color: '#6b7280',
            textAlign: 'center',
            background: '#f9fafb',
            borderTop: '1px solid #e5e7eb'
          }}>
            {fileName}
          </div>
        </div>
      );
    }

    // Для обычных файлов
    return (
      <div
        key={index}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#f9fafb'
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            {fileName}
          </div>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px',
              color: '#3b82f6',
              textDecoration: 'none'
            }}
          >
            Открыть файл
          </a>
        </div>
        <button
          type="button"
          onClick={() => handleRemoveFile(index)}
          style={{
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Удалить
        </button>
      </div>
    );
  };

  const hasMediaFiles = normalizedFiles.some(file => isImageFile(file) || isVideoFile(file));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Отображение файлов */}
      {normalizedFiles.length > 0 && (
        <div style={hasMediaFiles ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '12px'
        } : {
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {normalizedFiles.map((file, index) => renderFilePreview(file, index))}
        </div>
      )}

      {/* Кнопка добавления файлов */}
      <div>
        <input
          type="file"
          id={`file-input-${fieldName}`}
          accept={accept}
          multiple={multiple}
          onChange={handleAddFiles}
          style={{ display: 'none' }}
        />
        <label
          htmlFor={`file-input-${fieldName}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#6b7280',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#9ca3af';
            e.currentTarget.style.color = '#4b5563';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.color = '#6b7280';
          }}
        >
          {normalizedFiles.length === 0
            ? `+ Выбрать файлы`
            : `+ Добавить еще файлы`
          }
        </label>
      </div>
    </div>
  );
}



interface AdminFormProps<T> {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: T) => Promise<void>;
  fields: FormField[];
  initialData?: Partial<T>;
  customFields?: ReactNode;
  submitButtonText?: string;
  isSubmitting?: boolean;
  onFieldChange?: (fieldName: string, value: any, formData: Partial<T>) => void;
}

export function AdminForm<T extends Record<string, any>>({
  title,
  isOpen,
  onClose,
  onSubmit,
  fields,
  initialData = {},
  customFields,
  submitButtonText = 'Сохранить',
  isSubmitting = false,
  onFieldChange,
}: AdminFormProps<T>) {
  const [formData, setFormData] = useState<Partial<T>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleChange = (name: string, value: any) => {
    const newFormData = {
      ...formData,
      [name]: value,
    };

    setFormData(newFormData);

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }

    if (onFieldChange) {
      onFieldChange(name, value, newFormData);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach(field => {
      const value = formData[field.name as keyof T];

      if (field.required && (!value || String(value).trim() === '')) {
        newErrors[field.name] = `${field.label} обязательно для заполнения`;
      }

      // Дополнительная валидация для числовых полей
      if (field.type === 'number' && value !== undefined && value !== '') {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue < 0) {
          newErrors[field.name] = `${field.label} должно быть положительным числом`;
        }
      }

      // Валидация даты
      if (field.type === 'datetime-local' && value) {
        const date = new Date(value);
        const now = new Date();
        if (date <= now) {
          newErrors[field.name] = `${field.label} должна быть в будущем`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData as T);
      onClose();
    } catch (error) {
      console.error('Ошибка при сохранении:', error);
    }
  };

  const renderField = (field: FormField) => {
    const value = formData[field.name as keyof T] || '';
    const error = errors[field.name];

    const { helpText, ...commonProps } = {
      name: field.name,
      label: field.label,
      required: field.required,
      error,
      helpText: field.helpText,
    };

    const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      let value: any = e.target.value;

      if (field.type === 'number') {
        value = value === '' ? '' : Number(value);
      } else if (field.type === 'checkbox') {
        value = (e.target as HTMLInputElement).checked;
      }

      handleChange(field.name, value);
    };

    switch (field.type) {
      case 'info':
        return (
          <div
            key={field.name}
            style={{
              padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d',
              borderRadius: '8px', fontSize: '13px', color: '#92400e', whiteSpace: 'pre-wrap',
            }}
          >
            {field.infoText || String(value)}
          </div>
        );

      case 'textarea':
        return (
          <textarea
            key={field.name}
            {...commonProps}
            value={String(value)}
            placeholder={field.placeholder}
            onChange={handleFieldChange}
            rows={field.rows || 3}
            style={{
              width: '100%',
              padding: `${SPACING.MD} ${SPACING.LG}`,
              border: `1px solid ${error ? '#991b1b' : '#d1d5db'}`,
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
              minHeight: `${(field.rows || 3) * 24}px`,
            }}
          />
        );

      case 'file':
        // Использование SortableFileManager для поля photos
        if (field.multiple) {
          return (
            <SortableFileManager
              key={field.name}
              files={Array.isArray(value) ? value : []}
              onFilesChange={(files) => {
                if (Array.isArray(files) && files.length > 5) {
									setErrors((prev) => ({
										...prev,
										[field.name]: 'Можно загрузить не более 5 файлов',
									}));
									return; 
								}
                handleChange(field.name, files);
              }}
              accept={field.accept}
              multiple={field.multiple}
              fieldName={field.name}
              label={field.label.toLowerCase()}
            />
          );
        }

        // Универсальная обработка файлов с поддержкой превью для остальных полей
        return (
          <FileManager
            key={field.name}
            files={field.multiple
              ? (Array.isArray(value) ? value : [])
              : value || null
            }
            onFilesChange={(files) => {
              handleChange(field.name, files);
            }}
            accept={field.accept}
            multiple={field.multiple}
            fieldName={field.name}
            label={field.label.toLowerCase()}
          />
        );

      case 'checkbox':
        return (
          <label key={field.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              name={field.name}
              checked={Boolean(value)}
              onChange={handleFieldChange}
            />
            <span>{field.label}</span>
            {field.helpText && (
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {field.helpText}
              </span>
            )}
          </label>
        );

      case 'select':
        return (
          <SearchableSelect
            key={field.name}
            name={field.name}
            value={String(value)}
            onChange={(newValue) => handleChange(field.name, newValue)}
            options={field.options || []}
            placeholder={field.placeholder || `Выберите ${field.label.toLowerCase()}`}
            required={field.required}
            error={error}
          />
        );

      default:
        return (
          <input
            key={field.name}
            type={field.type}
            {...commonProps}
            value={String(value)}
            placeholder={field.placeholder}
            onChange={handleFieldChange}
            min={field.type === 'number' ? field.min : undefined}
            max={field.type === 'number' ? field.max : undefined}
            step={field.type === 'number' ? field.step : undefined}
            style={{
              width: '100%',
              padding: `${SPACING.MD} ${SPACING.LG}`,
              border: `1px solid ${error ? '#991b1b' : '#d1d5db'}`,
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.LG }}>
          {fields.map(field => (
            <div key={field.name} style={{ marginBottom: SPACING.LG }}>
              {field.type !== 'checkbox' && (
                <label
                  style={{
                    display: 'block',
                    marginBottom: SPACING.SM,
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {field.label}
                  {field.required && <span style={{ color: '#991b1b' }}>*</span>}
                </label>
              )}

              {renderField(field)}

              {errors[field.name] && (
                <div
                  style={{
                    marginTop: SPACING.XS,
                    fontSize: '12px',
                    color: '#991b1b',
                  }}
                >
                  {errors[field.name]}
                </div>
              )}

              {field.helpText && !errors[field.name] && field.type !== 'checkbox' && (
                <div
                  style={{
                    marginTop: SPACING.XS,
                    fontSize: '12px',
                    color: '#6b7280',
                  }}
                >
                  {field.helpText}
                </div>
              )}
            </div>
          ))}

          {customFields}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: SPACING.MD,
            marginTop: SPACING.XXL,
            paddingTop: SPACING.LG,
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <Button type="button" onClick={onClose} variant="ghost">
            Отмена
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {submitButtonText}
          </Button>
        </div>
      </form>
    </Modal>
  );
} 