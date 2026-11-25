import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge<'typography'>({
  extend: {
    classGroups: {
      typography: [
        'type-display',
        'type-h1',
        'type-h2',
        'type-h3',
        'type-body',
        'type-body-medium',
        'type-body-sm',
        'type-caption',
        'type-caption-bold',
        'type-button',
        'type-stat',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
