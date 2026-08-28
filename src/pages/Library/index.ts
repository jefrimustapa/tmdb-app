import React from 'react';

export const LibraryTV = React.lazy(() => import('./Library.tv').then(m => ({ default: m.Library })));
export const LibraryMobile = React.lazy(() => import('./Library.mobile').then(m => ({ default: m.Library })));
