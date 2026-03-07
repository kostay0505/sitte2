export type BlockType =
  | 'text_banner'
  | 'photo_left'
  | 'photo_right'
  | 'showcase'
  | 'photo_carousel'
  | 'contacts';

export interface TextBannerBlock {
  id: string;
  type: 'text_banner';
  title: string;
  text: string;
}

export interface PhotoLeftBlock {
  id: string;
  type: 'photo_left';
  title: string;
  text: string;
  photoUrl: string;
}

export interface PhotoRightBlock {
  id: string;
  type: 'photo_right';
  title: string;
  text: string;
  photoUrl: string;
}

export interface ShowcaseBlock {
  id: string;
  type: 'showcase';
  title: string;
  categoryId: string | null;
}

export interface PhotoCarouselBlock {
  id: string;
  type: 'photo_carousel';
  title: string;
  items: Array<{ url: string; mediaType: 'image' | 'video' }>;
}

export interface ContactsBlock {
  id: string;
  type: 'contacts';
  phone: string;
  email: string;
  address: string;
}

export type Block =
  | TextBannerBlock
  | PhotoLeftBlock
  | PhotoRightBlock
  | ShowcaseBlock
  | PhotoCarouselBlock
  | ContactsBlock;

export interface BusinessPage {
  id: string;
  userId: string;
  slug: string;
  blocks: Block[];
  createdAt?: string;
  updatedAt?: string;
}

export const BLOCK_TYPE_META: Record<BlockType, { label: string; description: string }> = {
  text_banner: {
    label: 'Баннер без фотографии',
    description: 'Информационный баннер с заголовком и текстом',
  },
  photo_left: {
    label: 'Баннер с фото слева',
    description: 'Фотография слева, заголовок и текст справа',
  },
  photo_right: {
    label: 'Баннер с фото справа',
    description: 'Заголовок и текст слева, фотография справа',
  },
  showcase: {
    label: 'Витрина',
    description: 'Карусель с товарами из выбранной категории',
  },
  photo_carousel: {
    label: 'Карусель фото',
    description: 'Заголовок и до 12 фотографий или видео',
  },
  contacts: {
    label: 'Контакты',
    description: 'Телефон, email и адрес для связи',
  },
};
