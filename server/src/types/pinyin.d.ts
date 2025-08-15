declare module 'pinyin' {
  interface PinyinOptions {
    style?: 'normal' | 'tone' | 'tone2' | 'to3ne' | 'initials' | 'first_letter' | 'passport' | number;
    heteronym?: boolean;
    segment?: boolean | string;
    group?: boolean;
  }

  function pinyin(text: string, options?: PinyinOptions): string[][];
  
  export = pinyin;
}
