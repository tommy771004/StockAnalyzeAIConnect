/// <reference types="vite/client" />

import * as React from 'react';

declare module 'react' {
  export const ViewTransition: React.ComponentType<{
    children?: React.ReactNode;
    name?: string;
    default?: 'none' | 'auto';
    enter?: 'auto' | 'none' | string | Record<string, string>;
    exit?: 'auto' | 'none' | string | Record<string, string>;
    share?: 'auto' | 'none' | string | Record<string, string>;
  }>;
}