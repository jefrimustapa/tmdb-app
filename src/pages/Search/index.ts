import React from 'react';

export const SearchTV = React.lazy(() => import('./Search.tv').then(m => ({ default: m.Search })));
export const SearchMobile = React.lazy(() => import('./Search.mobile').then(m => ({ default: m.Search })));
